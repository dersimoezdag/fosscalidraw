import { Request, Response, NextFunction } from "express";
import { getSession } from "@auth/express";
import { authConfig } from "../auth/auth.config.js";
import { getDevOidcSession } from "../auth/devOidc.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = getDevOidcSession(req) ?? await getSession(req, authConfig);
  const user = normalizeUser(session?.user);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = user;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const session = getDevOidcSession(req) ?? await getSession(req, authConfig).catch(() => null);
  const user = normalizeUser(session?.user);
  if (user) {
    (req as any).user = user;
  }
  next();
}

function normalizeUser(user: any) {
  if (!user) return null;

  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const idSource = typeof user.id === "string" && user.id.trim()
    ? user.id
    : email;
  const id = idSource.trim();

  if (!id || !email) return null;

  return {
    ...user,
    id,
    email,
    role: user.role ?? "editor",
  };
}
