import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { execFile, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startBrowserCheck, logHealthFailure } from './browser-health.js';

const MAX_BODY = 5 * 1024 * 1024;
const RENDER_MS = 45000;
const digest = value => createHash('sha256').update(value).digest();
const failure = (status, code) => Object.assign(new Error(code), { status, code });

function json(res, status, error) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok: false, error }));
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // Local tests only. Production kills the Linux process group.
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {});
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (e) {
      if (e.code !== 'ESRCH') child.kill('SIGKILL');
    }
  }
}

export function runBrowserJob(html, signal, startup = false) {
  return new Promise((resolve, reject) => {
    const env = {};
    for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'LANG', 'PUPPETEER_CACHE_DIR', 'PUPPETEER_EXECUTABLE_PATH']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const child = fork(fileURLToPath(new URL('./render-worker.js', import.meta.url)), [], {
      env, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let result;
    let error;
    const stop = reason => { error ??= reason; killTree(child); };
    const timer = setTimeout(() => stop(failure(504, startup ? 'browser_startup_timeout' : 'render_timeout')), startup ? 60000 : RENDER_MS);
    const abort = () => stop(failure(499, 'client_closed'));
    signal.addEventListener('abort', abort, { once: true });
    child.on('message', message => { result = message; });
    child.on('error', () => stop(failure(500, 'render_failed')));
    child.once('close', () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) return reject(error);
      if (!result?.ok) {
        const failed = failure(500, 'render_failed');
        if (startup && result?.diagnostic) {
          failed.message = result.diagnostic.message;
          failed.stack = result.diagnostic.stack;
        }
        return reject(failed);
      }
      const pdf = Buffer.from(result.pdf, 'base64');
      if (pdf.subarray(0, 5).toString() !== '%PDF-') return reject(failure(500, 'render_failed'));
      if (!startup) console.info(JSON.stringify({ event: 'render_complete', blocked_requests: result.blocked, bundled_logo_requests: result.logoServed }));
      resolve({ pdf, chromium: result.chromium });
    });
    if (signal.aborted) abort();
    else child.send({ html, startup }, err => { if (err) stop(failure(500, 'render_failed')); });
  });
}

export async function render(html, signal) {
  return (await runBrowserJob(html, signal)).pdf;
}

class Semaphore {
  active = 0;
  queue = [];
  async acquire(signal) {
    if (signal.aborted) throw failure(499, 'client_closed');
    if (this.active < 2) { this.active++; return; }
    if (this.queue.length >= 10) throw failure(503, 'queue_full');
    await new Promise((resolve, reject) => {
      const entry = { resolve: () => { signal.removeEventListener('abort', abort); resolve(); } };
      const abort = () => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) this.queue.splice(index, 1);
        reject(failure(499, 'client_closed'));
      };
      signal.addEventListener('abort', abort, { once: true });
      this.queue.push(entry);
    });
  }
  release() {
    const next = this.queue.shift();
    if (next) next.resolve(); else this.active--;
  }
}

async function body(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw failure(400, 'invalid_json');
  if (Number(req.headers['content-length']) > MAX_BODY) throw failure(413, 'body_too_large');
  const chunks = [];
  let size = 0;
  // Event listeners preserve the socket so chunked oversized bodies receive 413.
  const raw = await new Promise((resolve, reject) => {
    const clean = () => { req.removeListener('data', data); req.removeListener('end', end); req.removeListener('error', error); req.removeListener('aborted', aborted); };
    const error = () => { clean(); reject(failure(400, 'invalid_json')); };
    const aborted = () => { clean(); reject(failure(499, 'client_closed')); };
    const end = () => { clean(); resolve(Buffer.concat(chunks)); };
    const data = chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { clean(); req.resume(); reject(failure(413, 'body_too_large')); }
      else chunks.push(chunk);
    };
    req.on('data', data); req.once('end', end); req.once('error', error); req.once('aborted', aborted);
  });
  let value;
  try { value = JSON.parse(raw.toString('utf8')); } catch { throw failure(400, 'invalid_json'); }
  if (!value || Array.isArray(value) || typeof value.html !== 'string') throw failure(400, 'invalid_html');
  return value.html;
}

// Module-only injection for tests; never configurable via HTTP/environment.
export function createServer({ secret, chromium, health, renderer = render, logger = console.info } = {}) {
  const configured = typeof secret === 'string' && secret.length >= 32;
  const expected = configured ? digest(secret) : null;
  const slots = new Semaphore();
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      if (!configured) {
        logHealthFailure({ error: new Error('PDF render authentication is not configured') }, logger);
        return json(res, 500, 'not_configured');
      }
      const version = health ? health.chromium : chromium;
      if (!version) {
        logHealthFailure(health || { error: new Error('Chromium readiness has not been established') }, logger);
        return json(res, 503, health?.status === 'starting' ? 'browser_starting' : 'browser_unavailable');
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, chromium: version }));
    }
    if (req.method !== 'POST' || req.url !== '/render') return json(res, 404, 'not_found');
    if (!configured) return json(res, 503, 'not_configured');
    const supplied = req.headers['x-pdf-render-key'];
    if (typeof supplied !== 'string' || !timingSafeEqual(expected, digest(supplied))) return json(res, 401, 'unauthorized');
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', onClose);
    let acquired = false;
    try {
      const html = await body(req);
      await slots.acquire(controller.signal);
      acquired = true;
      const pdf = await renderer(html, controller.signal);
      if (!res.destroyed) {
        res.writeHead(200, {
          'Content-Type': 'application/pdf', 'Content-Length': pdf.length,
          'Content-Disposition': `attachment; filename="file-${Date.now()}.pdf"`,
          'Cache-Control': 'no-store',
        });
        res.end(pdf);
      }
    } catch (e) {
      json(res, e.status || 500, e.code || 'render_failed');
      req.resume();
    } finally {
      if (acquired) slots.release();
      res.removeListener('close', onClose);
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const health = { status: 'starting', chromium: null, attempt: 0, error: new Error('Chromium readiness check is in progress') };
  const server = createServer({ secret: process.env.PDF_RENDER_SHARED_SECRET, health });
  server.listen(Number(process.env.PORT || 8080), '::');
  void startBrowserCheck(health, () => runBrowserJob('<!doctype html><html><body>Readiness</body></html>', new AbortController().signal, true));
  process.once('SIGTERM', () => server.close());
}
