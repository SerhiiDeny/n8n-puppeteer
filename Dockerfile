# 1) Base image
FROM n8nio/n8n:1.123.5

USER root
SHELL ["/bin/sh", "-lc"]

# 2) Chromium + dependencies
RUN set -eux; \
  if command -v apt-get >/dev/null 2>&1; then \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 \
      libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
      libxdamage1 libxrandr2 xdg-utils; \
    rm -rf /var/lib/apt/lists/*; \
  elif command -v apk >/dev/null 2>&1; then \
    apk add --no-cache \
      chromium nss freetype harfbuzz ca-certificates ttf-freefont; \
    [ -f /usr/bin/chromium-browser ] && ln -sf /usr/bin/chromium-browser /usr/bin/chromium || true; \
  else \
    exit 1; \
  fi

# 3) Install puppeteer-core into VALID npm folder
RUN mkdir -p /opt/puppeteer \
 && chown -R node:node /opt/puppeteer

USER node
WORKDIR /opt/puppeteer

RUN npm init -y \
 && npm install --omit=dev puppeteer-core@22

# 4) Env vars for n8n Code node
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer-core,puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-zygote --single-process"
ENV NODE_PATH=/opt/puppeteer/node_modules

# 5) Back to n8n
WORKDIR /home/node
CMD ["n8n"]
