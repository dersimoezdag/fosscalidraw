import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectMongo() {
  const uri = config.mongoUri!;
  console.log(`Connecting to MongoDB at ${new URL(uri).hostname}...`);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000, // fail fast if unreachable
    connectTimeoutMS: 10000,
  });
  console.log("MongoDB connected");
}
