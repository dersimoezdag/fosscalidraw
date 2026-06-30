FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/20-wait-for-backend-health.sh /docker-entrypoint.d/20-wait-for-backend-health.sh
RUN chmod +x /docker-entrypoint.d/20-wait-for-backend-health.sh
ENV BACKEND_URI=http://backend:3001
ENV NGINX_ENVSUBST_FILTER="^BACKEND_URI$"
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -fsS http://127.0.0.1/health >/dev/null || exit 1
