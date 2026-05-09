import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { createCollabProvider, CollabProvider } from "../collaboration/CollabProvider";

const excalidrawUiOptions = {
  canvasActions: {
    export: { saveFileToDisk: true },
    loadScene: true,
    saveAsImage: true,
    clearCanvas: true,
    changeViewBackgroundColor: true,
    toggleTheme: null,
  },
};

export function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const providerRef = useRef<CollabProvider | null>(null);
  const [title, setTitle] = useState("Untitled Board");
  const [collaborators, setCollaborators] = useState(0);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/boards/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b) => setTitle(b.title))
      .catch(() => navigate("/"));

    const collab = createCollabProvider(id);
    providerRef.current = collab;

    collab.provider.awareness.on("change", () => {
      setCollaborators(collab.provider.awareness.getStates().size);
    });

    return () => {
      collab.provider.destroy();
    };
  }, [id, navigate]);

  async function saveTitle(newTitle: string) {
    setTitle(newTitle);
    await fetch(`/api/boards/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Board header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "1rem",
        padding: "0 1rem", height: "48px", background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)", zIndex: 10, flexShrink: 0
      }}>
        <button className="btn-ghost" onClick={() => navigate("/")} style={{ padding: "0.4rem 0.6rem" }}>
          ← Back
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          style={{
            border: "none", background: "transparent", fontWeight: 600,
            fontSize: "0.9rem", outline: "none", width: "200px"
          }}
        />
        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          {collaborators} online
        </span>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1 }}>
        <Excalidraw UIOptions={excalidrawUiOptions} />
      </div>
    </div>
  );
}
