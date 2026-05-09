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
# Fill in your OAuth credentials and MongoDB URI
docker compose up
```

Open http://localhost:3000

## Architecture

```
frontend/   ← React app (Excalidraw fork shell)
backend/    ← Express + Auth.js + Yjs WS Server + MongoDB
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Auth Modes

### Standalone (default)
Configure Google/GitHub OAuth directly in `.env`.

### Federated (external management app)
Set `AUTH_OIDC_ISSUER` in `.env` to delegate auth to your own OIDC provider.

## License

MIT — fork of [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT)
