import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../auth/useSession";

interface Board { _id: string; title: string; updatedAt: string; ownerEmail: string; }

export function Dashboard() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { session, signOut } = useSession();

  useEffect(() => {
    fetch("/api/boards", { credentials: "include" })
      .then((r) => r.json())
      .then(setBoards)
      .finally(() => setLoading(false));
  }, []);

  async function createBoard() {
    const res = await fetch("/api/boards", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Board" }),
    });
    const board = await res.json();
    navigate(`/board/${board._id}`);
  }

  async function deleteBoard(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this board?")) return;
    await fetch(`/api/boards/${id}`, { method: "DELETE", credentials: "include" });
    setBoards((prev) => prev.filter((b) => b._id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 2rem", height: "56px", background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, zIndex: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#01696f"/>
            <path d="M8 24 L14 10 L18 18 L21 14 L25 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="8" cy="24" r="2" fill="white"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>FOSScalidraw</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>{session?.user.email}</span>
          <button className="btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>My Boards</h1>
          <button className="btn-primary" onClick={createBoard}>+ New Board</button>
        </div>

        {loading && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}

        {!loading && boards.length === 0 && (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--color-text-muted)" }}>
            <p style={{ marginBottom: "1rem" }}>No boards yet. Create your first one!</p>
            <button className="btn-primary" onClick={createBoard}>Create Board</button>
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "1rem"
        }}>
          {boards.map((b) => (
            <div key={b._id}
              onClick={() => navigate(`/board/${b._id}`)}
              style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)", padding: "1.25rem", cursor: "pointer",
                transition: "box-shadow 180ms ease",
                position: "relative"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              {/* Board preview placeholder */}
              <div style={{
                height: "100px", background: "var(--color-bg)", borderRadius: "var(--radius-md)",
                marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M6 26 L11 14 L16 20 L20 15 L26 26" stroke="#d4d1ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {b.title}
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {new Date(b.updatedAt).toLocaleDateString()}
              </p>
              <button
                onClick={(e) => deleteBoard(e, b._id)}
                style={{
                  position: "absolute", top: "0.75rem", right: "0.75rem",
                  background: "none", border: "none", color: "var(--color-text-muted)",
                  fontSize: "1rem", padding: "2px 6px", borderRadius: "4px", opacity: 0
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                title="Delete board"
              >×</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
