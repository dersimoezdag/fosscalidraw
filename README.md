# FOSScalidraw

> A fully open-source, self-hostable collaborative whiteboard — built on the Excalidraw canvas engine.

## Features

- 🎨 **Excalidraw canvas** (MIT) — powerful, familiar drawing experience
- 🔐 **Auth.js v5** — OAuth (Google, GitHub) or federated OIDC (plug in your own management app)
- 🤝 **Real-time collaboration** — Yjs CRDT via own WebSocket server (replaces excalidraw-room)
- 💾 **MongoDB persistence** — boards never lost on server restart (y-mongodb-provider)
- 🏠 **100% self-hostable** — Docker Compose included
- 📋 **Board management** — create, share, manage permissions

## Quick Start

```bash
cp .env.example .env
# Change AUTH_SECRET and MONGO_ROOT_PASSWORD.
# Fill in your OAuth/OIDC credentials, or use development OIDC locally.
docker compose up
```

Open http://localhost:3000

## Architecture

```
frontend/   ← React app (Excalidraw fork shell)
backend/    ← Express + Auth.js + Yjs WS + SPA serving (single port)
mongo/      ← MongoDB persistence
```

The backend serves the SPA build directly — no separate web server container needed.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Auth Modes

### Standalone (default)
Configure Google/GitHub OAuth directly in `.env`.

### Federated (external management app)
Set `AUTH_OIDC_ISSUER` in `.env` to delegate auth to your own OIDC provider.

### Development OIDC simulation
For local development only, set:

```env
NODE_ENV=development
AUTH_DEV_OIDC=true
VITE_DEV_OIDC=true
```

This exposes `/auth/dev/signin`. The backend refuses this mode when `NODE_ENV=production`.

## Production Checklist

Before exposing FOSScalidraw publicly:

- Use `.env.production.example` as a starting point.
- Set `NODE_ENV=production`.
- Use an HTTPS `APP_URL`.
- Set a strong `AUTH_SECRET` with at least 32 random characters.
- Configure at least one complete auth provider: Google, GitHub, or OIDC.
- Keep `AUTH_DEV_OIDC=false` and `VITE_DEV_OIDC=false`.
- Set a strong `MONGO_ROOT_PASSWORD`, or use a managed MongoDB URI.
- Put a TLS reverse proxy in front of the container.
- Keep regular MongoDB backups of the `mongo_data` volume or managed database.

The backend validates the most important production settings on startup and exits on unsafe defaults.
No separate web server is needed inside the container — Express serves the SPA,
API, Auth.js routes, and WebSocket on a single port.

If you already started the local MongoDB container before authentication was enabled, the existing
`mongo_data` volume may not contain the configured root user. For local development, recreate it with:

```bash
docker compose down -v
docker compose up --build
```

Do this only for disposable local data. For production, create users/backups deliberately instead.

## Deployment Behind A Reverse Proxy

The single app container serves SPA, API, Auth, and WebSocket on one port.
For production, put a TLS reverse proxy in front of it and expose only HTTPS.

Set `APP_URL` to the public HTTPS origin:

```env
APP_URL=https://whiteboard.example.com
NODE_ENV=production
AUTH_DEV_OIDC=false
VITE_DEV_OIDC=false
```

### Production Compose With Published Images

After publishing the images to Docker Hub, use `docker-compose.prod.example.yml` as the deployment
template. It uses:

- `dersimoezdag/fosscalidraw:0.1.24`
- `mongo:7`

Prepare the production env file:

```bash
cp .env.production.example .env
# edit .env and set APP_URL, AUTH_SECRET, Mongo password, and auth provider credentials
```

Start the stack:

```bash
docker compose -f docker-compose.prod.example.yml up -d
```

Docker Compose uses `.env` automatically for `${...}` interpolation. Keep the real `.env` on the
server only and do not commit it.

The production example binds the app to `127.0.0.1:3000`, so your host reverse
proxy can serve HTTPS publicly while the container remains private.

To upgrade later, change the image tags in `docker-compose.prod.example.yml` and run:

```bash
docker compose -f docker-compose.prod.example.yml pull
docker compose -f docker-compose.prod.example.yml up -d
```

### Example: Host Nginx Reverse Proxy

This example assumes the container publishes on `127.0.0.1:3000`.
Use Certbot, your platform, or your own certificate automation for the TLS files.

```nginx
server {
  listen 80;
  server_name whiteboard.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name whiteboard.example.com;

  ssl_certificate /etc/letsencrypt/live/whiteboard.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/whiteboard.example.com/privkey.pem;

  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  location /ws/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 86400;
  }
}
```

Make sure `/ws/` uses the WebSocket upgrade headers above.

### OAuth Callback URLs

Configure provider callbacks to match the public origin:

```text
https://whiteboard.example.com/auth/callback/google
https://whiteboard.example.com/auth/callback/github
https://whiteboard.example.com/auth/callback/oidc
```

Only configure callbacks for the providers you actually enable.

### MongoDB Backups

The default Compose setup stores MongoDB data in the `mongo_data` Docker volume. For production, use
regular `mongodump` backups or a managed MongoDB service with automated snapshots. Do not run
`docker compose down -v` in production unless you deliberately want to delete the database volume.

## Security Defaults

- Express Helmet is enabled for common security headers.
- API rate limiting is enabled through `API_RATE_LIMIT_WINDOW_MS` and `API_RATE_LIMIT_MAX`.
- JSON request size is limited through `JSON_BODY_LIMIT`.
- Docker Compose enables MongoDB authentication by default.
- Configure your host reverse proxy to forward `X-Forwarded-*` headers for correct secure-cookie
  detection behind TLS proxies.

## License

MIT
