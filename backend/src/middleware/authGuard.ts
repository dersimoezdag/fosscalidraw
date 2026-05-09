import { Request, Response, NextFunction } from "express";
import { getSession } from "@auth/express";
import { authConfig } from "../auth/auth.config.js";
import { getDevOidcSession } from "../auth/devOidc.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = getDevOidcSession(req) ?? await getSession(req, authConfig);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = session.user;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const session = getDevOidcSession(req) ?? await getSession(req, authConfig).catch(() => null);
  if (session?.user) {
    (req as any).user = session.user;
  }
  next();
}
