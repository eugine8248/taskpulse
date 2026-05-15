# Multi-stage build: install deps, build client + server, then minimal runtime
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
RUN npm run prisma:generate
RUN npm run build:client
RUN npm run build:server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
# Seed reports ship with the image for the v0.1 Option-B reports flow.
COPY --from=builder /app/data ./data

# SQLite file lives here — bind-mount this dir from host to persist
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
