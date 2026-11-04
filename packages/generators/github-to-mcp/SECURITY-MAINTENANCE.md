# Generator dependency and release maintenance

This workspace parses repository and OpenAPI input, compiles templates and
generates executable MCP servers. Review the parser/compiler dependencies and
the dependencies emitted by generators. A scan of package.json files alone
does not inspect package manifests embedded in source templates.

## Reviewed security floors

- Next.js 16.4.5 fixes all seven November advisories; the maintained 15.5.29
  backport lists the three applicable advisories in its release notice.
- Vitest 4.0.x remains affected by the exposed UI-server file access/execution
  advisory. This candidate uses Vitest and coverage-v8 4.1.12 together, with
  compatible Vite 6.4.5. Merely upgrading from Vitest 1.x to 4.0.x is insufficient.
- Handlebars 4.7.10 includes fixes for the AST type-confusion bypass and own
  property-check bypass; 4.7.9 alone does not contain those later fixes.
- Express 5.2.1 declares proxy-addr ^2.0.7, which admits the patched 2.0.8.
  The candidate pins only that exact parent-child resolution. Its regression
  loads proxy-addr through the installed SDK/Express consumer, so an unrelated
  top-level copy cannot make the check pass.

Primary records: [Next 16.4.5](https://github.com/vercel/next.js/releases/tag/v16.4.5),
[Next 15.5.29](https://github.com/vercel/next.js/releases/tag/v15.5.29),
[Vitest advisory](https://github.com/advisories/GHSA-5xrq-8626-4rwp),
[Handlebars AST bypass](https://github.com/advisories/GHSA-8r5x-fm3f-whwj),
[Handlebars own-property bypass](https://github.com/advisories/GHSA-p8wg-vrv2-v86f),
[proxy trust advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).

## Validate the actual owner

Use this directory's pinned pnpm 10.23.0 and a supported, patched Node release.
The native workflow is configured to test Node 22.23.4 and 24.22.1; its
actual results remain merge requirements. Start with:

```sh
pnpm install --frozen-lockfile --ignore-scripts --strict-peer-dependencies
pnpm install --resolution-only --lockfile-only --ignore-scripts --no-frozen-lockfile --strict-peer-dependencies
git diff --quiet -- pnpm-lock.yaml package.json
pnpm --recursive --filter './packages/*' --fail-if-no-match build
pnpm exec vitest run
pnpm --recursive --no-bail --fail-if-no-match typecheck
pnpm --filter @github-to-mcp/web --fail-if-no-match exec tsc --noEmit
pnpm lint
pnpm --filter @github-to-mcp/web --fail-if-no-match build
pnpm audit --json
```

The security workflow keeps external services unavailable during runtime
validation. Only ephemeral loopback fixtures created by the test process are
allowed. Do not supply production credentials or use real model, signing,
payment or database operations to make a dependency test pass. Keep an optional
Vitest UI server off public interfaces.

## Current review limits

The candidate's full audit reports 0 critical, 69 high, 66 moderate and 8 low
findings. That is not a clean full audit or a portfolio/deployment attestation.
Eight actual dependency security contracts pass, but the complete configured
suite still has failing integration assertions and the typechecks remain red.
Earlier startup and assertion failures remain in the review evidence. No
existing assertions, timeouts, retries or skip declarations were relaxed.

Three existing library builds disable declaration output and the registry
manifest names a declaration file the build does not emit. Repair and inspect
the files consumers actually import before publishing. A successful JavaScript
bundle command does not establish usable TypeScript artifacts.

Other nested workspaces retain strict peer conflicts. They remain merge
blockers and are tested independently; do not bypass them with legacy peer
mode or incompatible overrides. Keep old framework migrations, unlocked/Bun
projects, generated templates, browser/Electron rollout and production
deployments on their own evidence-backed backlog.

A paired pnpm10.7.0 control accepted frozen metadata but rejected the freshly
resolved peer graph. Both modes are mandatory in CI, and changed authoritative
files require review. The first native Linux22/24 runs passed all eight new
security contracts but failed the complete suite at329passed/12failed/0skips.
Those failures remain blockers; they are not replaced by the audit result.
