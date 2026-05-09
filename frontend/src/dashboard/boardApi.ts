import type { PersistedScene } from "../collaboration/sceneSync";
import type { ActiveUser } from "../collaboration/presence";

export type PublicAccess = "private" | "view" | "edit";

export interface BoardAccess {
  role: string;
  canEdit: boolean;
  canManage: boolean;
  guestId?: string;
}

export interface BoardDetails {
  title: string;
  updatedAt?: string;
  publicAccess?: PublicAccess;
  scene?: PersistedScene;
  access: BoardAccess;
}

export async function fetchBoard(boardId: string) {
  const response = await fetch(`/api/boards/${boardId}`, { credentials: "include" });
  if (response.status === 401) return { status: "unauthorized" as const };
  if (!response.ok) return { status: "not-found" as const };

  return {
    status: "ok" as const,
    board: await response.json() as BoardDetails,
  };
}

export function persistBoardScene(boardId: string, scene: PersistedScene, keepalive = false) {
  return fetch(`/api/boards/${boardId}/scene`, {
    method: "PATCH",
    credentials: "include",
    keepalive,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene }),
  }).catch(() => undefined);
}

export function updateBoardTitle(boardId: string, title: string) {
  return fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function updateBoardPublicAccess(boardId: string, publicAccess: PublicAccess) {
  const response = await fetch(`/api/boards/${boardId}/share`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicAccess }),
  });

  return response.ok;
}

export async function inviteBoardMember(
  boardId: string,
  email: string,
  role: "editor" | "viewer"
) {
  const response = await fetch(`/api/boards/${boardId}/members`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });

  return response.ok;
}

export function removeActiveUserFromBoard(boardId: string, user: ActiveUser) {
  return fetch(`/api/boards/${boardId}/remove-active-user`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      guestId: user.guestId,
      name: user.name,
    }),
  }).catch(() => undefined);
}
