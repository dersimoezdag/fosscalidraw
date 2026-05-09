import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { authRouter } from "./auth/auth.routes.js";
import { boardsRouter } from "./boards/boards.router.js";
import { initYjsServer } from "./ws/yjsServer.js";
import { connectMongo } from "./db.js";

const app = express();
const PORT = process.env.BACKEND_PORT ?? 3001;

app.use(cors({
  origin: process.env.APP_URL ?? "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

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
  httpServer.listen(PORT, () => {
    console.log(`FOSScalidraw backend running on port ${PORT}`);
  });
});
