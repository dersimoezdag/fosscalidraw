#!/bin/sh
set -eu

backend_uri="${BACKEND_URI:-http://backend:3001}"
backend_health_url="${BACKEND_HEALTH_URL:-${backend_uri}/health}"
max_attempts="${BACKEND_HEALTH_RETRIES:-20}"
delay_seconds="${BACKEND_HEALTH_RETRY_DELAY_SECONDS:-3}"

echo "[startup] Checking backend health before starting frontend: ${backend_health_url}"

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  response_file="/tmp/fosscalidraw-backend-health-response"
  status_code="$(curl -sS -m 5 -o "$response_file" -w "%{http_code}" "$backend_health_url" || true)"

  if [ "$status_code" = "200" ]; then
    echo "[startup] Backend health check passed."
    cat "$response_file" || true
    rm -f "$response_file"
    echo "[startup] Validating frontend nginx configuration..."
    nginx -t
    echo "[startup] Frontend nginx configuration is valid."
    exit 0
  fi

  echo "[startup] Backend health check failed (${attempt}/${max_attempts}), HTTP status: ${status_code:-unreachable}"
  if [ -s "$response_file" ]; then
    echo "[startup] Backend response:"
    cat "$response_file" || true
  fi

  rm -f "$response_file"
  attempt=$((attempt + 1))
  sleep "$delay_seconds"
done

echo "[startup] Frontend startup failed. Backend did not become healthy at ${backend_health_url} after ${max_attempts} attempts."
exit 1
