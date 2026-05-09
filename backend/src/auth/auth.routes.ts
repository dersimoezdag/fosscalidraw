import { Router } from "express";
import { authHandler, publicAuthProviders } from "./auth.config.js";
import { getDevOidcSession, isDevOidcEnabled, signInDevOidc, signOutDevOidc } from "./devOidc.js";

export const authRouter = Router();

authRouter.get("/dev/signin", signInDevOidc);

authRouter.get("/providers", (_req, res) => {
  res.json({
    providers: publicAuthProviders,
    devOidc: isDevOidcEnabled(),
  });
});

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
