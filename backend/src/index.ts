import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { authRouter } from "./auth/auth.routes.js";
import { boardsRouter } from "./boards/boards.router.js";
import { initYjsServer } from "./ws/yjsServer.js";
import { checkMongoHealth, connectMongo } from "./db.js";
import { config, validateConfig } from "./config.js";

validateConfig();
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
  const frontendStatus = req.get("x-fosscalidraw-frontend-status");

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "unhealthy",
    service: "backend",
    checks: {
      ...(frontendStatus ? {
        frontend: {
          status: frontendStatus,
        },
      } : {}),
      backend: {
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
      console.log(`[startup] FOSScalidraw backend running on port ${config.port}`);
    });
  })
  .catch((error) => {
    console.error("[startup] Backend startup failed. MongoDB is not reachable.");
    console.error(error);
    process.exit(1);
  });
