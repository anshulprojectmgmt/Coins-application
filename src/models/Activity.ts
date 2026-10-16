import mongoose from "mongoose";

const activitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["earn", "spend"], required: true },
  activityName: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  pointsImpact: { type: Number, required: true },
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Submission" },
  requestId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

activitySchema.index(
  { submissionId: 1 },
  {
    unique: true,
    partialFilterExpression: { submissionId: { $type: "objectId" } },
  },
);
activitySchema.index(
  { userId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "string" } } },
);

export const Activity: mongoose.Model<
  mongoose.InferSchemaType<typeof activitySchema>
> =
  (mongoose.models.Activity as
    | mongoose.Model<mongoose.InferSchemaType<typeof activitySchema>>
    | undefined) || mongoose.model("Activity", activitySchema);
