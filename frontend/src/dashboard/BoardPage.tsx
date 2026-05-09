import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  restore,
} from "@excalidraw/excalidraw";
import { useTranslation } from "react-i18next";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  SocketId,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { createCollabProvider, CollabProvider } from "../collaboration/CollabProvider";
import { useSession } from "../auth/useSession";

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
  scene?: PersistedScene;
  access: BoardAccess;
}

interface PersistedScene {
  elements?: readonly OrderedExcalidrawElement[];
  appState?: ExcalidrawInitialDataState["appState"];
  files?: BinaryFiles;
}

interface ActiveUser {
  clientId: number;
  id?: string;
  name: string;
  email?: string;
  color?: { background: string; stroke: string };
  isCurrent: boolean;
}

const collabOrigin = "fosscalidraw-local";
const scenePayloadKey = "payload";
const sceneRevisionKey = "revision";
const kickKeyPrefix = "kick:";

export function BoardPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const providerRef = useRef<CollabProvider | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const pendingRemoteSceneRef = useRef<{ scene: PersistedScene; editable: boolean } | null>(null);
  const applyingRemoteSceneRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const pendingCollaboratorUpdateRef = useRef<CollabProvider | null>(null);
  const collaboratorUpdateTimerRef = useRef<number | null>(null);
  const pendingSceneSyncRef = useRef(false);
  const sceneSyncTimerRef = useRef<number | null>(null);
  const sceneSaveTimerRef = useRef<number | null>(null);
  const lastSceneJsonRef = useRef("");
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(() =>
    window.localStorage.getItem("fosscalidraw.colorScheme") === "dark" ? "dark" : "light"
  );
  const [title, setTitle] = useState(t("boardUntitled"));
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [collaborators, setCollaborators] = useState(0);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [activeUsersOpen, setActiveUsersOpen] = useState(false);
  const [access, setAccess] = useState<BoardAccess | null>(null);
  const [publicAccess, setPublicAccess] = useState<PublicAccess>("private");
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [shareStatus, setShareStatus] = useState("");
  const [guestName, setGuestName] = useState(() => window.localStorage.getItem("fosscalidraw.guestName") ?? "");
  const [guestNameInput, setGuestNameInput] = useState(guestName);
  const [guestNameDialogOpen, setGuestNameDialogOpen] = useState(false);

  const canEdit = access?.canEdit ?? false;
  const needsGuestName = access?.role === "guest" && canEdit && !guestName.trim();
  const activeCanEdit = canEdit && !needsGuestName;
  const canManage = access?.canManage ?? false;

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme;
    window.localStorage.setItem("fosscalidraw.colorScheme", colorScheme);
    excalidrawApiRef.current?.updateScene({
      appState: { theme: colorScheme },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [colorScheme]);

  const saveScene = useCallback((scene: PersistedScene) => {
    if (!id) return;
    if (sceneSaveTimerRef.current) {
      window.clearTimeout(sceneSaveTimerRef.current);
    }
    sceneSaveTimerRef.current = window.setTimeout(() => {
      fetch(`/api/boards/${id}/scene`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      }).catch(() => undefined);
    }, 600);
  }, [id]);

  const applyScene = useCallback((scene: PersistedScene, editable: boolean) => {
    const api = excalidrawApiRef.current;
    if (!api) {
      pendingRemoteSceneRef.current = { scene, editable };
      return;
    }

    const restored = restore(
      scene,
      { viewModeEnabled: !editable },
      api.getSceneElementsIncludingDeleted()
    );

    applyingRemoteSceneRef.current = true;
    api.addFiles(Object.values(restored.files));
    api.updateScene({
      elements: restored.elements,
      appState: restored.appState,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    window.setTimeout(() => {
      applyingRemoteSceneRef.current = false;
    }, 0);
  }, []);

  const readYjsScene = useCallback((collab: CollabProvider): PersistedScene => ({
    ...readYjsScenePayload(collab),
  }), []);

  const writeYjsScene = useCallback((collab: CollabProvider, scene: PersistedScene) => {
    const nextScene = cloneScene(scene);
    const payload = serializeScene(nextScene);
    collab.ydoc.transact(() => {
      collab.yScene.set(scenePayloadKey, payload);
      collab.yScene.set(sceneRevisionKey, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }, collabOrigin);
  }, []);

  const updateRemoteCollaborators = useCallback((collab: CollabProvider) => {
    const api = excalidrawApiRef.current;
    if (isPointerDownRef.current) {
      pendingCollaboratorUpdateRef.current = collab;
      if (!collaboratorUpdateTimerRef.current) {
        collaboratorUpdateTimerRef.current = window.setTimeout(() => {
          collaboratorUpdateTimerRef.current = null;
          const pendingCollab = pendingCollaboratorUpdateRef.current;
          pendingCollaboratorUpdateRef.current = null;
          if (pendingCollab && !isPointerDownRef.current) {
            updateRemoteCollaborators(pendingCollab);
          }
        }, 80);
      }
      return;
    }

    const collaborators = new Map<SocketId, Collaborator>();
    const activeUsers: ActiveUser[] = [];

    collab.provider.awareness.getStates().forEach((state: any, clientId: number) => {
      const userColor = state.color ?? getCollaboratorColor(clientId);
      const userName = state.username || "Guest";
      const isCurrent = clientId === collab.provider.awareness.clientID;

      activeUsers.push({
        clientId,
        id: state.id,
        name: userName,
        email: state.email,
        color: userColor,
        isCurrent,
      });

      if (isCurrent) return;
      collaborators.set(String(clientId) as SocketId, {
        pointer: state.pointer,
        button: state.button,
        selectedElementIds: state.selectedElementIds,
        username: userName,
        color: userColor,
        id: state.id,
        socketId: String(clientId) as SocketId,
      });
    });

    activeUsers.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
    setActiveUsers(activeUsers);
    setCollaborators(activeUsers.length);
    api?.updateScene({
      appState: { collaborators },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    let collab: CollabProvider | null = null;
    setSceneReady(false);
    setInitialData(null);

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
          const isGuestEditor = board.access.role === "guest";
          const collaboratorName = isGuestEditor ? guestName.trim() : getCollaboratorName(session?.user?.name);

          if (isGuestEditor && !collaboratorName) {
            const scene = board.scene ?? {};
            lastSceneJsonRef.current = JSON.stringify(scene);
            setInitialData({ ...scene, appState: { ...scene.appState, viewModeEnabled: true } });
            setSceneReady(true);
            setGuestNameDialogOpen(true);
            return;
          }

          collab = createCollabProvider(id);
          providerRef.current = collab;
          collab.provider.awareness.setLocalStateField("username", collaboratorName);
          collab.provider.awareness.setLocalStateField("id", session?.user?.id ?? `guest-${collab.provider.awareness.clientID}`);
          collab.provider.awareness.setLocalStateField("email", session?.user?.email);
          collab.provider.awareness.setLocalStateField("color", getCollaboratorColor(collab.provider.awareness.clientID));
          collab.provider.awareness.on("change", (changes: any) => {
            const changedClients = [
              ...(changes?.added ?? []),
              ...(changes?.updated ?? []),
              ...(changes?.removed ?? []),
            ];
            const onlyLocalClientChanged =
              changedClients.length > 0 &&
              changedClients.every((clientId) => clientId === collab?.provider.awareness.clientID);
            if (onlyLocalClientChanged) return;

            if (collab) updateRemoteCollaborators(collab);
          });

          collab.yScene.observe((event) => {
            if (event.transaction.origin === collabOrigin || !collab) return;
            if (isKicked(collab)) {
              collab.provider.destroy();
              providerRef.current = null;
              navigate("/");
              return;
            }
            const scene = readYjsScene(collab);
            const sceneJson = JSON.stringify(scene);
            if (sceneJson === lastSceneJsonRef.current) return;
            lastSceneJsonRef.current = sceneJson;
            applyScene(scene, true);
          });

          collab.provider.on("sync", (synced: boolean) => {
            if (!synced || cancelled || !collab) return;
            const remoteScene = readYjsScene(collab);
            const hasRemoteScene =
              collab.yScene.has(scenePayloadKey) ||
              collab.yScene.has("elements") ||
              collab.yScene.has("appState") ||
              collab.yScene.has("files");
            const scene = cloneScene(hasRemoteScene ? remoteScene : board.scene ?? {});

            if (!hasRemoteScene) {
              writeYjsScene(collab, scene);
            }

            lastSceneJsonRef.current = JSON.stringify(scene);
            setInitialData({ ...scene, appState: { ...scene.appState, viewModeEnabled: false } });
            setSceneReady(true);
          });
          return;
        }

        const scene = board.scene ?? {};
        lastSceneJsonRef.current = JSON.stringify(scene);
        setInitialData({ ...scene, appState: { ...scene.appState, viewModeEnabled: true } });
        setSceneReady(true);
      })
      .catch(() => navigate("/"));

    return () => {
      cancelled = true;
      if (sceneSaveTimerRef.current) {
        window.clearTimeout(sceneSaveTimerRef.current);
      }
      if (sceneSyncTimerRef.current) {
        window.clearTimeout(sceneSyncTimerRef.current);
      }
      if (collaboratorUpdateTimerRef.current) {
        window.clearTimeout(collaboratorUpdateTimerRef.current);
      }
      collab?.provider.destroy();
      providerRef.current = null;
    };
  }, [applyScene, guestName, id, navigate, readYjsScene, session?.user?.id, session?.user?.name, updateRemoteCollaborators, writeYjsScene]);

  async function saveTitle(newTitle: string) {
    if (!activeCanEdit) return;

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

  async function removeActiveUser(user: ActiveUser) {
    if (!canManage || user.isCurrent) return;

    const collab = providerRef.current;
    const kickId = user.id ?? String(user.clientId);
    if (collab) {
      collab.yScene.set(`${kickKeyPrefix}${kickId}`, Date.now());
    }

    if (user.email) {
      await fetch(`/api/boards/${id}/members/${encodeURIComponent(user.email)}`, {
        method: "DELETE",
        credentials: "include",
      }).catch(() => undefined);
    }

    setActiveUsersOpen(false);
  }

  function toggleColorScheme() {
    setColorScheme((current) => current === "dark" ? "light" : "dark");
  }

  function submitGuestName() {
    const nextGuestName = guestNameInput.trim();
    if (!nextGuestName) return;

    window.localStorage.setItem("fosscalidraw.guestName", nextGuestName);
    setGuestName(nextGuestName);
    setGuestNameDialogOpen(false);
    setSceneReady(false);
  }

  function handleSceneChange(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) {
    if (!activeCanEdit || applyingRemoteSceneRef.current) return;
    scheduleSceneSync(elements, appState, files);
  }

  function scheduleSceneSync(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) {
    if (isPointerDownRef.current) {
      pendingSceneSyncRef.current = true;
      return;
    }

    if (sceneSyncTimerRef.current) {
      window.clearTimeout(sceneSyncTimerRef.current);
    }

    sceneSyncTimerRef.current = window.setTimeout(() => {
      sceneSyncTimerRef.current = null;
      if (isPointerDownRef.current) {
        pendingSceneSyncRef.current = true;
        return;
      }
      syncCurrentScene(elements, appState, files);
    }, 120);
  }

  function syncCurrentScene(
    fallbackElements: readonly OrderedExcalidrawElement[],
    fallbackAppState: AppState,
    fallbackFiles: BinaryFiles
  ) {
    const api = excalidrawApiRef.current;
    const currentAppState = api?.getAppState() ?? fallbackAppState;
    const scene = cloneScene({
      elements: api?.getSceneElementsIncludingDeleted() ?? fallbackElements,
      appState: pickPersistedAppState(currentAppState),
      files: api?.getFiles() ?? fallbackFiles,
    });
    const sceneJson = JSON.stringify(scene);
    if (sceneJson === lastSceneJsonRef.current) return;
    lastSceneJsonRef.current = sceneJson;

    const collab = providerRef.current;
    if (collab) {
      writeYjsScene(collab, scene);
    }
    saveScene(scene);
  }

  function flushPendingSceneSync() {
    const api = excalidrawApiRef.current;
    if (!api || !pendingSceneSyncRef.current) return;

    pendingSceneSyncRef.current = false;
    syncCurrentScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles()
    );
  }

  function flushPendingCollaboratorUpdate() {
    const pendingCollab = pendingCollaboratorUpdateRef.current;
    pendingCollaboratorUpdateRef.current = null;
    if (pendingCollab) {
      window.setTimeout(() => updateRemoteCollaborators(pendingCollab), 0);
    }
  }

  function handlePointerDown() {
    isPointerDownRef.current = true;
  }

  function handlePointerUp() {
    isPointerDownRef.current = false;
    flushPendingSceneSync();
    flushPendingCollaboratorUpdate();
  }

  function handlePointerUpdate(payload: {
    pointer: { x: number; y: number; tool: "pointer" | "laser" };
    button: "down" | "up";
  }) {
    const collab = providerRef.current;
    const api = excalidrawApiRef.current;
    if (!collab || !activeCanEdit || !api) return;

    isPointerDownRef.current = payload.button === "down";
    collab.provider.awareness.setLocalStateField("pointer", {
      ...payload.pointer,
      renderCursor: true,
    });
    collab.provider.awareness.setLocalStateField("button", payload.button);
    collab.provider.awareness.setLocalStateField("selectedElementIds", api.getAppState().selectedElementIds);

    if (payload.button === "up") {
      flushPendingSceneSync();
      flushPendingCollaboratorUpdate();
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "1rem",
        padding: "0 1rem", height: "48px", background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)", zIndex: 10, flexShrink: 0
      }}>
        <button
          className="btn-ghost"
          onClick={() => navigate("/")}
          aria-label={t("back")}
          title={t("back")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.35rem 0.55rem",
            color: "var(--color-text)",
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "1.1rem", lineHeight: 1 }}>←</span>
          <span>{t("back")}</span>
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          readOnly={!activeCanEdit}
          style={{
            border: "none", background: "transparent", fontWeight: 600,
            fontSize: "0.9rem", outline: "none", width: "200px"
          }}
        />
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <button
            className="btn-ghost"
            onClick={() => setActiveUsersOpen((open) => !open)}
            aria-expanded={activeUsersOpen}
            aria-label={t("activeUsers")}
            style={{ padding: "0.35rem 0.65rem", color: "var(--color-text-muted)" }}
          >
            {activeCanEdit ? t("boardOnline", { count: collaborators }) : t("boardViewOnly")}
          </button>
          {activeUsersOpen && (
            <div
              style={{
                position: "absolute", right: 0, top: "calc(100% + 0.45rem)",
                width: "260px", background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-md)", padding: "0.45rem", zIndex: 30,
                display: "grid", gap: "0.25rem"
              }}
            >
              <div style={{ padding: "0.35rem 0.45rem", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                {t("activeUsers")}
              </div>
              {activeUsers.length === 0 ? (
                <div style={{ padding: "0.45rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  {t("noActiveUsers")}
                </div>
              ) : activeUsers.map((user) => (
                <div
                  key={user.clientId}
                  style={{
                    display: "grid", gridTemplateColumns: "1.5rem 1fr auto", alignItems: "center",
                    gap: "0.5rem", padding: "0.4rem 0.45rem", borderRadius: "var(--radius-md)"
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "0.75rem", height: "0.75rem", borderRadius: "999px",
                      background: user.color?.background ?? "var(--color-primary)",
                      border: `1px solid ${user.color?.stroke ?? "var(--color-primary)"}`
                    }}
                  />
                  <span style={{ minWidth: 0, display: "grid" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.88rem" }}>
                      {user.name}{user.isCurrent ? ` ${t("youSuffix")}` : ""}
                    </span>
                    {user.email && (
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
                        {user.email}
                      </span>
                    )}
                  </span>
                  {canManage && !user.isCurrent && (
                    <button className="btn-ghost" onClick={() => removeActiveUser(user)} style={{ padding: "0.3rem 0.45rem" }}>
                      {t("removeUser")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          className="btn-ghost"
          onClick={toggleColorScheme}
          aria-label={colorScheme === "dark" ? t("useLightMode") : t("useDarkMode")}
          title={colorScheme === "dark" ? t("useLightMode") : t("useDarkMode")}
          style={{ padding: "0.35rem 0.55rem", color: "var(--color-text)" }}
        >
          {colorScheme === "dark" ? "Light" : "Dark"}
        </button>
        {canManage && (
          <button className="btn-primary" onClick={() => { setShareOpen(true); setShareStatus(""); }}>
            {t("share")}
          </button>
        )}
      </div>

      <div style={{ flex: 1 }}>
        {sceneReady ? (
          <Excalidraw
            key={activeCanEdit ? "editable" : "readonly"}
            UIOptions={excalidrawUiOptions}
            initialData={initialData}
            isCollaborating={activeCanEdit}
            onChange={handleSceneChange}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerUpdate={handlePointerUpdate}
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
              const pendingScene = pendingRemoteSceneRef.current;
              if (pendingScene) {
                pendingRemoteSceneRef.current = null;
                applyScene(pendingScene.scene, pendingScene.editable);
              }
              const collab = providerRef.current;
              if (collab) updateRemoteCollaborators(collab);
            }}
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
        ) : null}
      </div>

      {shareOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("shareBoard")}
          onClick={() => setShareOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "var(--color-overlay)",
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
                  padding: "0.55rem 0.7rem", background: "var(--color-control-bg)"
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
                    padding: "0.55rem 0.7rem", background: "var(--color-control-bg)"
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

      {guestNameDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("guestNameTitle")}
          style={{
            position: "fixed", inset: 0, background: "var(--color-overlay)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1rem", zIndex: 1100
          }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); submitGuestName(); }}
            style={{
              width: "100%", maxWidth: "360px", background: "var(--color-surface)",
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-md)", padding: "1.25rem", display: "grid", gap: "0.9rem"
            }}
          >
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>{t("guestNameTitle")}</h2>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                {t("guestNameDescription")}
              </p>
            </div>
            <input
              autoFocus
              value={guestNameInput}
              onChange={(e) => setGuestNameInput(e.target.value)}
              placeholder={t("guestNamePlaceholder")}
              style={{
                minWidth: 0, border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)", padding: "0.65rem 0.75rem"
              }}
            />
            <button className="btn-primary" type="submit" disabled={!guestNameInput.trim()}>
              {t("continueToBoard")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function getCollaboratorName(name?: string | null) {
  return name?.trim() || "Guest";
}

function getCollaboratorColor(clientId: number) {
  const palette = [
    { background: "#e3fafc", stroke: "#0b7285" },
    { background: "#fff3bf", stroke: "#e67700" },
    { background: "#ebfbee", stroke: "#2b8a3e" },
    { background: "#f3f0ff", stroke: "#6741d9" },
    { background: "#ffe3e3", stroke: "#c92a2a" },
    { background: "#e7f5ff", stroke: "#1971c2" },
  ];
  return palette[clientId % palette.length];
}

function cloneScene(scene: PersistedScene): PersistedScene {
  return {
    elements: cloneJson(scene.elements ?? []),
    appState: cloneJson(scene.appState ?? {}),
    files: cloneJson(scene.files ?? {}),
  };
}

function readYjsScenePayload(collab: CollabProvider): PersistedScene {
  const payload = collab.yScene.get(scenePayloadKey);
  if (typeof payload === "string") {
    try {
      return cloneScene(JSON.parse(payload));
    } catch {
      return { elements: [], appState: {}, files: {} };
    }
  }

  return {
    elements: cloneJson(collab.yScene.get("elements") ?? []),
    appState: cloneJson(collab.yScene.get("appState") ?? {}),
    files: cloneJson(collab.yScene.get("files") ?? {}),
  };
}

function isKicked(collab: CollabProvider) {
  const localState: any = collab.provider.awareness.getLocalState();
  const localId = localState?.id;
  return Boolean(
    (localId && collab.yScene.has(`${kickKeyPrefix}${localId}`)) ||
    collab.yScene.has(`${kickKeyPrefix}${collab.provider.awareness.clientID}`)
  );
}

function serializeScene(scene: PersistedScene) {
  return JSON.stringify(cloneScene(scene));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pickPersistedAppState(appState: AppState): PersistedScene["appState"] {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    theme: appState.theme,
  };
}
