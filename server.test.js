'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { server } = require('./server');

function call(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ port, method, path, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: raw ? (res.headers['content-type'].includes('json') ? JSON.parse(raw) : raw) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('storefront API', async (t) => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const { port } = server.address();

  await t.test('health, info and page', async () => {
    assert.strictEqual((await call(port, 'GET', '/healthz')).status, 200);
    assert.strictEqual((await call(port, 'GET', '/readyz')).status, 200);
    const info = await call(port, 'GET', '/api/info');
    assert.strictEqual(info.body.app, 'demo-store');
    assert.match((await call(port, 'GET', '/')).body, /Storefront/);
  });

  await t.test('lists products', async () => {
    const res = await call(port, 'GET', '/api/products');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.products.length >= 6);
  });

  await t.test('checkout reduces stock and totals the order', async () => {
    const before = (await call(port, 'GET', '/api/products')).body.products.find((p) => p.id === 'p-100').stock;
    const res = await call(port, 'POST', '/api/checkout', { items: [{ id: 'p-100', quantity: 2 }, { id: 'p-101', quantity: 1 }] });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.order.total, 62.5);
    const after = (await call(port, 'GET', '/api/products')).body.products.find((p) => p.id === 'p-100').stock;
    assert.strictEqual(after, before - 2);
  });

  await t.test('rejects bad input', async () => {
    assert.strictEqual((await call(port, 'POST', '/api/checkout', {})).status, 400);
    assert.strictEqual((await call(port, 'POST', '/api/checkout', { items: [{ id: 'nope', quantity: 1 }] })).status, 400);
    assert.strictEqual((await call(port, 'POST', '/api/checkout', { items: [{ id: 'p-100', quantity: 0 }] })).status, 400);
    assert.strictEqual((await call(port, 'POST', '/api/checkout', { items: [{ id: 'p-100', quantity: 1.5 }] })).status, 400);
  });

  await t.test('refuses more than the stock', async () => {
    const res = await call(port, 'POST', '/api/checkout', { items: [{ id: 'p-105', quantity: 10 }] });
    assert.strictEqual(res.status, 409);
    const left = (await call(port, 'GET', '/api/products')).body.products.find((p) => p.id === 'p-105').stock;
    assert.strictEqual(left, 8);
  });

  await t.test('unknown route is 404', async () => {
    assert.strictEqual((await call(port, 'GET', '/nope')).status, 404);
  });
});
