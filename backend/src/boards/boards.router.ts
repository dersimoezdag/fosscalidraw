import { Router } from "express";
import { Board } from "./boards.model.js";
import { requireAuth } from "../middleware/authGuard.js";

export const boardsRouter = Router();
boardsRouter.use(requireAuth);

boardsRouter.get("/", async (req, res) => {
  const user = (req as any).user;
  const boards = await Board.find({
    $or: [{ ownerEmail: user.email }, { "members.email": user.email }],
  }).sort({ updatedAt: -1 });
  res.json(boards);
});

boardsRouter.post("/", async (req, res) => {
  const user = (req as any).user;
  const board = await Board.create({
    title: req.body.title ?? "Untitled Board",
    ownerId: user.id,
    ownerEmail: user.email,
    members: [],
  });
  res.status(201).json(board);
});

boardsRouter.get("/:id", async (req, res) => {
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ error: "Not found" }); return; }
  res.json(board);
});

boardsRouter.patch("/:id", async (req, res) => {
  const board = await Board.findByIdAndUpdate(
    req.params.id,
    { title: req.body.title },
    { new: true }
  );
  res.json(board);
});

boardsRouter.delete("/:id", async (req, res) => {
  await Board.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

boardsRouter.post("/:id/members", async (req, res) => {
  const { email, role } = req.body;
  const board = await Board.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { members: { email, role: role ?? "editor" } } },
    { new: true }
  );
  res.json(board);
});

boardsRouter.delete("/:id/members/:email", async (req, res) => {
  const board = await Board.findByIdAndUpdate(
    req.params.id,
    { $pull: { members: { email: req.params.email } } },
    { new: true }
  );
  res.json(board);
});
