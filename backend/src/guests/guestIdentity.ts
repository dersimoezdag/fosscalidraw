import { Request, Response } from "express";
import { IncomingMessage } from "http";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { config } from "../config.js";

const cookieName = "fosscalidraw_guest_id";

export function getGuestId(req: Request | IncomingMessage) {
  const cookie = readCookie(req.headers.cookie, cookieName);
  if (!cookie) return null;

  const [guestId, signature] = cookie.split(".");
  if (!guestId || !signature) return null;

  const expected = sign(guestId);
  if (!safeEqual(signature, expected)) return null;
  return guestId;
}

export function getOrSetGuestId(req: Request, res: Response) {
  const existingGuestId = getGuestId(req);
  if (existingGuestId) return existingGuestId;

  const guestId = randomUUID();
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(cookieName, `${guestId}.${sign(guestId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
  return guestId;
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return null;

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }

  return null;
}

function sign(value: string) {
  return createHmac("sha256", config.authSecret!)
    .update(value)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
