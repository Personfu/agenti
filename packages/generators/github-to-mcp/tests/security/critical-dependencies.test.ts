import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Resolve through the actual SDK -> Express consumer, never an unrelated
// top-level copy. All addresses are synthetic documentation/test inputs.
const serverRequire = createRequire(new URL('../../packages/mcp-server/package.json', import.meta.url));
const sdkRequire = createRequire(serverRequire.resolve('@modelcontextprotocol/sdk/server/index.js'));
const expressRequire = createRequire(sdkRequire.resolve('express'));
const proxyAddr = expressRequire('proxy-addr') as {
  (request: { headers: Record<string, string>; connection: { remoteAddress: string } }, trust: string[]): string;
  compile(trust: string[]): (address: string) => boolean;
};

describe('proxy-addr mapped subnet trust boundary (CVE-2026-90711)', () => {
  it('rejects unrelated IPv4 and mapped addresses for an invalid short mapped prefix', () => {
    const trust = proxyAddr.compile(['::ffff:10.0.0.0/8']);
    for (const address of ['203.0.113.9', '10.0.0.1', '::ffff:203.0.113.9', '::1']) {
      expect(trust(address)).toBe(false);
    }
  });

  it('preserves valid mapped and plain IPv4 subnet behavior', () => {
    for (const subnet of ['::ffff:10.0.0.0/104', '10.0.0.0/8']) {
      const trust = proxyAddr.compile([subnet]);
      expect(trust('10.0.0.1')).toBe(true);
      expect(trust('::ffff:10.0.0.1')).toBe(true);
      expect(trust('203.0.113.9')).toBe(false);
      expect(trust('::1')).toBe(false);
    }
  });

  it('keeps the mapped prefix boundary explicit', () => {
    expect(proxyAddr.compile(['::ffff:0.0.0.0/95'])('203.0.113.9')).toBe(false);
    expect(proxyAddr.compile(['::ffff:0.0.0.0/96'])('203.0.113.9')).toBe(true);
  });

  it('retains legitimate native IPv6 matching', () => {
    const trust = proxyAddr.compile(['2001:db8::/32']);
    expect(trust('2001:db8::1')).toBe(true);
    expect(trust('::1')).toBe(false);
    expect(trust('203.0.113.9')).toBe(false);
  });

  it('ignores forwarded identity claims from an untrusted socket peer', () => {
    for (const peer of ['127.0.0.1', '::ffff:203.0.113.9']) {
      const request = { headers: { 'x-forwarded-for': '198.51.100.8' }, connection: { remoteAddress: peer } };
      expect(proxyAddr(request, ['::ffff:10.0.0.0/8'])).toBe(peer);
    }
  });
});

const parserRequire = createRequire(new URL('../../packages/openapi-parser/package.json', import.meta.url));
const handlebars = parserRequire('handlebars') as {
  parse(source: string): unknown;
  compile(source: unknown): (context: Record<string, unknown>, options?: Record<string, unknown>) => string;
};

describe('Handlebars AST and constructor boundaries (October 2026 fixes)', () => {
  it('accepts a genuine numeric AST and rejects inert string data in its numeric slot', () => {
    const ast = handlebars.parse('{{echo 1}}') as { body: { params: { type: string; value: unknown }[] }[] };
    const options = { helpers: { echo: (value: unknown) => value } };
    expect(handlebars.compile(ast)({}, options)).toBe('1');
    expect(ast.body[0].params[0].type).toBe('NumberLiteral');
    // A numeric string is deliberately inert: exercise the type-confusion
    // boundary without executing any injected code or shell operation.
    ast.body[0].params[0].value = '2';
    expect(() => handlebars.compile(ast)({}, options)).toThrow(/Invalid AST: NumberLiteral value must be a number/);
  });

  it('blocks prototype constructor lookup even with the isolated permissive compatibility option', () => {
    const template = handlebars.compile('{{lookup (lookup fn "__proto__") "constructor"}}');
    expect(template({ fn() {} }, { allowProtoMethodsByDefault: true })).toBe('');
  });

  it('retains legitimate own constructor-shaped data', () => {
    const template = handlebars.compile('{{constructor.name}}');
    expect(template({ constructor: { name: 'offline-fixture' } })).toBe('offline-fixture');
  });
});
