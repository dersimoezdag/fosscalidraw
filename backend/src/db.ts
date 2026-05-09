import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectMongo() {
  const uri = config.mongoUri!;
  await mongoose.connect(uri);
  console.log("MongoDB connected");
}
