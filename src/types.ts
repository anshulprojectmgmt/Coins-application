export interface User {
  _id: string;
  username: string;
  total_coins: number;
  min_per_coin_ratio: number;
  custom_earn_activities?: string[];
  custom_play_activities?: string[];
  surprises?: Record<string, string>;
  surprise_goal_points?: number;
  surprise_reward_name?: string;
  surprise_cycle_start_points?: number;
  surprise_cycle_points?: number;
  parent_setup?: boolean;
  photo_consent?: boolean;
  ai_consent?: boolean;
  timezone?: string;
}

export interface Activity {
  _id: string;
  userId: string;
  type: 'earn' | 'spend';
  activityName: string;
  durationMinutes: number;
  pointsImpact: number;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Submission {
  _id: string;
  missionId: string;
  title: string;
  points: number;
  day: string;
  status: 'checking' | 'pending' | 'approved' | 'retry' | 'rejected';
  message: string;
  attempts: number;
  evidenceCount: number;
  evidenceExpiresAt: string;
  createdAt: string;
  updatedAt: string;
  instructions?: string;
  proof?: string;
}

export interface Mission {
  _id: string;
  title: string;
  instructions: string;
  points: number;
  proof: 'photo' | 'before_after';
  verification: 'parent' | 'ai';
  active: boolean;
  submission?: Submission;
}
