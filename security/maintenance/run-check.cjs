const { spawnSync } = require('node:child_process');
const { relative } = require('node:path');
const task = process.argv[2];
let args;
let kind = 'command';
let command = 'pnpm';
if (process.argv.length !== 3) throw new Error('Use exactly one reviewed task name');
switch (task) {
  case 'strict-install': args = ['install', '--frozen-lockfile', '--ignore-scripts', '--strict-peer-dependencies']; break;
  case 'peer-graph': args = ['install', '--resolution-only', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile', '--strict-peer-dependencies']; break;
  case 'lock-unchanged': command = 'git'; args = ['diff', '--quiet', '--', 'pnpm-lock.yaml', 'package.json', '**/package.json', 'pnpm-workspace.yaml', '.npmrc']; break;
  case 'audit': kind = 'audit'; args = ['audit', '--json']; break;
  case 'libraries-build': args = ['--recursive', '--filter', './packages/*', '--fail-if-no-match', 'build']; break;
  case 'test': kind = 'test'; args = ['exec', 'vitest', 'run', '--reporter=json']; break;
  case 'typecheck': args = ['--recursive', '--no-bail', '--fail-if-no-match', 'typecheck']; break;
  case 'web-typecheck': args = ['--filter', '@github-to-mcp/web', '--fail-if-no-match', 'exec', 'tsc', '--noEmit']; break;
  case 'lint': args = ['lint']; break;
  case 'web-build': args = ['--filter', '@github-to-mcp/web', '--fail-if-no-match', 'build']; break;
  default: throw new Error('Unknown maintenance task; arbitrary commands are not supported');
}
const started = Date.now();
const result = spawnSync(command, args, { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const stdout = result.stdout ?? '';
const stderr = result.stderr ?? '';
const evidence = { task, kind, exitCode: result.status, durationMs: Date.now() - started, node: process.version, rawOutputPersisted: false, errorCodes: [...new Set((stdout + '\n' + stderr).match(/\b(?:ERR_[A-Z_]+|TS\d{4})\b/g) ?? [])], networkReceipts: [...(stdout + '\n' + stderr).matchAll(/DISPOSABLE_NETWORK_RECEIPT (\{[^\n]+\})/g)].map(m => JSON.parse(m[1])) };
let exitCode = result.status ?? 1;
evidence.resolutionStepSkipped = /resolution step is skipped/i.test(stdout + '\n' + stderr);
if (task === 'peer-graph' && evidence.resolutionStepSkipped) {
  evidence.peerValidationError = 'Fresh resolver did not run; frozen headless success is not peer-graph proof';
  exitCode = 1;
}
if (result.error) evidence.launchError = result.error.code;
try {
  if (kind === 'audit') {
    const audit = JSON.parse(stdout);
    const counts = audit.metadata?.vulnerabilities;
    if (!counts || !Number.isInteger(counts.critical) || ![0, 1].includes(result.status)) throw new Error('Complete audit metadata unavailable');
    evidence.fullAuditCounts = counts;
    evidence.threshold = 'Critical only; nonzero high/moderate/low counts remain unresolved and are not clean-audit clearance';
    exitCode = counts.critical > 0 ? 1 : 0;
  }
  if (kind === 'test') {
    const first = stdout.indexOf('{');
    const last = stdout.lastIndexOf('}');
    if (first < 0 || last < first) throw new Error('No actual test result object');
    const tests = JSON.parse(stdout.slice(first, last + 1));
    evidence.tests = Object.fromEntries(['success', 'numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'].map(k => [k, tests[k]]));
    evidence.files = (tests.testResults ?? []).map(file => ({ path: relative(process.cwd(), file.name), status: file.status, assertions: file.assertionResults?.length ?? 0, failed: (file.assertionResults ?? []).filter(a => a.status === 'failed').length, failedAssertionIndexes: (file.assertionResults ?? []).flatMap((a,index) => a.status === 'failed' ? [index] : []) }));
    if (!evidence.networkReceipts.length || evidence.networkReceipts.some(r => r.blocked !== 0)) exitCode = 1;
    if (!tests.success || !Number.isInteger(tests.numTotalTests) || tests.numTotalTests === 0) exitCode = 1;
  }
} catch {
  evidence.resultMetadataError = 'Expected complete structured output is missing or invalid; details omitted';
  exitCode = 1;
}
evidence.finalExitCode = exitCode;
console.log(JSON.stringify(evidence));
process.exitCode = exitCode;
