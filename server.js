'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const pkg = require('./package.json');

const PORT = Number(process.env.PORT) || 8080;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_LINES = 20;
const MAX_QTY = 10;

const catalog = [
  { id: 'p-100', name: 'Canvas Tote', price: 24.0, stock: 40 },
  { id: 'p-101', name: 'Ceramic Mug', price: 14.5, stock: 25 },
  { id: 'p-102', name: 'Linen Notebook', price: 18.0, stock: 60 },
  { id: 'p-103', name: 'Desk Plant', price: 32.0, stock: 12 },
  { id: 'p-104', name: 'Steel Bottle', price: 26.5, stock: 30 },
  { id: 'p-105', name: 'Wool Throw', price: 79.0, stock: 8 }
];
const stock = new Map(catalog.map((p) => [p.id, p.stock]));
const orders = [];

const info = {
  title: 'Storefront',
  app: pkg.name,
  version: pkg.version,
  build: (process.env.GIT_SHA || 'local').slice(0, 7),
  pod: os.hostname(),
  startedAt: new Date().toISOString()
};

const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

function log(event, fields) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), app: pkg.name, event, ...fields }) + '\n');
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function products() {
  return catalog.map((p) => ({ id: p.id, name: p.name, price: p.price, stock: stock.get(p.id) }));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function checkout(body) {
  const lines = body && body.items;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) {
    return { status: 400, error: `Add between 1 and ${MAX_LINES} items.` };
  }
  const wanted = new Map();
  for (const line of lines) {
    const qty = line && line.quantity;
    if (!line || typeof line.id !== 'string' || !stock.has(line.id) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return { status: 400, error: `Each item needs a known product and a quantity from 1 to ${MAX_QTY}.` };
    }
    wanted.set(line.id, (wanted.get(line.id) || 0) + qty);
  }
  for (const [id, qty] of wanted) {
    if (qty > stock.get(id)) {
      const name = catalog.find((p) => p.id === id).name;
      return { status: 409, error: `Only ${stock.get(id)} left of ${name}.` };
    }
  }
  let total = 0;
  const receipt = [];
  for (const [id, qty] of wanted) {
    const product = catalog.find((p) => p.id === id);
    stock.set(id, stock.get(id) - qty);
    total += product.price * qty;
    receipt.push({ id, name: product.name, quantity: qty, price: product.price });
  }
  const order = { id: 'o-' + crypto.randomBytes(4).toString('hex'), items: receipt, total: Math.round(total * 100) / 100, placedAt: new Date().toISOString() };
  orders.push(order);
  return { status: 201, order };
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = req.url.split('?')[0];
  res.on('finish', () => log('request', { method: req.method, path: url, status: res.statusCode, ms: Date.now() - started }));
  try {
    if (req.method === 'GET' && (url === '/healthz' || url === '/readyz')) return send(res, 200, 'ok', 'text/plain');
    if (req.method === 'GET' && url === '/api/info') return send(res, 200, info);
    if (req.method === 'GET' && url === '/api/products') return send(res, 200, { products: products() });
    if (req.method === 'GET' && url === '/api/orders') return send(res, 200, { orders: orders.slice(-10).reverse() });
    if (req.method === 'POST' && url === '/api/checkout') {
      const result = checkout(await readJson(req));
      return result.order ? send(res, result.status, { order: result.order }) : send(res, result.status, { error: result.error });
    }
    if (req.method === 'GET' && url === '/') return send(res, 200, page, 'text/html; charset=utf-8');
    return send(res, 404, { error: 'Not found.' });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) log('error', { message: err.message });
    return send(res, status, { error: status === 500 ? 'Something went wrong.' : err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => log('listening', { port: PORT, version: pkg.version }));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { server, checkout, products, stock };
