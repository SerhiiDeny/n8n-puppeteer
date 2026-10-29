# Private PDF renderer

Phase A of SEC-03.11 / T-31. Root Dockerfile remains the existing n8n image until the owner accepts Phase C.

Deploy this directory from branch `codex/sec-03.11-pdf-renderer` as Railway service `pdf-renderer`, production environment, root directory `/pdf-renderer`, healthcheck `/health` with a 240-second timeout, port 8080. Do not generate a public domain. The owner sets `PDF_RENDER_SHARED_SECRET` (at least 32 characters) in Railway and the same value in the n8n Header Auth credential `PDF Render Key`, header `X-PDF-Render-Key`. Never put the value in files or commands.

The base image is the official Puppeteer 25.14.0 image pinned by digest, with matching Puppeteer and Chrome for Testing. `npm ci` installs the locked dependency tree without lifecycle scripts or another browser download. The runtime user is `pptruser`; tini is PID 1 and reaps orphan descendants. No SYS_ADMIN capability is needed because this explicitly authorized renderer uses `--no-sandbox`.

`GET /health` returns `{ "ok": true, "chromium": "<version>" }`. Missing/short secret returns HTTP 500 on health and 503 on render, preventing a deployment becoming healthy without its key. Readiness launches Chromium and renders a fixed page through the same isolated worker as PDF requests. It awaits Puppeteer's asynchronous executable path. Three attempts allow 60 seconds each, with five seconds between attempts; health returns 503 until an attempt succeeds. Each startup failure and each unhealthy health request logs the full message and stack to stdout. The worker receives only an allowlisted environment without the shared secret. HOME and the browser cache belong to the non-root runtime user.

`POST /render` requires the key and `Content-Type: application/json`, with `{ "html": "..." }`. The limit is 5 MiB (5,242,880 bytes). Other fields are ignored. Authentication compares SHA256 digests in constant time before body processing. No HTML, header values or URLs are logged.

Every request gets a new Chromium process. JavaScript is disabled. Only the exact PPF logo URL is answered from the bundled PNG; every other intercepted request is aborted. PDF settings are fixed A4 with print backgrounds. The response is application/pdf with `attachment; filename="file-<timestamp>.pdf"`.

Two renders run concurrently, with ten pending slots. Overflow returns 503. A separate Node worker places Chromium and its children in their own Linux process group; the supervisor kills that group after 45 seconds and returns 504. The deadline covers launch, rendering and cleanup. Normal paths close the browser in finally. A disconnected client cancels its render or leaves the queue. Error responses use `{ "ok": false, "error": "short_code" }`.

Run `npm ci --ignore-scripts` then `npm test` for HTTP contract/concurrency tests. Integration verification must additionally use the matching browser and test a real multi-page PDF, logo, Unicode, blocked network traffic and the full 45-second watchdog. Unit tests do not establish production deployment success.

Private caller URL: `http://pdf-renderer.railway.internal:8080/render`. Bind host is `::` for Railway IPv6. Keep the HTTP node timeout at 60000 and stop on error. Preserve the prior binary base64 contract; verify with live n8n before changing WF-QE-05. No synthetic execution of the client-facing workflow is allowed.

Rollback before Phase C: restore the saved WF-QE-05 export through the guard. After Phase C: restore Primary's recorded custom-image deployment first, confirm health, and only revert the workflow if the renderer is broken. Never merge this branch to main until Phase C is accepted.
