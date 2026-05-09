import { IncomingMessage, Server } from "http";
import { createRequire } from "module";
import { WebSocketServer, WebSocket } from "ws";
import type { Doc } from "yjs";
import { getSession } from "@auth/express";
import { authConfig } from "../auth/auth.config.js";
import { getDevOidcSession } from "../auth/devOidc.js";
import { Board } from "../boards/boards.model.js";
import { config } from "../config.js";
import { getGuestId } from "../guests/guestIdentity.js";

const require = createRequire(import.meta.url);
const Y = require("yjs") as typeof import("yjs");
const { setupWSConnection, setPersistence } = require("y-websocket/bin/utils") as {
  setupWSConnection: (ws: WebSocket, req: IncomingMessage) => void;
  setPersistence: (persistence: {
    bindState: (docName: string, ydoc: import("yjs").Doc) => Promise<void>;
    writeState: (docName: string, ydoc: import("yjs").Doc) => Promise<void>;
  }) => void;
};
const { MongodbPersistence } = require("y-mongodb-provider") as typeof import("y-mongodb-provider");

export function initYjsServer(httpServer: Server) {
  const mdb = new MongodbPersistence(config.mongoUri!, {
    collectionName: "yjs-updates",
    multipleCollections: true,
  });

  setPersistence({
    bindState: async (docName: string, ydoc: Doc) => {
      const persistedDoc = await mdb.getYDoc(docName);
      const persistedSV = Y.encodeStateVector(persistedDoc);
      const diff = Y.encodeStateAsUpdate(ydoc, persistedSV);
      if (diff.reduce((sum: number, value: number) => sum + value, 0) > 0) {
        await mdb.storeUpdate(docName, diff);
      }
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedDoc));
      persistedDoc.destroy();
      ydoc.on("update", async (update: Uint8Array) => {
        await mdb.storeUpdate(docName, update);
      });
    },
    writeState: async (docName: string) => {
      await mdb.flushDocument(docName);
    },
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    setupWSConnection(ws, req);
  });

  httpServer.on("upgrade", async (req, socket, head) => {
    const match = req.url?.match(/^\/ws\/([a-f0-9]{24})$/);
    if (!match) { socket.destroy(); return; }
    const boardId = match[1];

    const session = getDevOidcSession(req as any) ?? await getSession(req as any, authConfig).catch(() => null);

    const board = await Board.findById(boardId).catch(() => null);
    if (!board) { socket.destroy(); return; }
    if (board.archived) { socket.destroy(); return; }

    const email = session?.user?.email;
    const guestId = getGuestId(req);
    const normalizedEmail = typeof email === "string" ? email.toLowerCase() : "";
    const isOwner = Boolean(email && board.ownerEmail === email);
    const isBlockedMember =
      !isOwner &&
      Boolean(normalizedEmail && board.blockedMembers?.some((m: any) => m.email?.toLowerCase() === normalizedEmail));
    const isBlockedGuest =
      Boolean(!email && guestId && board.blockedGuests?.some((g: any) => g.guestId === guestId));
    const hasAccess =
      !isBlockedMember &&
      !isBlockedGuest &&
      (
        board.publicAccess === "edit" ||
        isOwner ||
        board.members.some((m: any) => m.email?.toLowerCase() === normalizedEmail && m.role === "editor")
      );

    if (!hasAccess) { socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  console.log("Yjs WebSocket server initialized");
}
