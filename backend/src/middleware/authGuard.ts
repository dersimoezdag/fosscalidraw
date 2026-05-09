import { Request, Response, NextFunction } from "express";
import { getSession } from "@auth/express";
import { authHandler } from "../auth/auth.config.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await getSession(req, authHandler);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = session.user;
  next();
}
