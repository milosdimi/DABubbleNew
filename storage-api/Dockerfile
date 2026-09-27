# Alternative zur Volume-Variante in docker-compose.yml: fertiges Image bauen
# (z. B. per SSH auf dem NAS: docker build -t dabubble-storage-api .).
FROM node:22-alpine

WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src

USER node
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.js"]
