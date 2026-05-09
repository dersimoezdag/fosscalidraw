import { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";

const cookieName = "fosscalidraw_dev_oidc";

export interface DevOidcUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function isDevOidcEnabled() {
  return process.env.NODE_ENV === "development" && process.env.AUTH_DEV_OIDC !== "false";
}

export function getDevOidcSession(req: Request) {
  if (!isDevOidcEnabled()) return null;

  const cookie = readCookie(req, cookieName);
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  if (!safeEqual(signature, expected)) return null;

  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DevOidcUser;
    return { user };
  } catch {
    return null;
  }
}

export function signInDevOidc(req: Request, res: Response) {
  if (!isDevOidcEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const user: DevOidcUser = {
    id: process.env.AUTH_DEV_OIDC_ID ?? "dev-oidc-user",
    name: process.env.AUTH_DEV_OIDC_NAME ?? "Dev OIDC User",
    email: process.env.AUTH_DEV_OIDC_EMAIL ?? "dev@example.local",
    role: process.env.AUTH_DEV_OIDC_ROLE ?? "editor",
  };

  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";

  res.cookie(cookieName, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
  res.redirect("/");
}

export function signOutDevOidc(_req: Request, res: Response) {
  res.clearCookie(cookieName, { path: "/" });
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }

  return null;
}

function sign(payload: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "dev-secret")
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
