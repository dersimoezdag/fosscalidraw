import { ExpressAuth } from "@auth/express";
import Google from "@auth/express/providers/google";
import GitHub from "@auth/express/providers/github";
import { config } from "../config.js";

const providers: any[] = [];
export const publicAuthProviders: { id: string; name: string }[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({
    clientId: process.env.AUTH_GOOGLE_ID!,
    clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  }));
  publicAuthProviders.push({ id: "google", name: "Google" });
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub({
    clientId: process.env.AUTH_GITHUB_ID!,
    clientSecret: process.env.AUTH_GITHUB_SECRET!,
  }));
  publicAuthProviders.push({ id: "github", name: "GitHub" });
}

// Federated OIDC — externe Management-App
if (process.env.AUTH_OIDC_ISSUER && process.env.AUTH_OIDC_CLIENT_ID && process.env.AUTH_OIDC_CLIENT_SECRET) {
  const oidcName = process.env.AUTH_OIDC_NAME ?? "Management App";
  providers.push({
    id: "oidc",
    name: oidcName,
    type: "oidc",
    issuer: process.env.AUTH_OIDC_ISSUER,
    clientId: process.env.AUTH_OIDC_CLIENT_ID!,
    clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET!,
  });
  publicAuthProviders.push({ id: "oidc", name: oidcName });
}

export const authConfig = {
  providers,
  secret: config.authSecret!,
  trustHost: true,
  callbacks: {
    async jwt({ token, profile }: any) {
      if (profile?.roles) token.role = profile.roles;
      if (profile?.role) token.role = profile.role;
      return token;
    },
    async session({ session, token }: any) {
      session.user.role = token.role ?? "editor";
      return session;
    },
  },
};

export const authHandler = ExpressAuth(authConfig);
