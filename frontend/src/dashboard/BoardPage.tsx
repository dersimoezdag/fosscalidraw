import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import { useTranslation } from "react-i18next";
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

type PublicAccess = "private" | "view" | "edit";

interface BoardAccess {
  role: string;
  canEdit: boolean;
  canManage: boolean;
}

interface BoardDetails {
  title: string;
  publicAccess?: PublicAccess;
  access: BoardAccess;
}

export function BoardPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const providerRef = useRef<CollabProvider | null>(null);
  const [title, setTitle] = useState(t("boardUntitled"));
  const [collaborators, setCollaborators] = useState(0);
  const [access, setAccess] = useState<BoardAccess | null>(null);
  const [publicAccess, setPublicAccess] = useState<PublicAccess>("private");
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [shareStatus, setShareStatus] = useState("");

  const canEdit = access?.canEdit ?? false;
  const canManage = access?.canManage ?? false;

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    let collab: CollabProvider | null = null;

    fetch(`/api/boards/${id}`, { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          navigate("/login");
          return null;
        }
        if (!r.ok) {
          navigate("/");
          return null;
        }
        return r.json();
      })
      .then((board: BoardDetails | null) => {
        if (!board || cancelled) return;

        setTitle(board.title);
        setAccess(board.access);
        setPublicAccess(board.publicAccess ?? "private");

        if (board.access.canEdit) {
          collab = createCollabProvider(id);
          providerRef.current = collab;
          collab.provider.awareness.on("change", () => {
            setCollaborators(collab?.provider.awareness.getStates().size ?? 0);
          });
        }
      })
      .catch(() => navigate("/"));

    return () => {
      cancelled = true;
      collab?.provider.destroy();
      providerRef.current = null;
    };
  }, [id, navigate]);

  async function saveTitle(newTitle: string) {
    if (!canEdit) return;

    setTitle(newTitle);
    await fetch(`/api/boards/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
  }

  async function copyBoardLink() {
    await navigator.clipboard.writeText(window.location.href);
    setShareStatus(t("linkCopied"));
  }

  async function updatePublicAccess(nextAccess: PublicAccess) {
    const res = await fetch(`/api/boards/${id}/share`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicAccess: nextAccess }),
    });

    if (!res.ok) {
      setShareStatus(t("guestAccessUpdateFailed"));
      return;
    }

    setPublicAccess(nextAccess);
    setShareStatus(t("guestAccessUpdated"));
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) return;

    const res = await fetch(`/api/boards/${id}/members`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });

    if (!res.ok) {
      setShareStatus(t("memberInviteFailed"));
      return;
    }

    setInviteEmail("");
    setShareStatus(t("memberInvited"));
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "1rem",
        padding: "0 1rem", height: "48px", background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)", zIndex: 10, flexShrink: 0
      }}>
        <button className="btn-ghost" onClick={() => navigate("/")} style={{ padding: "0.4rem 0.6rem" }}>
          {"<-"} {t("back")}
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          readOnly={!canEdit}
          style={{
            border: "none", background: "transparent", fontWeight: 600,
            fontSize: "0.9rem", outline: "none", width: "200px"
          }}
        />
        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          {canEdit ? t("boardOnline", { count: collaborators }) : t("boardViewOnly")}
        </span>
        {canManage && (
          <button className="btn-primary" onClick={() => { setShareOpen(true); setShareStatus(""); }}>
            {t("share")}
          </button>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <Excalidraw
          key={canEdit ? "editable" : "readonly"}
          UIOptions={excalidrawUiOptions}
          initialData={{ appState: { viewModeEnabled: !canEdit } }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>

      {shareOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("shareBoard")}
          onClick={() => setShareOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.24)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1rem", zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: "420px", background: "var(--color-surface)",
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-md)", padding: "1.25rem", display: "grid", gap: "1rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>{t("shareBoard")}</h2>
              <button className="btn-ghost" onClick={() => setShareOpen(false)} aria-label={t("closeShareDialog")}>
                x
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("boardLink")}</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  readOnly
                  value={window.location.href}
                  style={{
                    flex: 1, minWidth: 0, border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)", padding: "0.55rem 0.7rem"
                  }}
                />
                <button className="btn-primary" onClick={copyBoardLink}>{t("copy")}</button>
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("guestAccess")}</label>
              <select
                value={publicAccess}
                onChange={(e) => updatePublicAccess(e.target.value as PublicAccess)}
                style={{
                  border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                  padding: "0.55rem 0.7rem", background: "white"
                }}
              >
                <option value="private">{t("guestPrivate")}</option>
                <option value="view">{t("guestView")}</option>
                <option value="edit">{t("guestEdit")}</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("inviteByEmail")}</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: "0.5rem" }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  style={{
                    minWidth: 0, border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)", padding: "0.55rem 0.7rem"
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  style={{
                    border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                    padding: "0.55rem 0.7rem", background: "white"
                  }}
                >
                  <option value="editor">{t("editor")}</option>
                  <option value="viewer">{t("viewer")}</option>
                </select>
              </div>
              <button className="btn-primary" onClick={inviteMember} style={{ justifySelf: "start" }}>
                {t("invite")}
              </button>
            </div>

            {shareStatus && (
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{shareStatus}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
