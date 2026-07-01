import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export interface CollabProvider {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  yScene: Y.Map<any>;
  yElements: Y.Map<any>;
  yFiles: Y.Map<any>;
}

export function createCollabProvider(boardId: string): CollabProvider {
  const ydoc = new Y.Doc();

  // Use the same origin as the served app.
  const wsUrl = window.location.origin.replace(/^http/, "ws");

  const provider = new WebsocketProvider(
    `${wsUrl}/ws`,
    boardId,
    ydoc,
    { connect: true }
  );

  const yScene = ydoc.getMap<any>("excalidraw-scene");
  const yElements = ydoc.getMap<any>("excalidraw-elements");
  const yFiles = ydoc.getMap<any>("excalidraw-files");

  return { ydoc, provider, yScene, yElements, yFiles };
}
