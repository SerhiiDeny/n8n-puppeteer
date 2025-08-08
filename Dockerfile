FROM node:20-bullseye

# Устанавливаем системные зависимости и Chromium
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
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
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Устанавливаем puppeteer-core и n8n
RUN npm install -g puppeteer-core n8n

# Устанавливаем рабочую директорию
WORKDIR /data
