import { NextFunction, Request, Response, Router } from "express";
import { Board } from "./boards.model.js";
import { optionalAuth, requireAuth } from "../middleware/authGuard.js";
import { apiTokenAuth } from "../middleware/apiTokenAuth.js";
import { getOrSetGuestId } from "../guests/guestIdentity.js";

export const boardsRouter = Router();

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const asyncRoute = (handler: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

boardsRouter.get("/:id", optionalAuth, asyncRoute(async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }

  const guestId = getOrSetGuestId(req, res);
  const access = getBoardAccess(board, (req as any).user, guestId);
  if (!access.canView) { res.status(401).json({ error: "Unauthorized" }); return; }

  res.json({
    ...board.toObject(),
    access: {
      role: access.role,
      canEdit: access.canEdit,
      canManage: access.canManage,
      guestId: access.role === "guest" ? guestId : undefined,
    },
  });
}));

boardsRouter.patch("/:id/scene", optionalAuth, asyncRoute(async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }

  const access = getBoardAccess(board, (req as any).user, getOrSetGuestId(req, res));
  if (!access.canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  board.scene = normalizeScene(req.body.scene);
  await board.save();
  res.json({ ok: true, updatedAt: board.updatedAt });
}));

boardsRouter.use(apiTokenAuth);
boardsRouter.use(requireAuth);

boardsRouter.get("/", asyncRoute(async (req, res) => {
  const user = (req as any).user;
  const boards = await Board.find({
    $or: [{ ownerEmail: user.email }, { "members.email": user.email }],
  })
    .select("title updatedAt ownerEmail archived scene.elements scene.appState")
    .sort({ updatedAt: -1 });

  res.json(boards.map((board) => {
    const data = board.toObject();
    const scene = normalizeScene(data.scene);
    return {
      _id: data._id,
      title: data.title,
      updatedAt: data.updatedAt,
      ownerEmail: data.ownerEmail,
      archived: data.archived,
      preview: {
        elements: scene.elements.filter((element: any) => !element?.isDeleted).slice(0, 120),
        appState: {
          viewBackgroundColor: scene.appState.viewBackgroundColor,
          fosscalidrawBackgroundStyle: scene.appState.fosscalidrawBackgroundStyle,
        },
      },
    };
  }));
}));

boardsRouter.post("/", asyncRoute(async (req, res) => {
  const user = (req as any).user;
  const board = await Board.create({
    title: typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : "Untitled Board",
    ownerId: user.id,
    ownerEmail: user.email,
    members: [],
    blockedMembers: [],
    blockedGuests: [],
    publicAccess: "private",
    archived: false,
    scene: normalizeScene(req.body.scene),
  });
  res.status(201).json(board);
}));

boardsRouter.patch("/:id", asyncRoute(async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }

  const access = getBoardAccess(board, (req as any).user);
  const updates: Record<string, unknown> = {};

  if (typeof req.body.title === "string") {
    if (!access.canManage) { res.status(403).json({ error: "Forbidden" }); return; }
    updates.title = req.body.title.trim() || "Untitled Board";
  }

  if (typeof req.body.archived === "boolean") {
    if (!access.canManage) { res.status(403).json({ error: "Forbidden" }); return; }
    updates.archived = req.body.archived;
    if (req.body.archived) {
      updates.publicAccess = "view";
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No supported updates" });
    return;
  }

  const updatedBoard = await Board.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true }
  );
  res.json(updatedBoard);
}));

boardsRouter.delete("/:id", asyncRoute(async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(board, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await Board.findByIdAndDelete(req.params.id);
  res.status(204).send();
}));

boardsRouter.patch("/:id/share", asyncRoute(async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(board, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const publicAccess = ["private", "view", "edit"].includes(req.body.publicAccess)
    ? req.body.publicAccess
    : "private";
  board.publicAccess = publicAccess;
  await board.save();
  res.json(board);
}));

boardsRouter.post("/:id/remove-active-user", asyncRoute(async (req, res) => {
  const existingBoard = await Board.findById(req.params.id);
  if (!existingBoard) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(existingBoard, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const guestId = typeof req.body.guestId === "string" ? req.body.guestId.trim() : "";
  const guestName = typeof req.body.name === "string" ? req.body.name.trim() : undefined;

  if (!email && !guestId) {
    res.status(400).json({ error: "email or guestId is required" });
    return;
  }

  const update: Record<string, unknown> = {};
  if (email) {
    update.$pull = { members: { email } };
    update.$addToSet = { blockedMembers: { email, blockedAt: new Date() } };
  } else {
    update.$addToSet = { blockedGuests: { guestId, name: guestName, blockedAt: new Date() } };
  }

  const board = await Board.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  res.json(board);
}));

boardsRouter.post("/:id/members", asyncRoute(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const { role } = req.body;
  const existingBoard = await Board.findById(req.params.id);
  if (!existingBoard) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(existingBoard, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const board = await Board.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { members: { email, role: role ?? "editor" } } },
    { new: true }
  );
  res.json(board);
}));

boardsRouter.delete("/:id/members/:email", asyncRoute(async (req, res) => {
  const existingBoard = await Board.findById(req.params.id);
  if (!existingBoard) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(existingBoard, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const board = await Board.findByIdAndUpdate(
    req.params.id,
    { $pull: { members: { email: req.params.email.toLowerCase() } } },
    { new: true }
  );
  res.json(board);
}));

function getBoardAccess(board: any, user?: any, guestId?: string | null) {
  const publicAccess = board.publicAccess ?? "private";
  const archived = Boolean(board.archived);
  const email = user?.email;
  const normalizedEmail = typeof email === "string" ? email.toLowerCase() : "";
  const member = normalizedEmail
    ? board.members.find((m: any) => m.email?.toLowerCase() === normalizedEmail)
    : null;
  const isOwner = Boolean(email && board.ownerEmail === email);
  const isBlockedMember = !isOwner && Boolean(
    normalizedEmail &&
    board.blockedMembers?.some((m: any) => m.email?.toLowerCase() === normalizedEmail)
  );
  const isBlockedGuest = Boolean(
    !email &&
    guestId &&
    board.blockedGuests?.some((g: any) => g.guestId === guestId)
  );
  const role = isOwner ? "owner" : member?.role ?? (publicAccess === "private" ? "none" : "guest");
  const blocked = isBlockedMember || isBlockedGuest;

  return {
    role,
    canView: !blocked && (isOwner || Boolean(member) || publicAccess === "view" || publicAccess === "edit"),
    canEdit: !blocked && !archived && (isOwner || member?.role === "editor" || publicAccess === "edit"),
    canManage: isOwner,
  };
}

function normalizeScene(scene: any) {
  return {
    elements: Array.isArray(scene?.elements) ? scene.elements : [],
    appState: scene?.appState && typeof scene.appState === "object" ? scene.appState : {},
    files: scene?.files && typeof scene.files === "object" ? scene.files : {},
  };
}
