import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "./useSession";

export function LoginPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate("/");
  }, [session, loading, navigate]);

  const hasGoogle = import.meta.env.VITE_HAS_GOOGLE !== "false";
  const hasGithub = import.meta.env.VITE_HAS_GITHUB !== "false";
  const hasOidc = import.meta.env.VITE_HAS_OIDC === "true";
  const oidcName = import.meta.env.VITE_OIDC_NAME ?? "Management App";

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", gap: "1.5rem", padding: "2rem"
    }}>
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

        {hasGoogle && (
          <a href="/auth/signin/google">
            <button className="btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <span>Continue with Google</span>
            </button>
          </a>
        )}
        {hasGithub && (
          <a href="/auth/signin/github">
            <button style={{
              width: "100%", padding: "0.6rem 1.25rem", borderRadius: "var(--radius-md)",
              background: "#24292e", color: "white", fontWeight: 500, fontSize: "0.9rem"
            }}>
              Continue with GitHub
            </button>
          </a>
        )}
        {hasOidc && (
          <a href="/auth/signin/oidc">
            <button style={{
              width: "100%", padding: "0.6rem 1.25rem", borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)", fontWeight: 500, fontSize: "0.9rem"
            }}>
              Continue via {oidcName}
            </button>
          </a>
        )}
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", textAlign: "center" }}>
        Self-hosted · MIT License · <a href="https://github.com/fosscalidraw/fosscalidraw" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)" }}>GitHub</a>
      </p>
    </div>
  );
}
