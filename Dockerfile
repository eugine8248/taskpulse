# Multi-stage build: deps → build → minimal runtime.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY prisma ./prisma/
RUN npm install --include-workspace-root --workspaces

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run prisma:generate \
 && npm run build:client \
 && npm run build:server

# --- runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache tini sqlite

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
# Seed reports ship with the image — host volume mount overlays them in
# prod for the auto-watch flow.
COPY --from=builder /app/data ./data

RUN npm prune --omit=dev --workspaces --include-workspace-root \
 && npm cache clean --force

RUN mkdir -p /app/data /app/backups
VOLUME ["/app/data", "/app/backups"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/index.js"]
