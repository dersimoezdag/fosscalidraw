import { IncomingMessage, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
// @ts-ignore
import { setupWSConnection, setPersistence } from "y-websocket/bin/utils";
import { MongodbPersistence } from "y-mongodb-provider";
import * as Y from "yjs";
import { getSession } from "@auth/express";
import { authConfig } from "../auth/auth.config.js";
import { getDevOidcSession } from "../auth/devOidc.js";
import { Board } from "../boards/boards.model.js";
import { config } from "../config.js";
import { getGuestId } from "../guests/guestIdentity.js";

export function initYjsServer(httpServer: Server) {
  const mdb = new MongodbPersistence(config.mongoUri!, {
    collectionName: "yjs-updates",
    multipleCollections: true,
  });

  setPersistence({
    bindState: async (docName: string, ydoc: Y.Doc) => {
      const persistedDoc = await mdb.getYDoc(docName);
      const persistedSV = Y.encodeStateVector(persistedDoc);
      const diff = Y.encodeStateAsUpdate(ydoc, persistedSV);
      if (diff.some((v: number) => v > 0)) {
        mdb.storeUpdate(docName, diff);
      }
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedDoc));
      ydoc.on("update", (update: Uint8Array) => {
        mdb.storeUpdate(docName, update);
      });
    },
    writeState: () => Promise.resolve(),
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
