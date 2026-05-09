import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { CollabProvider } from "./CollabProvider";

export interface PersistedScene {
  elements?: readonly OrderedExcalidrawElement[];
  appState?: ExcalidrawInitialDataState["appState"];
  files?: BinaryFiles;
}

export const collabOrigin = "fosscalidraw-local";
export const sceneSyncDelayMs = 120;
export const minLiveSceneSyncDelayMs = 12;
export const maxLiveSceneSyncDelayMs = 80;
export const initialLiveSceneSyncDelayMs = 16;

interface LiveSceneSyncPressure {
  currentDelay: number;
  sceneJsonLength: number;
  elementCount: number;
  fileCount: number;
  syncDurationMs: number;
  connected: boolean;
  changed: boolean;
}

const scenePayloadKey = "payload";
const sceneRevisionKey = "revision";

export function createSceneSnapshot(
  elements: readonly OrderedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles
): PersistedScene {
  return cloneScene({
    elements,
    appState: pickPersistedAppState(appState),
    files,
  });
}

export function cloneScene(scene: PersistedScene): PersistedScene {
  return {
    elements: cloneJson(scene.elements ?? []),
    appState: pickPersistedAppState(scene.appState ?? {}),
    files: cloneJson(scene.files ?? {}),
  };
}

export function readYjsScene(collab: CollabProvider): PersistedScene {
  if (collab.yElements.size > 0 || collab.yFiles.size > 0) {
    return {
      elements: orderElements(Array.from(collab.yElements.values())),
      appState: {},
      files: Object.fromEntries(collab.yFiles.entries()) as BinaryFiles,
    };
  }

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
    appState: pickPersistedAppState(collab.yScene.get("appState") ?? {}),
    files: cloneJson(collab.yScene.get("files") ?? {}),
  };
}

export function writeYjsScene(collab: CollabProvider, scene: PersistedScene) {
  const nextScene = cloneScene(scene);
  let changed = false;

  collab.ydoc.transact(() => {
    changed = writeYjsScenePayload(collab, nextScene);
    if (changed) {
      collab.yScene.set(sceneRevisionKey, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
  }, collabOrigin);

  return changed;
}

export function getYjsSceneUpdatedAt(collab: CollabProvider) {
  const revision = collab.yScene.get(sceneRevisionKey);
  if (typeof revision !== "string") return 0;

  const timestamp = Number(revision.split("-")[0]);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function hasYjsScene(collab: CollabProvider) {
  return (
    collab.yElements.size > 0 ||
    collab.yFiles.size > 0 ||
    collab.yScene.has(sceneRevisionKey) ||
    collab.yScene.has(scenePayloadKey) ||
    collab.yScene.has("elements") ||
    collab.yScene.has("appState") ||
    collab.yScene.has("files")
  );
}

export function getNextLiveSceneSyncDelay({
  currentDelay,
  sceneJsonLength,
  elementCount,
  fileCount,
  syncDurationMs,
  connected,
  changed,
}: LiveSceneSyncPressure) {
  let targetDelay = minLiveSceneSyncDelayMs;

  if (!connected) {
    targetDelay = maxLiveSceneSyncDelayMs;
  } else {
    const sceneWeight =
      elementCount +
      fileCount * 30 +
      Math.ceil(sceneJsonLength / 8_000);

    if (sceneWeight > 800) targetDelay = Math.max(targetDelay, 48);
    else if (sceneWeight > 400) targetDelay = Math.max(targetDelay, 32);
    else if (sceneWeight > 180) targetDelay = Math.max(targetDelay, 20);

    if (syncDurationMs > 24) targetDelay = Math.max(targetDelay, 64);
    else if (syncDurationMs > 14) targetDelay = Math.max(targetDelay, 40);
    else if (syncDurationMs > 8) targetDelay = Math.max(targetDelay, 24);

    if (!changed) {
      targetDelay = Math.max(targetDelay, 24);
    }
  }

  if (targetDelay > currentDelay) {
    return clampDelay(Math.min(targetDelay, currentDelay + 16));
  }

  return clampDelay(Math.max(targetDelay, currentDelay - 2));
}

export function isEmptyScene(scene: PersistedScene) {
  return (
    (scene.elements?.length ?? 0) === 0 &&
    Object.keys(scene.files ?? {}).length === 0 &&
    Object.keys(scene.appState ?? {}).length === 0
  );
}

export function mergeScenes(
  localScene: PersistedScene | null | undefined,
  remoteScene: PersistedScene
): PersistedScene {
  const elementsById = new Map<string, OrderedExcalidrawElement>();

  for (const element of localScene?.elements ?? []) {
    elementsById.set(element.id, cloneJson(element));
  }

  for (const remoteElement of remoteScene.elements ?? []) {
    const localElement = elementsById.get(remoteElement.id);
    if (shouldReplaceElement(localElement, remoteElement)) {
      elementsById.set(remoteElement.id, cloneJson(remoteElement));
    }
  }

  return {
    elements: orderElements(Array.from(elementsById.values())),
    appState: {
      ...pickPersistedAppState(localScene?.appState ?? {}),
      ...pickPersistedAppState(remoteScene.appState ?? {}),
    },
    files: {
      ...(localScene?.files ?? {}),
      ...(remoteScene.files ?? {}),
    },
  };
}

export function pickPersistedAppState(_appState: Partial<AppState>): PersistedScene["appState"] {
  return {};
}

function writeYjsScenePayload(collab: CollabProvider, scene: PersistedScene) {
  let changed = false;
  for (const element of scene.elements ?? []) {
    const currentElement = collab.yElements.get(element.id);
    if (shouldReplaceElement(currentElement, element)) {
      collab.yElements.set(element.id, cloneJson(element));
      changed = true;
    }
  }

  Object.entries(scene.files ?? {}).forEach(([fileId, file]) => {
    const currentFile = collab.yFiles.get(fileId);
    if (JSON.stringify(currentFile) !== JSON.stringify(file)) {
      collab.yFiles.set(fileId, cloneJson(file));
      changed = true;
    }
  });

  [scenePayloadKey, "elements", "appState", "files"].forEach((legacyKey) => {
    if (collab.yScene.has(legacyKey)) {
      collab.yScene.delete(legacyKey);
      changed = true;
    }
  });

  return changed;
}

function orderElements(elements: OrderedExcalidrawElement[]) {
  return elements.sort((a, b) => {
    const aIndex = "index" in a ? String(a.index) : "";
    const bIndex = "index" in b ? String(b.index) : "";
    if (aIndex && bIndex && aIndex !== bIndex) return aIndex.localeCompare(bIndex);
    return a.id.localeCompare(b.id);
  });
}

function shouldReplaceElement(
  currentElement: OrderedExcalidrawElement | undefined,
  nextElement: OrderedExcalidrawElement
) {
  if (!currentElement) return true;
  const currentVersion = Number(currentElement.version ?? 0);
  const nextVersion = Number(nextElement.version ?? 0);
  if (nextVersion !== currentVersion) return nextVersion > currentVersion;

  const currentUpdated = Number(currentElement.updated ?? 0);
  const nextUpdated = Number(nextElement.updated ?? 0);
  if (nextUpdated !== currentUpdated) return nextUpdated > currentUpdated;

  return Number(nextElement.versionNonce ?? 0) > Number(currentElement.versionNonce ?? 0);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clampDelay(delay: number) {
  return Math.min(maxLiveSceneSyncDelayMs, Math.max(minLiveSceneSyncDelayMs, Math.round(delay)));
}
