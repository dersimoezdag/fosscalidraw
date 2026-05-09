import { Router } from "express";
import { Board } from "./boards.model.js";
import { optionalAuth, requireAuth } from "../middleware/authGuard.js";

export const boardsRouter = Router();

boardsRouter.get("/:id", optionalAuth, async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }

  const access = getBoardAccess(board, (req as any).user);
  if (!access.canView) { res.status(401).json({ error: "Unauthorized" }); return; }

  res.json({
    ...board.toObject(),
    access: {
      role: access.role,
      canEdit: access.canEdit,
      canManage: access.canManage,
    },
  });
});

boardsRouter.patch("/:id/scene", optionalAuth, async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }

  const access = getBoardAccess(board, (req as any).user);
  if (!access.canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  board.scene = normalizeScene(req.body.scene);
  await board.save();
  res.json({ ok: true, updatedAt: board.updatedAt });
});

boardsRouter.use(requireAuth);

boardsRouter.get("/", async (req, res) => {
  const user = (req as any).user;
  const boards = await Board.find({
    $or: [{ ownerEmail: user.email }, { "members.email": user.email }],
  }).select("-scene").sort({ updatedAt: -1 });
  res.json(boards);
});

boardsRouter.post("/", async (req, res) => {
  const user = (req as any).user;
  const board = await Board.create({
    title: req.body.title ?? "Untitled Board",
    ownerId: user.id,
    ownerEmail: user.email,
    members: [],
    publicAccess: "private",
    scene: { elements: [], appState: {}, files: {} },
  });
  res.status(201).json(board);
});

boardsRouter.patch("/:id", async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }

  const access = getBoardAccess(board, (req as any).user);
  if (!access.canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  const updatedBoard = await Board.findByIdAndUpdate(
    req.params.id,
    { title: req.body.title },
    { new: true }
  );
  res.json(updatedBoard);
});

boardsRouter.delete("/:id", async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(board, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await Board.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

boardsRouter.patch("/:id/share", async (req, res) => {
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
});

boardsRouter.post("/:id/members", async (req, res) => {
  const { email, role } = req.body;
  const existingBoard = await Board.findById(req.params.id);
  if (!existingBoard) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(existingBoard, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const board = await Board.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { members: { email, role: role ?? "editor" } } },
    { new: true }
  );
  res.json(board);
});

boardsRouter.delete("/:id/members/:email", async (req, res) => {
  const existingBoard = await Board.findById(req.params.id);
  if (!existingBoard) { res.status(404).json({ error: "Not found" }); return; }
  if (!getBoardAccess(existingBoard, (req as any).user).canManage) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const board = await Board.findByIdAndUpdate(
    req.params.id,
    { $pull: { members: { email: req.params.email } } },
    { new: true }
  );
  res.json(board);
});

function getBoardAccess(board: any, user?: any) {
  const publicAccess = board.publicAccess ?? "private";
  const email = user?.email;
  const member = email ? board.members.find((m: any) => m.email === email) : null;
  const isOwner = Boolean(email && board.ownerEmail === email);
  const role = isOwner ? "owner" : member?.role ?? (publicAccess === "private" ? "none" : "guest");

  return {
    role,
    canView: isOwner || Boolean(member) || publicAccess === "view" || publicAccess === "edit",
    canEdit: isOwner || member?.role === "editor" || publicAccess === "edit",
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
