# 1) Базовый образ n8n
FROM n8nio/n8n:1.107.4

USER root
SHELL ["/bin/sh", "-lc"]

# 2) Установка Chromium и либ
#    Поддерживаем оба варианта: Debian/Ubuntu (apt-get) ИЛИ Alpine (apk)
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
      # на Alpine бинарь обычно chromium-browser — создаем универсальную ссылку
      [ -f /usr/bin/chromium-browser ] && ln -sf /usr/bin/chromium-browser /usr/bin/chromium || true; \
    else \
      echo "Unsupported base image (no apt-get and no apk)"; exit 1; \
    fi

# 3) Ставим именно puppeteer-core в папку пользователя n8n
RUN mkdir -p /home/node/.n8n \
 && npm install --omit=dev --prefix /home/node/.n8n puppeteer-core@22

# 4) Важные переменные окружения (для узлов Function/Code)
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer-core,puppeteer \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-zygote --single-process"

USER node
WORKDIR /home/node
CMD ["n8n"]
