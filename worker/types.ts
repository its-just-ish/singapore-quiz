export interface Env {
  DB: D1Database;
  ROOM: DurableObjectNamespace;
}

export const THEMES = [
  "makan",
  "mrt_buses",
  "singlish",
  "heartlands",
  "then_and_now",
  "national",
] as const;
export type Theme = (typeof THEMES)[number];

export interface QuestionRow {
  id: number;
  theme: string;
  difficulty: number;
  prompt: string;
  options_json: string;
  answer_index: number;
  explanation: string;
}

export interface SessionRow {
  id: string;
  mode: "solo" | "room";
  theme: string;
  room_code: string | null;
  host_player_id: string | null;
  seed: number;
  question_ids_json: string;
  state: string;
  current_index: number;
  question_seconds: number | null;
  created_at: number;
  expires_at: number;
}

/** Question payload safe to send to clients: options pre-shuffled, no answer_index. */
export interface PublicQuestion {
  index: number;
  total: number;
  prompt: string;
  options: string[];
  theme: string;
  difficulty: number;
}
