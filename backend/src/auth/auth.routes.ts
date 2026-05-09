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

authRouter.post("/signout", (req, res) => {
  signOutDevOidc(req, res);
  clearAuthCookies(res);
  res.json({ ok: true });
});

authRouter.use("/*", authHandler);

function clearAuthCookies(res: any) {
  const cookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "authjs.csrf-token",
    "__Host-authjs.csrf-token",
    "authjs.callback-url",
    "__Secure-authjs.callback-url",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
  ];

  for (const name of cookieNames) {
    res.clearCookie(name, { path: "/" });
  }
}
