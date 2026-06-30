import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectMongo() {
  const uri = config.mongoUri!;

  for (let attempt = 1; attempt <= config.mongoConnectRetries; attempt += 1) {
    try {
      console.log(`[startup] Checking MongoDB connection (${attempt}/${config.mongoConnectRetries})...`);
      await mongoose.connect(uri);
      await mongoose.connection.db?.admin().ping();
      console.log("[startup] MongoDB is reachable.");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MongoDB connection error";
      console.error(`[startup] MongoDB check failed (${attempt}/${config.mongoConnectRetries}): ${message}`);

      if (attempt === config.mongoConnectRetries) {
        throw new Error(`MongoDB did not become reachable after ${config.mongoConnectRetries} attempts: ${message}`);
      }

      await sleep(config.mongoConnectRetryDelayMs);
    }
  }
}

export async function checkMongoHealth() {
  const readyState = mongoose.connection.readyState;

  if (readyState !== 1 || !mongoose.connection.db) {
    return {
      status: "unhealthy",
      readyState,
      message: "MongoDB connection is not ready",
    };
  }

  try {
    await mongoose.connection.db.admin().ping();
    return {
      status: "ok",
      readyState,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      readyState,
      message: error instanceof Error ? error.message : "MongoDB ping failed",
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
