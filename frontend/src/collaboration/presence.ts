import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types";
import type { CollabProvider } from "./CollabProvider";

export interface ActiveUser {
  clientId: number;
  id?: string;
  guestId?: string;
  kickId?: string;
  name: string;
  email?: string;
  color?: { background: string; stroke: string };
  isCurrent: boolean;
}

export interface PresenceSnapshot {
  activeUsers: ActiveUser[];
  collaborators: Map<SocketId, Collaborator>;
}

export interface LocalPresence {
  username: string;
  id?: string;
  email?: string;
  guestId?: string;
  kickId: string;
}

export const kickKeyPrefix = "kick:";

export function getCollaboratorName(name?: string | null) {
  return name?.trim() || "Guest";
}

export function getCollaboratorColor(clientId: number) {
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

export function configureLocalPresence(collab: CollabProvider, presence: LocalPresence) {
  collab.provider.awareness.setLocalStateField("username", presence.username);
  collab.provider.awareness.setLocalStateField("id", presence.id);
  collab.provider.awareness.setLocalStateField("email", presence.email);
  collab.provider.awareness.setLocalStateField("guestId", presence.guestId);
  collab.provider.awareness.setLocalStateField("kickId", presence.kickId);
  collab.provider.awareness.setLocalStateField("color", getCollaboratorColor(collab.provider.awareness.clientID));
}

export function collectPresence(collab: CollabProvider): PresenceSnapshot {
  const collaborators = new Map<SocketId, Collaborator>();
  const activeUsers: ActiveUser[] = [];

  collab.provider.awareness.getStates().forEach((state: any, clientId: number) => {
    const userColor = state.color ?? getCollaboratorColor(clientId);
    const userName = state.username || "Guest";
    const isCurrent = clientId === collab.provider.awareness.clientID;

    activeUsers.push({
      clientId,
      id: state.id,
      guestId: state.guestId,
      kickId: state.kickId,
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
  return { activeUsers, collaborators };
}

export function isOnlyLocalAwarenessChange(collab: CollabProvider, changes: any) {
  const changedClients = [
    ...(changes?.added ?? []),
    ...(changes?.updated ?? []),
    ...(changes?.removed ?? []),
  ];
  return (
    changedClients.length > 0 &&
    changedClients.every((clientId) => clientId === collab.provider.awareness.clientID)
  );
}

export function markKicked(collab: CollabProvider, kickId: string) {
  collab.yScene.set(`${kickKeyPrefix}${kickId}`, Date.now());
}

export function isKicked(collab: CollabProvider) {
  const localState: any = collab.provider.awareness.getLocalState();
  const localKickId = localState?.kickId;
  return Boolean(
    (localKickId && collab.yScene.has(`${kickKeyPrefix}${localKickId}`)) ||
    collab.yScene.has(`${kickKeyPrefix}${localState?.id}`) ||
    collab.yScene.has(`${kickKeyPrefix}client:${collab.provider.awareness.clientID}`)
  );
}
