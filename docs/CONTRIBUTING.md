# Contributing to FOSScalidraw

We welcome contributions! Please open an issue before starting large features.

## Setup (local dev)

```bash
# 1. Clone
git clone https://github.com/your-org/fosscalidraw
cd fosscalidraw

# 2. Configure env
cp .env.example .env
# Fill in AUTH_SECRET, MONGODB_URI, and at least one OAuth provider

# 3. Start MongoDB
docker compose up mongo -d

# 4. Backend
cd backend && npm install && npm run dev

# 5. Frontend (new terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:3000

## License
All contributions are MIT licensed.
