import { setTimeout as delay } from 'node:timers/promises';

// These errors come only from the fixed startup HTML and a browser process whose
// environment excludes application credentials. Never use this logger on caller HTML.
function diagnostic(error) {
  return { message: error?.message || String(error), stack: error?.stack || String(error) };
}

export function logHealthFailure(health, logger = console.info) {
  logger(JSON.stringify({ event: 'chromium_health_failed', status: health.status || 'unavailable', attempt: health.attempt || 0, ...diagnostic(health.error) }));
}

export async function startBrowserCheck(health, run, { attempts = 3, retryDelay = 5000, logger = console.info } = {}) {
  health.status = 'starting';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    health.attempt = attempt;
    try {
      const result = await run();
      if (!result.chromium) throw new Error('Chromium started without a version result');
      health.chromium = result.chromium;
      health.status = 'ready';
      health.error = null;
      logger(JSON.stringify({ event: 'chromium_ready', attempt, chromium: result.chromium }));
      return;
    } catch (error) {
      health.error = error;
      logger(JSON.stringify({ event: 'chromium_startup_failed', attempt, ...diagnostic(error) }));
      if (attempt < attempts) await delay(retryDelay);
    }
  }
  health.status = 'unavailable';
}
