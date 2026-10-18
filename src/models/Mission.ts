import mongoose from "mongoose";

const missionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 80 },
    instructions: { type: String, required: true, maxlength: 600 },
    points: { type: Number, required: true, min: 1, max: 100 },
    proof: { type: String, enum: ["photo", "before_after"], default: "photo" },
    verification: { type: String, enum: ["parent", "ai"], default: "parent" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Mission: mongoose.Model<
  mongoose.InferSchemaType<typeof missionSchema>
> =
  (mongoose.models.Mission as
    | mongoose.Model<mongoose.InferSchemaType<typeof missionSchema>>
    | undefined) || mongoose.model("Mission", missionSchema);

export const starterMissions: { title: string; instructions: string; points: number; proof: 'photo' | 'before_after' }[] = [
  {
    title: "Put away my toys",
    instructions:
      "Take a photo before you start and another after. Show the same play area, with the toys put into their storage bins.",
    points: 10,
    proof: "before_after",
  },
  {
    title: "Complete my worksheet",
    instructions:
      "Show today’s assigned worksheet with the exercises completed. Keep names and school details out of the photo.",
    points: 15,
    proof: "photo",
  },
  {
    title: "Tidy my desk",
    instructions:
      "Take a before and after photo of the same desk. Put loose items away and leave the work surface clear.",
    points: 10,
    proof: "before_after",
  },
];
