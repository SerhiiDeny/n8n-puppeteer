FROM n8nio/n8n:1.107.4

USER root

# Chromium + зависимости (Debian base у официального образа)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    chromium ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 \
    libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# Ставим puppeteer-core в папку пользователя n8n
RUN mkdir -p /home/node/.n8n \
 && npm install --omit=dev --prefix /home/node/.n8n puppeteer-core@22

# Важные переменные окружения
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer-core,puppeteer \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-zygote --single-process"

USER node
WORKDIR /home/node
CMD ["n8n"]
