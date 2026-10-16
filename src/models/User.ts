import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  parent_password: { type: String, select: false },
  photo_consent: { type: Boolean, default: false },
  ai_consent: { type: Boolean, default: false },
  timezone: { type: String, default: "UTC" },
  evidence_revision: { type: Number, default: 0 },
  total_coins: { type: Number, default: 0 },
  min_per_coin_ratio: { type: Number, default: 1 },
  custom_earn_activities: { type: [String], default: [] },
  custom_play_activities: { type: [String], default: [] },
  surprises: { type: Map, of: String, default: {} },
  surprise_goal_points: { type: Number, default: 500 },
  surprise_reward_name: { type: String, default: "Mystery Surprise" },
  surprise_cycle_start_points: { type: Number, default: 0 },
  surprise_cycle_points: { type: Number, default: 0 },
});

export const User: mongoose.Model<mongoose.InferSchemaType<typeof userSchema>> =
  (mongoose.models.User as
    | mongoose.Model<mongoose.InferSchemaType<typeof userSchema>>
    | undefined) || mongoose.model("User", userSchema);
