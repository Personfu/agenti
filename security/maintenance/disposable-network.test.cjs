require('./disposable-network.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const net = require('node:net');
const http = require('node:http');
const { once } = require('node:events');
const denied = error => error.code === 'ERR_DISPOSABLE_NETWORK_DENIED';
test('remote fetch is denied before any request', async () => {
  await assert.rejects(fetch('https://example.invalid/'), denied);
});
test('raw remote socket is denied before connection', () => {
  assert.throws(() => new net.Socket().connect(443, '198.51.100.8'), denied);
});
test('unowned loopback service is denied', () => {
  assert.throws(() => new net.Socket().connect(27017, '127.0.0.1'), denied);
});
test('unspecified listener interfaces are denied', () => {
  assert.throws(() => net.createServer().listen(0), denied);
});
test('real disposable loopback response passes and closed port loses ownership', async () => {
  const server = http.createServer((req,res) => res.end('offline-fixture'));
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(await response.text(), 'offline-fixture');
  await new Promise(resolve => server.close(resolve));
  assert.throws(() => new net.Socket().connect(port, '127.0.0.1'), denied);
});
