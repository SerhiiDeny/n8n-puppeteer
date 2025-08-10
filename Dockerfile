FROM node:20-bullseye

# Устанавливаем Chromium и зависимости
USER root
RUN apt-get update && apt-get install -y chromium fonts-liberation && rm -rf /var/lib/apt/lists/*

# Устанавливаем n8n глобально
RUN npm install -g n8n

# Создаём рабочую директорию
RUN mkdir -p /home/node/.n8n && chown -R node:node /home/node
USER node
WORKDIR /home/node/.n8n

# Отключаем авто-скачивание Chromium при установке Puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Устанавливаем Puppeteer в локальные зависимости пользователя node
RUN printf '{\n  "name": "n8n-externals",\n  "version": "1.0.0"\n}\n' > package.json \
 && npm install puppeteer

# Повторная установка Puppeteer для совместимости
RUN printf '{\n  "name": "n8n-externals",\n  "version": "1.0.0"\n}\n' > package.json \
 && npm install puppeteer

# Устанавливаем Puppeteer прямо в node_modules n8n с правами root
USER root
RUN mkdir -p /usr/local/lib/node_modules/n8n \
 && npm install puppeteer --unsafe-perm=true --allow-root --prefix /usr/local/lib/node_modules/n8n
USER node

# Переменные окружения для n8n
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV N8N_USER_FOLDER=/home/node/.n8n
ENV N8N_DIAGNOSTICS_ENABLED=false

EXPOSE 5678
CMD ["n8n"]
