# 1) Base image (n8n)
FROM n8nio/n8n:1.123.5

USER root
SHELL ["/bin/sh", "-lc"]

# 2) Chromium + dependencies (Debian/Ubuntu or Alpine)
RUN set -eux; \
  if command -v apt-get >/dev/null 2>&1; then \
    echo "Debian/Ubuntu base detected"; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 \
      libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
      libxdamage1 libxrandr2 xdg-utils; \
    rm -rf /var/lib/apt/lists/*; \
  elif command -v apk >/dev/null 2>&1; then \
    echo "Alpine base detected"; \
    apk add --no-cache \
      chromium nss freetype harfbuzz ca-certificates ttf-freefont; \
    [ -f /usr/bin/chromium-browser ] && ln -sf /usr/bin/chromium-browser /usr/bin/chromium || true; \
  else \
    echo "Unsupported base image (no apt-get and no apk)"; exit 1; \
  fi

# 3) Install puppeteer-core into a VALID folder (IMPORTANT)
#    The old failure was because npm init ran inside /home/node/.n8n -> invalid package name ".n8n"
RUN mkdir -p /opt/puppeteer \
 && chown -R node:node /opt/puppeteer

USER node
WORKDIR /opt/puppeteer

RUN npm init -y \
 && npm install --omit-dev puppeteer-core@22

# 4) Env for n8n Code/Function nodes to resolve puppeteer
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer-core,puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-zygote --single-process"
ENV NODE_PATH=/opt/puppeteer/node_modules

# 5) Back to default start
WORKDIR /home/node
CMD ["n8n"]
