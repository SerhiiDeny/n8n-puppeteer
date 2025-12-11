# 1) Базовый образ n8n
FROM n8nio/n8n:1.120.4

USER root
SHELL ["/bin/sh", "-lc"]

# 2) Chromium + зависимости (поддержка Debian/Ubuntu ИЛИ Alpine)
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
    # На Alpine бинарь часто chromium-browser — создаём универсальную ссылку
    [ -f /usr/bin/chromium-browser ] && ln -sf /usr/bin/chromium-browser /usr/bin/chromium || true; \
  else \
    echo "Unsupported base image (no apt-get and no apk)"; exit 1; \
  fi

# 3) Правильная установка puppeteer-core в N8N_USER_FOLDER с package.json
ENV N8N_USER_FOLDER=/home/node/.n8n
RUN mkdir -p "$N8N_USER_FOLDER" && chown -R node:node "$N8N_USER_FOLDER"

USER node
WORKDIR /home/node/.n8n
RUN npm init -y \
 && npm install --omit=dev puppeteer-core@22

# 4) Переменные окружения для Code-ноды и Chromium
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer-core,puppeteer \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-zygote --single-process" \
    NODE_PATH=/home/node/.n8n/node_modules

# 5) Возврат к дефолту и запуск n8n
WORKDIR /home/node
CMD ["n8n"]

