import { Router } from "express";
import { authHandler } from "./auth.config.js";

export const authRouter = Router();
authRouter.use("/*", authHandler);
