import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { authRouter } from "./auth/auth.routes.js";
import { boardsRouter } from "./boards/boards.router.js";
import { initYjsServer } from "./ws/yjsServer.js";
import { connectMongo } from "./db.js";
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

// Health
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const httpServer = createServer(app);

// Yjs WebSocket server (replaces excalidraw-room)
initYjsServer(httpServer);

connectMongo().then(() => {
  httpServer.listen(config.port, () => {
    console.log(`FOSScalidraw backend running on port ${config.port}`);
  });
});
