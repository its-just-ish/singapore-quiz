export interface PublicQuestion {
  index: number;
  total: number;
  prompt: string;
  options: string[];
  theme: string;
  difficulty: number;
}

export interface Reveal {
  correct: boolean | null; // null when the player didn't answer
  correct_index: number;
  explanation: string;
  points: number;
  your_choice: number | null;
}

export interface LeaderboardEntry {
  player_id: string;
  nickname: string;
  total_points: number;
  correct_count: number;
}

export interface RoomEvent {
  type:
    | "snapshot"
    | "player_joined"
    | "question_start"
    | "answer_count"
    | "question_end"
    | "session_end";
  [key: string]: unknown;
}

export const THEME_META: Record<
  string,
  { label: string; emoji: string; tile: string; accent: string; blurb: string }
> = {
  makan: {
    label: "Makan",
    emoji: "🍜",
    tile: "#ffd9cf",
    accent: "#c2410c",
    blurb: "Hawker heroes & kopi culture",
  },
  mrt_buses: {
    label: "MRT & Buses",
    emoji: "🚇",
    tile: "#c9e8dc",
    accent: "#047857",
    blurb: "Lines, stations & bus lore",
  },
  singlish: {
    label: "Singlish",
    emoji: "🗣️",
    tile: "#ffe9ae",
    accent: "#a16207",
    blurb: "Can or not? Sure can lah",
  },
  heartlands: {
    label: "Heartlands",
    emoji: "🏘️",
    tile: "#c5e0f2",
    accent: "#0369a1",
    blurb: "HDB life & void deck vibes",
  },
  then_and_now: {
    label: "Then & Now",
    emoji: "🕰️",
    tile: "#e2d4ee",
    accent: "#7e22ce",
    blurb: "Old Singapore, new Singapore",
  },
  national: {
    label: "National",
    emoji: "🌙",
    tile: "#ffd2d9",
    accent: "#be123c",
    blurb: "Flag, anthem & big days",
  },
};

export const THEMES = Object.keys(THEME_META);

/** Solo "daily" theme rotates by date — the room end screen points here. */
export function dailyTheme(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return THEMES[day % THEMES.length];
}
