FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

# Manifests first, so this layer is cached until deps change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Drop root before running anything
USER node

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.ts"]