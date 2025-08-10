FROM node:20-bullseye

USER root
RUN apt-get update && apt-get install -y chromium fonts-liberation && rm -rf /var/lib/apt/lists/*

RUN npm install -g n8n

RUN mkdir -p /home/node/.n8n && chown -R node:node /home/node
USER node
WORKDIR /home/node/.n8n

ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN printf '{\n  "name": "n8n-externals",\n  "version": "1.0.0"\n}\n' > package.json \
 && npm install puppeteer

RUN printf '{\n  "name": "n8n-externals",\n  "version": "1.0.0"\n}\n' > package.json \
  && npm install puppeteer

RUN npm install puppeteer --prefix /usr/local/lib/node_modules/n8n

ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV N8N_USER_FOLDER=/home/node/.n8n
ENV N8N_DIAGNOSTICS_ENABLED=false

EXPOSE 5678
CMD ["n8n"]

