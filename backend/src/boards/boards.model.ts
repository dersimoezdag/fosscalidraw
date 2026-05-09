import mongoose, { Schema, Document } from "mongoose";

export interface IBoard extends Document {
  title: string;
  ownerId: string;
  ownerEmail: string;
  members: { email: string; role: "editor" | "viewer" }[];
  blockedMembers: { email: string; blockedAt: Date }[];
  blockedGuests: { guestId: string; name?: string; blockedAt: Date }[];
  publicAccess: "private" | "view" | "edit";
  archived: boolean;
  scene?: {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  };
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
    blockedMembers: [
      {
        email: String,
        blockedAt: { type: Date, default: Date.now },
      },
    ],
    blockedGuests: [
      {
        guestId: String,
        name: String,
        blockedAt: { type: Date, default: Date.now },
      },
    ],
    publicAccess: {
      type: String,
      enum: ["private", "view", "edit"],
      default: "private",
    },
    archived: { type: Boolean, default: false },
    scene: {
      type: Schema.Types.Mixed,
      default: { elements: [], appState: {}, files: {} },
    },
  },
  { timestamps: true }
);

export const Board = mongoose.model<IBoard>("Board", BoardSchema);
