import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSessionContext } from "../auth/SessionContext";
import { ThemeToggle } from "../theme/ThemeToggle";
import { dottedBackgroundAppStateKey, type BoardBackgroundStyle } from "../collaboration/sceneSync";

interface Board {
  _id: string;
  title: string;
  updatedAt: string;
  ownerEmail: string;
  archived?: boolean;
  preview?: BoardPreviewScene;
}

interface BoardPreviewScene {
  elements?: PreviewElement[];
  appState?: Record<string, unknown>;
}

interface PreviewElement {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  points?: [number, number][];
  isDeleted?: boolean;
}

interface ContextMenuState {
  board: Board;
  x: number;
  y: number;
}

export function Dashboard() {
  const { t } = useTranslation();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renameBoard, setRenameBoard] = useState<Board | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<Board | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const { session, signOut } = useSessionContext();

  useEffect(() => {
    fetch("/api/boards", { credentials: "include" })
      .then((r) => r.json())
      .then(setBoards)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, [contextMenu]);

  async function createBoard() {
    const res = await fetch("/api/boards", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t("boardUntitled") }),
    });
    const board = await res.json();
    navigate(`/board/${board._id}`);
  }

  async function importBoard(file: File) {
    setImportStatus("");

    try {
      const scene = JSON.parse(await file.text());
      if (!Array.isArray(scene?.elements)) {
        setImportStatus(t("importBoardInvalid"));
        return;
      }

      const title = getImportedBoardTitle(scene, file.name, t("boardUntitled"));
      const res = await fetch("/api/boards", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          scene: {
            elements: scene.elements,
            appState: scene.appState ?? {},
            files: scene.files ?? {},
          },
        }),
      });

      if (!res.ok) {
        setImportStatus(t("importBoardFailed"));
        return;
      }

      const board = await res.json();
      navigate(`/board/${board._id}`);
    } catch {
      setImportStatus(t("importBoardInvalid"));
    }
  }

  function openContextMenu(e: MouseEvent, board: Board) {
    e.preventDefault();
    setContextMenu({ board, x: e.clientX, y: e.clientY });
  }

  function openRenameDialog(board: Board) {
    setContextMenu(null);
    setRenameBoard(board);
    setRenameTitle(board.title);
  }

  async function renameSelectedBoard() {
    if (!renameBoard) return;

    const title = renameTitle.trim() || t("boardUntitled");
    const res = await fetch(`/api/boards/${renameBoard._id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;

    const updatedBoard = await res.json();
    setBoards((prev) => prev.map((b) => b._id === updatedBoard._id ? { ...b, ...updatedBoard } : b));
    setRenameBoard(null);
  }

  async function archiveBoard(board: Board) {
    setContextMenu(null);
    const res = await fetch(`/api/boards/${board._id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) return;

    const updatedBoard = await res.json();
    setBoards((prev) => prev.map((b) => b._id === updatedBoard._id ? { ...b, ...updatedBoard } : b));
  }

  async function deleteSelectedBoard() {
    if (!deleteBoardTarget) return;

    await fetch(`/api/boards/${deleteBoardTarget._id}`, { method: "DELETE", credentials: "include" });
    setBoards((prev) => prev.filter((b) => b._id !== deleteBoardTarget._id));
    setDeleteBoardTarget(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
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
          <ThemeToggle />
          <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>{session?.user.email}</span>
          <button className="btn-ghost" onClick={signOut}>{t("signOut")}</button>
        </div>
      </header>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{t("myBoards")}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <input
              ref={importInputRef}
              type="file"
              accept=".excalidraw,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importBoard(file);
              }}
              style={{ display: "none" }}
            />
            <button className="btn-ghost" onClick={() => importInputRef.current?.click()}>
              {t("importBoard")}
            </button>
            <button className="btn-primary" onClick={createBoard}>+ {t("newBoard")}</button>
          </div>
        </div>

        {importStatus && (
          <p style={{ color: "var(--color-text-muted)", marginBottom: "1rem" }}>{importStatus}</p>
        )}

        {loading && <p style={{ color: "var(--color-text-muted)" }}>{t("loading")}</p>}

        {!loading && boards.length === 0 && (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--color-text-muted)" }}>
            <p style={{ marginBottom: "1rem" }}>{t("noBoards")}</p>
            <button className="btn-primary" onClick={createBoard}>{t("createBoard")}</button>
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
              onContextMenu={(e) => openContextMenu(e, b)}
              style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)", padding: "1.25rem", cursor: "pointer",
                transition: "box-shadow 180ms ease, opacity 180ms ease",
                position: "relative", opacity: b.archived ? 0.72 : 1
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              {b.archived && (
                <span style={{
                  position: "absolute", top: "0.75rem", right: "0.75rem",
                  fontSize: "0.7rem", color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border)", borderRadius: "999px",
                  padding: "0.15rem 0.45rem", background: "var(--color-surface)"
                }}>
                  {t("archived")}
                </span>
              )}
              <BoardPreview preview={b.preview} />
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {b.title}
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {new Date(b.updatedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </main>

      {contextMenu && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", top: contextMenu.y, left: contextMenu.x,
            width: "190px", background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)", padding: "0.35rem", zIndex: 1000
          }}
        >
          <ContextMenuButton onClick={() => openRenameDialog(contextMenu.board)}>
            {t("renameBoard")}
          </ContextMenuButton>
          {!contextMenu.board.archived && (
            <ContextMenuButton onClick={() => archiveBoard(contextMenu.board)}>
              {t("archiveBoard")}
            </ContextMenuButton>
          )}
          <ContextMenuButton danger onClick={() => { setDeleteBoardTarget(contextMenu.board); setContextMenu(null); }}>
            {t("deleteBoard")}
          </ContextMenuButton>
        </div>
      )}

      {renameBoard && (
        <Modal title={t("renameBoard")} onClose={() => setRenameBoard(null)}>
          <form onSubmit={(e) => { e.preventDefault(); renameSelectedBoard(); }} style={{ display: "grid", gap: "0.75rem" }}>
            <input
              autoFocus
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              style={{
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                padding: "0.65rem 0.75rem"
              }}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn-ghost" onClick={() => setRenameBoard(null)}>{t("cancel")}</button>
              <button type="submit" className="btn-primary">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteBoardTarget && (
        <Modal title={t("deleteBoard")} onClose={() => setDeleteBoardTarget(null)}>
          <div style={{ display: "grid", gap: "1rem" }}>
            <p style={{ color: "var(--color-text-muted)", lineHeight: 1.45 }}>
              {t("deleteBoardConfirm", { title: deleteBoardTarget.title })}
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn-ghost" onClick={() => setDeleteBoardTarget(null)}>{t("cancel")}</button>
              <button type="button" className="btn-primary" onClick={deleteSelectedBoard}>{t("deletePermanently")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ContextMenuButton({
  children,
  danger,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "0.55rem 0.65rem",
        borderRadius: "0.35rem", fontSize: "0.875rem",
        color: danger ? "#b42318" : "var(--color-text)"
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function getImportedBoardTitle(scene: any, fileName: string, fallback: string) {
  const appStateName = typeof scene?.appState?.name === "string" ? scene.appState.name.trim() : "";
  if (appStateName) return appStateName;

  const fileTitle = fileName.replace(/\.excalidraw$/i, "").replace(/\.json$/i, "").trim();
  return fileTitle || fallback;
}

function BoardPreview({ preview }: { preview?: BoardPreviewScene }) {
  const elements = (preview?.elements ?? []).filter((element) => !element.isDeleted);
  const backgroundStyle = getPreviewBackgroundStyle(preview);
  const bounds = getPreviewBounds(elements);
  const viewBox = bounds
    ? `${bounds.minX} ${bounds.minY} ${Math.max(bounds.width, 1)} ${Math.max(bounds.height, 1)}`
    : "0 0 320 160";

  return (
    <div style={{
      height: "100px",
      background: getPreviewBackground(preview, backgroundStyle),
      backgroundImage: backgroundStyle === "dotted"
        ? "radial-gradient(circle, color-mix(in srgb, var(--color-text-muted) 42%, transparent) 1px, transparent 1px)"
        : undefined,
      backgroundSize: backgroundStyle === "dotted" ? "16px 16px" : undefined,
      borderRadius: "var(--radius-md)",
      marginBottom: "0.75rem",
      overflow: "hidden",
      border: "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
    }}>
      {elements.length > 0 ? (
        <svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          {elements.map((element, index) => (
            <PreviewShape key={element.id ?? index} element={element} />
          ))}
        </svg>
      ) : (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M6 26 L11 14 L16 20 L20 15 L26 26" stroke="#d4d1ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </div>
  );
}

function PreviewShape({ element }: { element: PreviewElement }) {
  const x = numberOr(element.x, 0);
  const y = numberOr(element.y, 0);
  const width = Math.max(numberOr(element.width, 1), 1);
  const height = Math.max(numberOr(element.height, 1), 1);
  const stroke = element.strokeColor || "#343a40";
  const fill = getElementFill(element);
  const strokeWidth = Math.max(numberOr(element.strokeWidth, 1.5), 1.5);
  const opacity = Math.min(1, Math.max(0.12, numberOr(element.opacity, 100) / 100));
  const rotation = element.angle ? `rotate(${element.angle * 180 / Math.PI} ${x + width / 2} ${y + height / 2})` : undefined;

  if (element.type === "ellipse") {
    return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} transform={rotation} />;
  }

  if (element.type === "diamond") {
    return <polygon points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} transform={rotation} />;
  }

  if (element.type === "line" || element.type === "arrow" || element.type === "freedraw") {
    const points = element.points?.length ? element.points : [[0, 0], [width, height]];
    const d = points.map(([px, py], index) => `${index === 0 ? "M" : "L"} ${x + px} ${y + py}`).join(" ");
    return <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} transform={rotation} />;
  }

  if (element.type === "text") {
    return <text x={x} y={y + Math.min(height, 18)} fill={stroke} fontSize={Math.max(10, Math.min(18, height))} opacity={opacity}>{element.text}</text>;
  }

  return <rect x={x} y={y} width={width} height={height} rx={Math.min(8, width / 8, height / 8)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} transform={rotation} />;
}

function getPreviewBounds(elements: PreviewElement[]) {
  if (elements.length === 0) return null;

  const boxes = elements.map((element) => {
    const x = numberOr(element.x, 0);
    const y = numberOr(element.y, 0);
    return {
      minX: x,
      minY: y,
      maxX: x + Math.max(numberOr(element.width, 1), 1),
      maxY: y + Math.max(numberOr(element.height, 1), 1),
    };
  });

  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  const padding = Math.max(24, Math.max(maxX - minX, maxY - minY) * 0.08);

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

function getPreviewBackgroundStyle(preview?: BoardPreviewScene): BoardBackgroundStyle {
  return preview?.appState?.[dottedBackgroundAppStateKey] === "dotted" ? "dotted" : "solid";
}

function getPreviewBackground(preview: BoardPreviewScene | undefined, style: BoardBackgroundStyle) {
  const color = typeof preview?.appState?.viewBackgroundColor === "string" && preview.appState.viewBackgroundColor !== "transparent"
    ? preview.appState.viewBackgroundColor
    : "var(--color-bg)";
  return style === "dotted" ? color : color;
}

function getElementFill(element: PreviewElement) {
  if (!element.backgroundColor || element.backgroundColor === "transparent") return "none";
  return element.backgroundColor;
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "var(--color-overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem", zIndex: 1100
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "400px", background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)", padding: "1.25rem", display: "grid", gap: "1rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">x</button>
        </div>
        {children}
      </div>
    </div>
  );
}
