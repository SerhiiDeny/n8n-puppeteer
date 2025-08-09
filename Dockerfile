FROM node:20-bullseye

# 1) Системный Chromium и базовые шрифты
USER root
RUN apt-get update && apt-get install -y chromium fonts-liberation && rm -rf /var/lib/apt/lists/*

# 2) Устанавливаем n8n глобально
RUN npm install -g n8n

# 3) Папка данных n8n + внешние модули именно здесь
RUN mkdir -p /home/node/.n8n && chown -R node:node /home/node
USER node
WORKDIR /home/node/.n8n

# 4) Ставим puppeteer ВНУТРЬ папки данных n8n
#    и не скачиваем его встроенный Chromium (используем системный)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm init -y && npm install puppeteer

# 5) Переменные окружения по умолчанию
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV N8N_USER_FOLDER=/home/node/.n8n
ENV N8N_DIAGNOSTICS_ENABLED=false

EXPOSE 5678
CMD ["n8n"]
