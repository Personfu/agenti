// Runtime tests may reach only ephemeral loopback servers created in this process.
// This never supplies responses, fixtures, credentials or synthetic success bytes.
const net = require('node:net');
const { syncBuiltinESMExports } = require('node:module');
const ports = new Set();
let blocked = 0;
const loopback = host => ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host);
function deny() { blocked++; const error = new Error('Disposable test network boundary denied an unowned destination'); error.code = 'ERR_DISPOSABLE_NETWORK_DENIED'; throw error; }
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  const options = typeof args[0] === 'object' ? args[0] : { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
  if (Number(options.port) !== 0 || !loopback(options.host)) deny();
  let ownedPort;
  this.once('listening', () => { const address = this.address(); if (address && typeof address === 'object') { ownedPort = address.port; ports.add(ownedPort); } });
  this.once('close', () => { if (ownedPort !== undefined) ports.delete(ownedPort); });
  return listen.apply(this, args);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = first && typeof first === 'object' ? first : { port: first, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  const host = options.host ?? options.hostname ?? 'localhost';
  if (!loopback(host) || !ports.has(Number(options.port)) || options.path) deny();
  return connect.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = function(input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['http:', 'https:'].includes(url.protocol) || !loopback(url.hostname) || !ports.has(Number(url.port))) {
    try { deny(); } catch (error) { return Promise.reject(error); }
  }
  return fetch(input, init);
};
syncBuiltinESMExports();
process.once('exit', () => { process.stderr.write('DISPOSABLE_NETWORK_RECEIPT '+JSON.stringify({ node: process.version, blocked, ownedListeners: ports.size })+'\n'); });
