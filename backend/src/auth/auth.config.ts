import { ExpressAuth } from "@auth/express";
import Google from "@auth/express/providers/google";
import GitHub from "@auth/express/providers/github";

const providers: any[] = [];

if (process.env.AUTH_GOOGLE_ID) {
  providers.push(Google({
    clientId: process.env.AUTH_GOOGLE_ID!,
    clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  }));
}

if (process.env.AUTH_GITHUB_ID) {
  providers.push(GitHub({
    clientId: process.env.AUTH_GITHUB_ID!,
    clientSecret: process.env.AUTH_GITHUB_SECRET!,
  }));
}

// Federated OIDC — externe Management-App
if (process.env.AUTH_OIDC_ISSUER) {
  providers.push({
    id: "oidc",
    name: process.env.AUTH_OIDC_NAME ?? "Management App",
    type: "oidc",
    issuer: process.env.AUTH_OIDC_ISSUER,
    clientId: process.env.AUTH_OIDC_CLIENT_ID!,
    clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET!,
  });
}

export const authConfig = {
  providers,
  secret: process.env.AUTH_SECRET!,
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
