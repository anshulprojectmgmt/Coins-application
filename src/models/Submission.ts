import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    missionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mission",
      required: true,
    },
    day: { type: String, required: true },
    // Freeze the parent's rules so later edits cannot change an existing claim.
    title: { type: String, required: true },
    instructions: { type: String, required: true },
    points: { type: Number, required: true },
    proof: { type: String, required: true },
    status: {
      type: String,
      enum: ["checking", "pending", "approved", "retry", "rejected"],
      default: "checking",
    },
    attempts: { type: Number, default: 1 },
    message: { type: String, default: "Checking your photo…" },
    evidence: { type: [String], default: [] },
    evidenceExpiresAt: { type: Date, required: true },
    reviewedBy: { type: String, enum: ["ai", "parent"] },
    reviewedAt: Date,
  },
  { timestamps: true },
);
submissionSchema.index({ userId: 1, missionId: 1, day: 1 }, { unique: true });
export const Submission: mongoose.Model<
  mongoose.InferSchemaType<typeof submissionSchema>
> =
  (mongoose.models.Submission as
    | mongoose.Model<mongoose.InferSchemaType<typeof submissionSchema>>
    | undefined) || mongoose.model("Submission", submissionSchema);

const evidenceHashSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  hash: { type: String, required: true },
});
evidenceHashSchema.index({ userId: 1, hash: 1 }, { unique: true });
export const EvidenceHash: mongoose.Model<
  mongoose.InferSchemaType<typeof evidenceHashSchema>
> =
  (mongoose.models.EvidenceHash as
    | mongoose.Model<mongoose.InferSchemaType<typeof evidenceHashSchema>>
    | undefined) || mongoose.model("EvidenceHash", evidenceHashSchema);
