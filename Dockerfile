FROM n8nio/n8n:latest

USER root

# Chromium + зависимости
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# Ставим puppeteer-core только в .n8n
RUN npm install --no-audit --no-fund --prefix /home/node/.n8n puppeteer-core@22

# Указываем переменные окружения
ENV NODE_FUNCTION_ALLOW_EXTERNAL=1 \
    NODE_FUNCTION_EXTERNAL_MODULES=puppeteer-core \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

USER node
WORKDIR /home/node/.n8n

EXPOSE 5678
CMD ["n8n"]
