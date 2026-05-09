import mongoose, { Schema, Document } from "mongoose";

export interface IBoard extends Document {
  title: string;
  ownerId: string;
  ownerEmail: string;
  members: { email: string; role: "editor" | "viewer" }[];
  publicAccess: "private" | "view" | "edit";
  createdAt: Date;
  updatedAt: Date;
}

const BoardSchema = new Schema<IBoard>(
  {
    title: { type: String, required: true, default: "Untitled Board" },
    ownerId: { type: String, required: true },
    ownerEmail: { type: String, required: true },
    members: [
      {
        email: String,
        role: { type: String, enum: ["editor", "viewer"], default: "editor" },
      },
    ],
    publicAccess: {
      type: String,
      enum: ["private", "view", "edit"],
      default: "private",
    },
  },
  { timestamps: true }
);

export const Board = mongoose.model<IBoard>("Board", BoardSchema);
