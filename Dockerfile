# 1) Base image
FROM n8nio/n8n:1.123.5

USER root
SHELL ["/bin/sh", "-lc"]

# 2) Chromium + deps
RUN set -eux; \
  if command -v apt-get >/dev/null 2>&1; then \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 \
      libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
      libxdamage1 libxrandr2 xdg-utils; \
    rm -rf /var/lib/apt/lists/*; \
  else \
    apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont; \
    ln -sf /usr/bin/chromium-browser /usr/bin/chromium || true; \
  fi

# 3) GLOBAL puppeteer-core (ВАЖНО)
RUN npm install -g puppeteer-core@22

# 4) Env for n8n
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer-core,puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-zygote --single-process"

USER node
WORKDIR /home/node
CMD ["n8n"]
