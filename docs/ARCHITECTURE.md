# FOSScalidraw Architecture

## Stack
| Layer | Technology | License |
|---|---|---|
| Canvas UI | Excalidraw | MIT |
| Frontend framework | React + Vite | MIT |
| Realtime CRDT | Yjs + y-websocket | MIT |
| MongoDB persistence | y-mongodb-provider | MIT |
| Authentication | Auth.js v5 (@auth/express) | ISC |
| Backend framework | Express | MIT |
| Database | MongoDB + Mongoose | Apache 2 |
| Container | Docker + Node.js | MIT |

## Auth Modes

### Standalone (default)
Configure any combination of Google/GitHub OAuth directly in `.env`.
Both providers are optional — configure only what you need.

### Federated (external OIDC management app)
Set `AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`.
Your management app must expose a standard OIDC discovery endpoint at
`{issuer}/.well-known/openid-configuration`.

Role claims: include a `roles` or `role` field in the ID token.
FOSScalidraw maps: `admin` → owner, `editor` → editor, anything else → viewer.

Compatible OIDC servers: Authentik, Keycloak, any Auth.js app with OIDC plugin.

## Board Permissions
- **owner**: full control, can invite/remove members, delete board
- **editor**: can draw and edit canvas
- **viewer**: read-only (WS connection allowed)

## Directory Structure
```
fosscalidraw/
├── frontend/
│   └── src/
│       ├── auth/           OAuth session hooks + LoginPage
│       ├── collaboration/  Yjs CollabProvider (replaces excalidraw-room)
│       ├── dashboard/      Board list + BoardPage
│       └── App.tsx         Router
├── backend/
│   └── src/
│       ├── auth/           Auth.js config + routes
│       ├── boards/         REST CRUD + Mongoose model
│       ├── ws/             Yjs WebSocket server + MongoDB persistence
│       └── middleware/     Auth guard
└── docker-compose.yml
```
