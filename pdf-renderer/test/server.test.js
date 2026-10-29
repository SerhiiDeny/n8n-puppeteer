import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { createServer } from '../server.js';
import { startBrowserCheck } from '../browser-health.js';

async function fixture(t, options = {}) {
  const secret = randomBytes(32).toString('hex');
  const server = createServer({ secret, chromium: 'test-browser', logger: () => {}, ...options });
  await new Promise(resolve => server.listen(0, '::', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://[::1]:${server.address().port}`;
  const post = (body = '{"html":"hello"}', headers = {}) => fetch(url + '/render', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PDF-Render-Key': secret, ...headers }, body,
  });
  return { server, url, secret, post };
}

test('health is unauthenticated; bad configuration fails closed', async t => {
  const normal = await fixture(t);
  const good = await fetch(normal.url + '/health');
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), { ok: true, chromium: 'test-browser' });
  for (const secret of [undefined, '', 'x'.repeat(31)]) {
    const bad = await fixture(t, { secret });
    assert.equal((await fetch(bad.url + '/health')).status, 500);
    assert.equal((await bad.post()).status, 503);
  }
});

test('missing and wrong keys return 401 before body parsing or rendering', async t => {
  let calls = 0;
  const f = await fixture(t, { renderer: () => { calls++; } });
  for (const headers of [{}, { 'X-PDF-Render-Key': 'wrong' }]) {
    const response = await fetch(f.url + '/render', { method: 'POST', headers, body: 'not JSON' });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'unauthorized' });
  }
  assert.equal(calls, 0);
});

test('invalid JSON, MIME type and html types return 400', async t => {
  const f = await fixture(t, { renderer: () => assert.fail('must not render') });
  for (const body of ['bad JSON', '{}', 'null', '[]', '{"html":32}']) assert.equal((await f.post(body)).status, 400);
  assert.equal((await f.post('{"html":"x"}', { 'Content-Type': 'text/plain' })).status, 400);
});

test('oversized Content-Length and streamed body return 413', async t => {
  const f = await fixture(t, { renderer: () => assert.fail('must not render') });
  const body = JSON.stringify({ html: 'x'.repeat(5 * 1024 * 1024) });
  assert.equal((await f.post(body)).status, 413);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(f.url + '/render', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-PDF-Render-Key': f.secret, 'Transfer-Encoding': 'chunked',
    } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    for (let i = 0; i < body.length; i += 65536) req.write(body.slice(i, i + 65536));
    req.end();
  });
  assert.equal(status, 413);
});

test('only html is passed to renderer; binary filename and content type are fixed', async t => {
  let received;
  const f = await fixture(t, { renderer: async html => { received = html; return Buffer.from('%PDF-test'); } });
  const response = await f.post(JSON.stringify({ html: 'safe', options: { path: '/tmp/injected', format: 'Letter' }, executablePath: 'injected' }));
  assert.equal(response.status, 200);
  assert.equal(received, 'safe');
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="file-\d+\.pdf"$/);
  assert.equal(await response.text(), '%PDF-test');
});

test('render errors are short JSON and do not echo input', async t => {
  const f = await fixture(t, { renderer: async () => { throw new Error('sensitive html'); } });
  const response = await f.post();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: 'render_failed' });
});

test('two active plus ten queued; thirteenth request is rejected and queue drains', async t => {
  const waiting = [];
  let calls = 0;
  let active = 0;
  let maximum = 0;
  const f = await fixture(t, { renderer: async () => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => waiting.push(resolve));
    active--; return Buffer.from('%PDF-test');
  } });
  const requests = Array.from({ length: 12 }, () => f.post());
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(calls, 2);
  assert.equal((await f.post()).status, 503);
  for (let i = 0; i < 6; i++) {
    waiting.splice(0).forEach(resolve => resolve());
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.deepEqual((await Promise.all(requests)).map(r => r.status), Array(12).fill(200));
  assert.equal(maximum, 2);
});

test('wrong path produces a non-success response', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.url + '/wrong')).status, 404);
});

test('startup retries transient failures and exposes readiness only after success', async t => {
  const logs = [];
  const health = { status: 'starting', chromium: null, error: new Error('cold start') };
  const f = await fixture(t, { health, logger: line => logs.push(JSON.parse(line)) });
  assert.equal((await fetch(f.url + '/health')).status, 503);
  let calls = 0;
  const failed = new Error('synthetic launch failure');
  await startBrowserCheck(health, async () => {
    if (++calls < 3) throw failed;
    return { chromium: 'Chrome/test' };
  }, { retryDelay: 1, logger: line => logs.push(JSON.parse(line)) });
  assert.equal(calls, 3);
  assert.equal(health.status, 'ready');
  assert.equal((await fetch(f.url + '/health')).status, 200);
  const failures = logs.filter(row => row.event === 'chromium_startup_failed');
  assert.equal(failures.length, 2);
  assert.ok(failures.every(row => row.message === failed.message && row.stack === failed.stack));
});

test('terminal startup failure retains full diagnostics on every health failure', async t => {
  const logs = [];
  const health = { status: 'starting', chromium: null };
  const error = new Error('synthetic missing executable');
  await startBrowserCheck(health, async () => { throw error; }, { retryDelay: 1, logger: line => logs.push(JSON.parse(line)) });
  assert.equal(health.status, 'unavailable');
  const f = await fixture(t, { health, logger: line => logs.push(JSON.parse(line)) });
  for (let i = 0; i < 2; i++) {
    const response = await fetch(f.url + '/health');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'browser_unavailable' });
  }
  assert.equal(logs.filter(row => row.event === 'chromium_startup_failed').length, 3);
  const failures = logs.filter(row => row.event === 'chromium_health_failed');
  assert.equal(failures.length, 2);
  assert.ok(failures.every(row => row.message === error.message && row.stack === error.stack));
});
