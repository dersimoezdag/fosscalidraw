import { Router } from "express";
import { authHandler } from "./auth.config.js";
import { getDevOidcSession, signInDevOidc, signOutDevOidc } from "./devOidc.js";

export const authRouter = Router();

authRouter.get("/dev/signin", signInDevOidc);

authRouter.get("/session", (req, res, next) => {
  const session = getDevOidcSession(req);
  if (session) {
    res.json(session);
    return;
  }
  next();
});

authRouter.post("/signout", (req, res, next) => {
  signOutDevOidc(req, res);
  next();
});

authRouter.use("/*", authHandler);
