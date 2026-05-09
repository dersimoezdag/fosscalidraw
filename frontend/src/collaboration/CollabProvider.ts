import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export interface CollabProvider {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  yScene: Y.Map<any>;
}

export function createCollabProvider(boardId: string): CollabProvider {
  const ydoc = new Y.Doc();

  // Use relative WS URL — nginx proxies /ws to backend
  const wsUrl = window.location.origin.replace(/^http/, "ws");

  const provider = new WebsocketProvider(
    `${wsUrl}/ws`,
    boardId,
    ydoc,
    { connect: true }
  );

  const yScene = ydoc.getMap<any>("excalidraw-scene");

  return { ydoc, provider, yScene };
}
