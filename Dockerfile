# Build frontend (SPA)
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Build server
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build

# Runtime: Express serves API, WebSocket, auth routes, and the SPA.
FROM node:20-alpine
WORKDIR /app
COPY --from=backend-builder /app/package*.json ./
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/dist ./frontend/dist
RUN npm ci --omit=dev

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.BACKEND_PORT || 3000) + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
