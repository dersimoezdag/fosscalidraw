import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { authRouter } from "./auth/auth.routes.js";
import { publicAuthProviders } from "./auth/auth.config.js";
import { boardsRouter } from "./boards/boards.router.js";
import { initYjsServer } from "./ws/yjsServer.js";
import { checkMongoHealth, connectMongo } from "./db.js";
import { config, validateConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

validateConfig();
console.log(
  `[startup] Auth providers enabled: ${
    publicAuthProviders.length > 0
      ? publicAuthProviders.map((provider) => `${provider.id} (${provider.name})`).join(", ")
      : "none"
  }`
);

const app = express();

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: config.appUrl,
  credentials: true,
}));

// Health
app.get("/health", async (req, res) => {
  const mongodb = await checkMongoHealth();
  const healthy = mongodb.status === "ok";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "unhealthy",
    service: "app",
    checks: {
      app: {
        status: "ok",
      },
      mongodb,
    },
  });
});

app.use(rateLimit({
  windowMs: config.apiRateLimitWindowMs,
  limit: config.apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(express.json({ limit: config.jsonBodyLimit }));

// Auth routes (Auth.js)
app.use("/auth", authRouter);

// Board REST API
app.use("/api/boards", boardsRouter);

// ── Frontend static files (SPA) ──────────────────
app.use(express.static(frontendDist));

// SPA fallback — serve index.html for all non-API, non-Auth, non-WS paths
app.get("*", (req, res, next) => {
  // Don't serve index.html for API/Auth/WS paths that we already handled
  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/") || req.path.startsWith("/ws/")) {
    return next();
  }
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

const httpServer = createServer(app);

// Yjs WebSocket server (replaces excalidraw-room)
initYjsServer(httpServer);

connectMongo()
  .then(() => {
    httpServer.listen(config.port, () => {
      console.log(`[startup] FOSScalidraw running on port ${config.port}`);
    });
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    console.error(`[startup] FOSScalidraw startup failed: ${message}`);
    console.error("[startup] Check MONGODB_URI and MongoDB network reachability.");
    process.exit(1);
  });
