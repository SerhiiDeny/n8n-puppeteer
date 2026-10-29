FROM ghcr.io/puppeteer/puppeteer:25.14.0@sha256:ced0f7e1b416fafb4166f9f9d26109ea7bbd7cb04b8a38ae8c14b61f364c3d6f

USER root
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN chown pptruser:pptruser /app
USER pptruser
ENV NODE_ENV=production \
    HOME=/home/pptruser \
    PORT=8080 \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
    PUPPETEER_SKIP_DOWNLOAD=true
COPY --chown=pptruser:pptruser package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=pptruser:pptruser server.js render-worker.js browser-health.js ./
COPY --chown=pptruser:pptruser assets ./assets
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "-s", "--"]
CMD ["node", "server.js"]
