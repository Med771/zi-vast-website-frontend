# Статика + минимальный Node HTTP (без npm install в рантайме)
FROM node:22-alpine

WORKDIR /app

COPY server.js index.html app.js checker.js style.css logo.png ./

ENV NODE_ENV=production
ENV PORT=3847

EXPOSE 3847

USER node

CMD ["node", "server.js"]
