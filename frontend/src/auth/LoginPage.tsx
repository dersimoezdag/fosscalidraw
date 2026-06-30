import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionContext } from "./SessionContext";
import { ThemeToggle } from "../theme/ThemeToggle";

type AuthProvider = {
  id: "google" | "github" | "oidc" | string;
  name: string;
};

export function LoginPage() {
  const { session, loading } = useSessionContext();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [hasDevOidc, setHasDevOidc] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    if (!loading && session) navigate("/");
  }, [session, loading, navigate]);

  useEffect(() => {
    fetch("/auth/providers", { credentials: "include" })
      .then(async (providersResponse) => {
        if (!providersResponse.ok) throw new Error("Unable to load auth providers");
        const providersData = await providersResponse.json() as { providers?: AuthProvider[]; devOidc?: boolean };

        setProviders(providersData.providers ?? []);
        setHasDevOidc(Boolean(providersData.devOidc));
      })
      .catch(() => {
        setProviders([]);
        setHasDevOidc(false);
      });

    fetch("/auth/csrf", { credentials: "include" })
      .then(async (csrfResponse) => {
        if (!csrfResponse.ok) throw new Error("Unable to load auth CSRF token");
        const csrfData = await csrfResponse.json() as { csrfToken?: string };

        setCsrfToken(csrfData.csrfToken ?? "");
      })
      .catch(() => {
        setCsrfToken("");
      });
  }, []);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", gap: "1.5rem", padding: "2rem"
    }}>
      <div style={{ position: "fixed", top: "1rem", right: "1rem" }}>
        <ThemeToggle />
      </div>

      {/* Logo */}
      <svg width="48" height="48" viewBox="0 0 32 32" fill="none" aria-label="FOSScalidraw logo">
        <rect width="32" height="32" rx="8" fill="#01696f"/>
        <path d="M8 24 L14 10 L18 18 L21 14 L25 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="8" cy="24" r="2" fill="white"/>
      </svg>

      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.25rem" }}>FOSScalidraw</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem" }}>
          Open-source collaborative whiteboard
        </p>
      </div>

      <div style={{
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "360px",
        display: "flex", flexDirection: "column", gap: "0.75rem",
        boxShadow: "var(--shadow-md)"
      }}>
        <p style={{ fontWeight: 600, marginBottom: "0.25rem", textAlign: "center" }}>Sign in</p>

        {providers.map((provider) => {
          if (provider.id === "google") {
            return (
              <form action="/auth/signin/google" method="post" key={provider.id}>
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="callbackUrl" value="/" />
                <button className="btn-primary" type="submit" disabled={!csrfToken} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                  <span>Continue with Google</span>
                </button>
              </form>
            );
          }

          if (provider.id === "github") {
            return (
              <form action="/auth/signin/github" method="post" key={provider.id}>
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="callbackUrl" value="/" />
                <button type="submit" disabled={!csrfToken} style={{
                  width: "100%", padding: "0.6rem 1.25rem", borderRadius: "var(--radius-md)",
                  background: "#24292e", color: "white", fontWeight: 500, fontSize: "0.9rem"
                }}>
                  Continue with GitHub
                </button>
              </form>
            );
          }

          return (
            <form action={`/auth/signin/${provider.id}`} method="post" key={provider.id}>
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="callbackUrl" value="/" />
              <button type="submit" disabled={!csrfToken} style={{
                width: "100%", padding: "0.6rem 1.25rem", borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)", fontWeight: 500, fontSize: "0.9rem",
                color: "var(--color-text)", background: "var(--color-control-bg)"
              }}>
                Continue via {provider.name}
              </button>
            </form>
          );
        })}
        {hasDevOidc && (
          <a href="/auth/dev/signin">
            <button style={{
              width: "100%", padding: "0.6rem 1.25rem", borderRadius: "var(--radius-md)",
              border: "1px dashed var(--color-border)", fontWeight: 500, fontSize: "0.9rem",
              color: "var(--color-text)", background: "var(--color-control-bg)"
            }}>
              Continue with simulated OIDC
            </button>
          </a>
        )}
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", textAlign: "center" }}>
        Self-hosted · MIT License
      </p>
    </div>
  );
}
