import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

/**
 * API Token Authentication Middleware
 *
 * Checks for `Authorization: Bearer <token>` and if it matches the configured
 * API_TOKEN, sets req.user to a synthetic API user. This allows server-to-server
 * calls (e.g. from RA-Node) to use the same REST endpoints without a browser session.
 *
 * Must be placed before the session-based auth guard so the API user is already set
 * when requireAuth/optionalAuth run.
 */
export function apiTokenAuth(req: Request, _res: Response, next: NextFunction) {
  if (!config.apiToken) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice(7).trim();

  if (!token || token !== config.apiToken) {
    return next();
  }

  (req as any).user = {
    id: `api:${config.apiUserEmail}`,
    email: config.apiUserEmail,
    name: config.apiUserName,
    role: "editor",
  };

  next();
}
