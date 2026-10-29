import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';

export const LOGO_URL = 'https://raw.githubusercontent.com/SerhiiDeny/n8n-puppeteer/main/assets/Logo_PPF_Barcelona_negro.png';
export const CHROME_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'];

// Only the supervisor can send IPC. No caller-controlled launch/PDF options.
process.once('message', async ({ html, startup = false }) => {
  let browser;
  let result = { ok: false, error: 'render_failed' };
  let blocked = 0;
  let logoServed = 0;
  try {
    const logo = await readFile(new URL('./assets/Logo_PPF_Barcelona_negro.png', import.meta.url));
    // Puppeteer 25 executablePath is asynchronous. This path is shared by the
    // startup smoke test and real renders, under the same non-root user.
    const executablePath = await puppeteer.executablePath();
    browser = await puppeteer.launch({ executablePath, headless: true, args: CHROME_ARGS, timeout: startup ? 55000 : 30000 });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => {
      const allowed = request.url() === LOGO_URL;
      if (allowed) logoServed++; else blocked++;
      const handled = allowed
        ? request.respond({ status: 200, contentType: 'image/png', body: logo })
        : request.abort('blockedbyclient');
      handled.catch(() => {}); // Closing page: never log URLs or HTML.
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 0 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, timeout: 0 });
    result = { ok: true, pdf: Buffer.from(pdf).toString('base64'), blocked, logoServed, chromium: await browser.version() };
  } catch (error) {
    result = { ok: false, error: 'render_failed' };
    if (startup) result.diagnostic = { message: error.message, stack: error.stack };
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* Supervisor kills the process group on timeout. */ }
    }
  }
  if (process.connected) process.send(result, () => process.disconnect());
});
