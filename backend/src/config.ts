const isProduction = process.env.NODE_ENV === "production";

export const config = {
  isProduction,
  port: process.env.BACKEND_PORT ?? 3001,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  mongoUri: process.env.MONGODB_URI,
  authSecret: process.env.AUTH_SECRET,
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? "10mb",
  apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60_000),
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX ?? (isProduction ? 240 : 1200)),
};

export function validateConfig() {
  const errors: string[] = [];

  if (!config.mongoUri) {
    errors.push("MONGODB_URI is required.");
  }

  if (!config.authSecret) {
    errors.push("AUTH_SECRET is required.");
  }

  if (isProduction) {
    if (process.env.AUTH_DEV_OIDC === "true") {
      errors.push("AUTH_DEV_OIDC must not be true in production.");
    }

    if (!config.appUrl.startsWith("https://")) {
      errors.push("APP_URL must use https:// in production.");
    }

    if (!config.authSecret || config.authSecret.length < 32 || config.authSecret.startsWith("change-me")) {
      errors.push("AUTH_SECRET must be a strong random value with at least 32 characters in production.");
    }

    const hasProvider =
      Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) ||
      Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) ||
      Boolean(process.env.AUTH_OIDC_ISSUER && process.env.AUTH_OIDC_CLIENT_ID && process.env.AUTH_OIDC_CLIENT_SECRET);

    if (!hasProvider) {
      errors.push("At least one complete auth provider must be configured in production.");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);
  }
}
