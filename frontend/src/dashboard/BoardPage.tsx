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
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { createCollabProvider, CollabProvider } from "../collaboration/CollabProvider";
import {
  cloneScene,
  collabOrigin,
  createSceneSnapshot,
  BoardBackgroundStyle,
  dottedBackgroundAppStateKey,
  getNextLiveSceneSyncDelay,
  getYjsSceneUpdatedAt,
  hasYjsScene,
  initialLiveSceneSyncDelayMs,
  isEmptyScene,
  mergeScenes,
  PersistedScene,
  readYjsScene,
  sceneSyncDelayMs,
  writeYjsScene,
} from "../collaboration/sceneSync";
import {
  ActiveUser,
  collectPresence,
  configureLocalPresence,
  getCollaboratorName,
  isKicked,
  isOnlyLocalAwarenessChange,
  markKicked,
} from "../collaboration/presence";
import { useSession } from "../auth/useSession";
import { ThemeToggle } from "../theme/ThemeToggle";
import { useColorScheme } from "../theme/useColorScheme";
import {
  BoardAccess,
  BoardDetails,
  fetchBoard,
  inviteBoardMember,
  persistBoardScene,
  PublicAccess,
  removeActiveUserFromBoard,
  updateBoardPublicAccess,
  updateBoardTitle,
} from "./boardApi";

const excalidrawUiOptions = {
  dockedSidebarBreakpoint: Number.MAX_SAFE_INTEGER,
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
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const providerRef = useRef<CollabProvider | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingRemoteSceneRef = useRef<{ scene: PersistedScene; editable: boolean } | null>(null);
  const applyingRemoteSceneRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const pendingCollaboratorUpdateRef = useRef<CollabProvider | null>(null);
  const collaboratorUpdateTimerRef = useRef<number | null>(null);
  const pendingSceneSyncRef = useRef(false);
  const pendingSceneSyncPayloadRef = useRef<{
    elements: readonly OrderedExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);
  const liveSceneSyncDelayRef = useRef(initialLiveSceneSyncDelayMs);
  const sceneSyncTimerRef = useRef<number | null>(null);
  const sceneSaveTimerRef = useRef<number | null>(null);
  const lastSceneJsonRef = useRef("");
  const lastSceneRef = useRef<PersistedScene | null>(null);
  const backgroundStyleRef = useRef<BoardBackgroundStyle>("solid");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const { colorScheme } = useColorScheme();
  const [title, setTitle] = useState(t("boardUntitled"));
  const [titleDraft, setTitleDraft] = useState(title);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [backgroundStyle, setBackgroundStyle] = useState<BoardBackgroundStyle>("solid");
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
  const canRenameBoard = access?.role === "owner";
  const excalidrawLangCode = i18n.language.toLowerCase().startsWith("de") ? "de-DE" : "en";

  const persistScene = useCallback((scene: PersistedScene, keepalive = false) => {
    if (!id) return;
    return persistBoardScene(id, scene, keepalive);
  }, [id]);

  const saveScene = useCallback((scene: PersistedScene, immediate = false) => {
    if (!id) return;
    if (sceneSaveTimerRef.current) {
      window.clearTimeout(sceneSaveTimerRef.current);
      sceneSaveTimerRef.current = null;
    }
    if (immediate) {
      void persistScene(scene, true);
      return;
    }
    sceneSaveTimerRef.current = window.setTimeout(() => {
      sceneSaveTimerRef.current = null;
      void persistScene(scene);
    }, 600);
  }, [id, persistScene]);

  const applyScene = useCallback((scene: PersistedScene, editable: boolean) => {
    const api = excalidrawApiRef.current;
    if (!api) {
      pendingRemoteSceneRef.current = { scene, editable };
      return;
    }

    const localScene = createSceneSnapshot(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles()
    );
    const nextScene = withBoardBackgroundStyle(mergeScenes(localScene, scene), getSceneBackgroundStyle(scene));
    setBoardBackgroundStyle(getSceneBackgroundStyle(nextScene));
    const restored = restore(
      nextScene,
      { viewModeEnabled: !editable },
      api.getSceneElementsIncludingDeleted()
    );

    lastSceneJsonRef.current = JSON.stringify(nextScene);
    lastSceneRef.current = nextScene;
    applyingRemoteSceneRef.current = true;
    api.addFiles(Object.values(restored.files));
    api.updateScene({
      elements: restored.elements,
      appState: { viewModeEnabled: !editable },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    window.setTimeout(() => {
      applyingRemoteSceneRef.current = false;
    }, 0);
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

    const { activeUsers, collaborators } = collectPresence(collab);
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

    fetchBoard(id)
      .then((result) => {
        if (result.status === "unauthorized") {
          navigate("/login");
          return null;
        }
        if (result.status !== "ok") {
          navigate("/");
          return null;
        }
        return result.board;
      })
      .then((board: BoardDetails | null) => {
        if (!board || cancelled) return;

        setTitle(board.title);
        setTitleDraft(board.title);
        setAccess(board.access);
        setPublicAccess(board.publicAccess ?? "private");

        if (board.access.canEdit) {
          const isGuestEditor = board.access.role === "guest";
          const collaboratorName = isGuestEditor ? guestName.trim() : getCollaboratorName(session?.user?.name);
          const kickId = session?.user?.email
            ? `user:${session.user.email.toLowerCase()}`
            : board.access.guestId
              ? `guest:${board.access.guestId}`
              : `client:${collab?.provider.awareness.clientID ?? "pending"}`;

          if (isGuestEditor && !collaboratorName) {
            const scene = board.scene ?? {};
            setBoardBackgroundStyle(getSceneBackgroundStyle(scene));
            lastSceneJsonRef.current = JSON.stringify(scene);
            setInitialData({ ...scene, appState: { ...scene.appState, viewModeEnabled: true } });
            setSceneReady(true);
            setGuestNameDialogOpen(true);
            return;
          }

          collab = createCollabProvider(id);
          providerRef.current = collab;
          configureLocalPresence(collab, {
            username: collaboratorName,
            id: session?.user?.id ?? board.access.guestId ?? `guest-${collab.provider.awareness.clientID}`,
            email: session?.user?.email,
            guestId: board.access.guestId,
            kickId,
          });
          collab.provider.awareness.on("change", (changes: any) => {
            if (!collab || isOnlyLocalAwarenessChange(collab, changes)) return;

            if (collab) updateRemoteCollaborators(collab);
          });

          const handleRemoteSceneUpdate = (event: { transaction: { origin: unknown } }) => {
            if (event.transaction.origin === collabOrigin || !collab) return;
            if (isKicked(collab)) {
              collab.provider.destroy();
              providerRef.current = null;
              navigate("/");
              return;
            }
            const remoteScene = readYjsScene(collab);
            const scene = withBoardBackgroundStyle(mergeScenes(lastSceneRef.current, remoteScene), getSceneBackgroundStyle(remoteScene));
            const sceneJson = JSON.stringify(scene);
            if (sceneJson === lastSceneJsonRef.current) return;
            applyScene(scene, true);
          };
          collab.yScene.observe(handleRemoteSceneUpdate);
          collab.yElements.observe(handleRemoteSceneUpdate);
          collab.yFiles.observe(handleRemoteSceneUpdate);

          collab.provider.on("sync", (synced: boolean) => {
            if (!synced || cancelled || !collab) return;
            const remoteScene = readYjsScene(collab);
            const hasRemoteScene = hasYjsScene(collab);
            const remoteUpdatedAt = getYjsSceneUpdatedAt(collab);
            const boardUpdatedAt = board.updatedAt ? Date.parse(board.updatedAt) : 0;
            const boardScene = board.scene ?? {};
            const shouldUseRemoteScene =
              hasRemoteScene &&
              !isEmptyScene(remoteScene) &&
              (
                remoteUpdatedAt
                  ? (!boardUpdatedAt || remoteUpdatedAt >= boardUpdatedAt)
                  : isEmptyScene(boardScene)
              );
            const scene = withBoardBackgroundStyle(
              cloneScene(shouldUseRemoteScene ? remoteScene : boardScene),
              getSceneBackgroundStyle(shouldUseRemoteScene ? remoteScene : boardScene)
            );

            if (!shouldUseRemoteScene) {
              writeYjsScene(collab, scene);
            }

            setBoardBackgroundStyle(getSceneBackgroundStyle(scene));
            lastSceneJsonRef.current = JSON.stringify(scene);
            lastSceneRef.current = scene;
            setInitialData({ ...scene, appState: { ...scene.appState, viewModeEnabled: false } });
            setSceneReady(true);
          });
          return;
        }

        const scene = board.scene ?? {};
        setBoardBackgroundStyle(getSceneBackgroundStyle(scene));
        lastSceneJsonRef.current = JSON.stringify(scene);
        setInitialData({ ...scene, appState: { ...scene.appState, viewModeEnabled: true } });
        setSceneReady(true);
      })
      .catch(() => navigate("/"));

    return () => {
      cancelled = true;
      flushPendingSceneSync();
      if (sceneSaveTimerRef.current && lastSceneRef.current) {
        saveScene(lastSceneRef.current, true);
      }
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

  useEffect(() => {
    const flushBeforeUnload = () => {
      flushPendingSceneSync();
      if (lastSceneRef.current) {
        saveScene(lastSceneRef.current, true);
      }
    };

    window.addEventListener("pagehide", flushBeforeUnload);
    return () => window.removeEventListener("pagehide", flushBeforeUnload);
  });

  useEffect(() => {
    if (!isRenamingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isRenamingTitle]);

  async function saveTitle(newTitle: string) {
    if (!canRenameBoard || !id) return;

    const nextTitle = newTitle.trim() || t("boardUntitled");
    const previousTitle = title;
    setTitle(nextTitle);
    setTitleDraft(nextTitle);
    setIsRenamingTitle(false);

    const response = await updateBoardTitle(id, nextTitle);
    if (!response.ok) {
      setTitle(previousTitle);
      setTitleDraft(previousTitle);
    }
  }

  function startRenamingTitle() {
    if (!canRenameBoard) return;
    setTitleDraft(title);
    setIsRenamingTitle(true);
  }

  function cancelRenamingTitle() {
    setTitleDraft(title);
    setIsRenamingTitle(false);
  }

  async function copyBoardLink() {
    await navigator.clipboard.writeText(window.location.href);
    setShareStatus(t("linkCopied"));
  }

  async function updatePublicAccess(nextAccess: PublicAccess) {
    if (!id) return;

    if (!await updateBoardPublicAccess(id, nextAccess)) {
      setShareStatus(t("guestAccessUpdateFailed"));
      return;
    }

    setPublicAccess(nextAccess);
    setShareStatus(t("guestAccessUpdated"));
  }

  async function inviteMember() {
    if (!id || !inviteEmail.trim()) return;

    if (!await inviteBoardMember(id, inviteEmail.trim(), inviteRole)) {
      setShareStatus(t("memberInviteFailed"));
      return;
    }

    setInviteEmail("");
    setShareStatus(t("memberInvited"));
  }

  async function removeActiveUser(user: ActiveUser) {
    if (!id || !canManage || user.isCurrent) return;

    const collab = providerRef.current;
    const kickId = user.kickId ?? user.id ?? `client:${user.clientId}`;
    if (collab) {
      markKicked(collab, kickId);
    }

    await removeActiveUserFromBoard(id, user);

    setActiveUsersOpen(false);
  }

  function submitGuestName() {
    const nextGuestName = guestNameInput.trim();
    if (!nextGuestName) return;

    window.localStorage.setItem("fosscalidraw.guestName", nextGuestName);
    setGuestName(nextGuestName);
    setGuestNameDialogOpen(false);
    setSceneReady(false);
  }

  function updateDottedBackgroundViewport(appState: Partial<AppState>) {
    const container = canvasContainerRef.current;
    if (!container) return;

    const zoom = Math.max(0.05, getZoomValue(appState.zoom));
    const worldGridSize = getSteppedWorldGridSize(zoom);
    const screenGridSize = worldGridSize * zoom;
    const scrollX = typeof appState.scrollX === "number" ? appState.scrollX : 0;
    const scrollY = typeof appState.scrollY === "number" ? appState.scrollY : 0;

    container.style.setProperty("--board-dot-size", `${getDotSize(screenGridSize)}px`);
    container.style.setProperty("--board-dot-grid-size", `${screenGridSize}px`);
    container.style.setProperty("--board-dot-offset-x", `${scrollX * zoom}px`);
    container.style.setProperty("--board-dot-offset-y", `${scrollY * zoom}px`);
  }

  function handleSceneChange(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) {
    updateDottedBackgroundViewport(appState);
    if (!activeCanEdit || applyingRemoteSceneRef.current) return;
    scheduleSceneSync(elements, appState, files);
  }

  function scheduleSceneSync(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) {
    pendingSceneSyncRef.current = true;
    pendingSceneSyncPayloadRef.current = { elements, appState, files };

    if (isPointerDownRef.current) {
      if (sceneSyncTimerRef.current) return;

      sceneSyncTimerRef.current = window.setTimeout(() => {
        sceneSyncTimerRef.current = null;
        const payload = pendingSceneSyncPayloadRef.current;
        if (payload) {
          syncCurrentScene(payload.elements, payload.appState, payload.files);
        }
      }, liveSceneSyncDelayRef.current);
      return;
    }

    if (sceneSyncTimerRef.current) {
      window.clearTimeout(sceneSyncTimerRef.current);
    }

    sceneSyncTimerRef.current = window.setTimeout(() => {
      sceneSyncTimerRef.current = null;
      const payload = pendingSceneSyncPayloadRef.current;
      if (payload) {
        syncCurrentScene(payload.elements, payload.appState, payload.files);
      }
    }, sceneSyncDelayMs);
  }

  function syncCurrentScene(
    fallbackElements: readonly OrderedExcalidrawElement[],
    fallbackAppState: AppState,
    fallbackFiles: BinaryFiles,
    persistImmediately = false
  ) {
    const api = excalidrawApiRef.current;
    const currentAppState = api?.getAppState() ?? fallbackAppState;
    const scene = createSceneSnapshot(
      api?.getSceneElementsIncludingDeleted() ?? fallbackElements,
      currentAppState,
      api?.getFiles() ?? fallbackFiles
    );
    const nextAppState = {
      ...(scene.appState ?? {}),
      [dottedBackgroundAppStateKey]: backgroundStyleRef.current,
    } as PersistedScene["appState"];
    scene.appState = nextAppState;
    const sceneJson = JSON.stringify(scene);
    if (sceneJson === lastSceneJsonRef.current) {
      updateLiveSceneSyncDelay(scene, sceneJson.length, 0, false);
      pendingSceneSyncRef.current = false;
      return;
    }
    lastSceneJsonRef.current = sceneJson;
    lastSceneRef.current = scene;

    const collab = providerRef.current;
    const syncStartedAt = performance.now();
    let changed = false;
    if (collab) {
      changed = writeYjsScene(collab, scene);
    }
    updateLiveSceneSyncDelay(scene, sceneJson.length, performance.now() - syncStartedAt, changed);
    pendingSceneSyncRef.current = false;
    saveScene(scene, persistImmediately);
  }

  function updateLiveSceneSyncDelay(
    scene: PersistedScene,
    sceneJsonLength: number,
    syncDurationMs: number,
    changed: boolean
  ) {
    if (!isPointerDownRef.current) return;

    const collab = providerRef.current;
    liveSceneSyncDelayRef.current = getNextLiveSceneSyncDelay({
      currentDelay: liveSceneSyncDelayRef.current,
      sceneJsonLength,
      elementCount: scene.elements?.length ?? 0,
      fileCount: Object.keys(scene.files ?? {}).length,
      syncDurationMs,
      connected: Boolean(!collab || (collab.provider as any).wsconnected),
      changed,
    });
  }

  function flushPendingSceneSync() {
    const api = excalidrawApiRef.current;
    if (!api || !pendingSceneSyncRef.current) return;

    if (sceneSyncTimerRef.current) {
      window.clearTimeout(sceneSyncTimerRef.current);
      sceneSyncTimerRef.current = null;
    }
    pendingSceneSyncRef.current = false;
    syncCurrentScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      true
    );
  }

  function flushPendingRemoteScene() {
    if (!pendingRemoteSceneRef.current || isPointerDownRef.current) return;

    const pendingScene = pendingRemoteSceneRef.current;
    pendingRemoteSceneRef.current = null;
    const collab = providerRef.current;
    applyScene(collab ? readYjsScene(collab) : pendingScene.scene, pendingScene.editable);
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
    flushPendingRemoteScene();
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
      flushPendingRemoteScene();
      flushPendingCollaboratorUpdate();
    }
  }

  function updateBoardBackgroundStyle(nextStyle: BoardBackgroundStyle) {
    if (!activeCanEdit) return;

    setBoardBackgroundStyle(nextStyle);
    const api = excalidrawApiRef.current;
    if (!api) return;

    updateDottedBackgroundViewport(api.getAppState());
    syncCurrentScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      true
    );
  }

  function setBoardBackgroundStyle(nextStyle: BoardBackgroundStyle) {
    backgroundStyleRef.current = nextStyle;
    setBackgroundStyle(nextStyle);
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
        <div style={{
          display: "flex", alignItems: "center", gap: "0.35rem",
          minWidth: 0, maxWidth: "min(360px, 42vw)"
        }}>
          {isRenamingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={(e) => saveTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTitle((e.target as HTMLInputElement).value);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRenamingTitle();
                }
              }}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg)",
                color: "var(--color-text)",
                fontWeight: 600,
                fontSize: "0.9rem",
                outline: "none",
                width: "220px",
                maxWidth: "100%",
                padding: "0.35rem 0.5rem",
              }}
            />
          ) : (
            <span
              title={title}
              style={{
                fontWeight: 600,
                fontSize: "0.9rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </span>
          )}
          {canRenameBoard && !isRenamingTitle && (
            <button
              type="button"
              className="btn-ghost"
              onClick={startRenamingTitle}
              aria-label={t("renameBoard")}
              title={t("renameBoard")}
              style={{
                width: "30px",
                height: "30px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="m14 8 2 2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
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
        <ThemeToggle />
        {canManage && (
          <button className="btn-primary" onClick={() => { setShareOpen(true); setShareStatus(""); }}>
            {t("share")}
          </button>
        )}
      </div>

      <div
        ref={canvasContainerRef}
        className={backgroundStyle === "dotted" ? "fosscalidraw-board-canvas fosscalidraw-board-canvas--dotted" : "fosscalidraw-board-canvas"}
        style={{ flex: 1, position: "relative" }}
      >
        {sceneReady ? (
          <Excalidraw
            key={activeCanEdit ? "editable" : "readonly"}
            UIOptions={excalidrawUiOptions}
            initialData={initialData}
            langCode={excalidrawLangCode}
            theme={colorScheme}
            isCollaborating={activeCanEdit}
            onChange={handleSceneChange}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerUpdate={handlePointerUpdate}
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
              updateDottedBackgroundViewport(api.getAppState());
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
              {activeCanEdit && (
                <MainMenu.Item
                  onSelect={() => updateBoardBackgroundStyle(backgroundStyle === "dotted" ? "solid" : "dotted")}
                >
                  <span className="board-background-switch-row">
                    <span>{t("backgroundDotted")}</span>
                    <span
                      className="board-background-switch"
                      role="switch"
                      aria-checked={backgroundStyle === "dotted"}
                    >
                      <span className="board-background-switch__thumb" />
                    </span>
                  </span>
                </MainMenu.Item>
              )}
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

function getSceneBackgroundStyle(scene: PersistedScene): BoardBackgroundStyle {
  const appState = (scene.appState ?? {}) as Record<string, unknown>;
  return appState[dottedBackgroundAppStateKey] === "dotted" ? "dotted" : "solid";
}

function withBoardBackgroundStyle(scene: PersistedScene, style: BoardBackgroundStyle): PersistedScene {
  return {
    ...scene,
    appState: {
      ...(scene.appState ?? {}),
      [dottedBackgroundAppStateKey]: style,
    } as PersistedScene["appState"],
  };
}

function getZoomValue(zoom: AppState["zoom"] | undefined): number {
  if (typeof zoom === "number") return zoom;
  if (zoom && typeof zoom.value === "number") return zoom.value;
  return 1;
}

function getSteppedWorldGridSize(zoom: number): number {
  const targetScreenGridSize = 28;
  const rawWorldGridSize = targetScreenGridSize / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(rawWorldGridSize));
  const normalized = rawWorldGridSize / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return step * magnitude;
}

function getDotSize(screenGridSize: number): number {
  return Math.max(1, Math.min(2, screenGridSize / 18));
}
