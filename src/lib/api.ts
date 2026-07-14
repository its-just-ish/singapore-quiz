import type { PublicQuestion, LeaderboardEntry } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface CreateSoloResponse {
  session_id: string;
  player_id: string;
  theme: string;
  total: number;
  question: PublicQuestion;
}

export function createSoloSession(theme: string, playerId: string, count = 10) {
  return request<CreateSoloResponse>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ mode: "solo", theme, count, player_id: playerId }),
  });
}

export interface AnswerResponse {
  correct?: boolean;
  points?: number;
  correct_index?: number;
  explanation?: string;
  finished?: boolean;
  next_question?: PublicQuestion | null;
  accepted?: boolean;
}

export function submitAnswer(
  sessionId: string,
  playerId: string,
  qIndex: number,
  choiceIndex: number,
  msTaken: number
) {
  return request<AnswerResponse>(`/api/sessions/${sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
      q_index: qIndex,
      choice_index: choiceIndex,
      ms_taken: Math.round(msTaken),
    }),
  });
}

export interface ResultsResponse {
  session_id: string;
  mode: string;
  theme: string;
  state: string;
  total: number;
  leaderboard: (LeaderboardEntry & { answered: number })[];
  questions: (PublicQuestion & { correct_index: number; explanation: string })[];
}

export function getResults(sessionId: string) {
  return request<ResultsResponse>(`/api/sessions/${sessionId}/results`);
}

export interface CreateRoomResponse {
  room_code: string;
  session_id: string;
  host_player_id: string;
  theme: string;
  count: number;
  question_seconds: number;
}

export function createRoom(theme: string, count: number, questionSeconds: number) {
  return request<CreateRoomResponse>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ theme, count, question_seconds: questionSeconds }),
  });
}

export interface JoinRoomResponse {
  player_id: string;
  ws_token: string;
  session_id: string;
  theme: string;
  total: number;
  state: string;
  question_seconds: number;
}

export function joinRoom(code: string, nickname: string, playerId: string) {
  return request<JoinRoomResponse>(`/api/rooms/${code}/join`, {
    method: "POST",
    body: JSON.stringify({ nickname, player_id: playerId }),
  });
}

export interface RoomInfoResponse {
  room_code: string;
  session_id: string;
  theme: string;
  state: string;
  current_index: number;
  total: number;
  question_seconds: number;
  players: { id: string; nickname: string }[];
}

export function getRoomInfo(code: string) {
  return request<RoomInfoResponse>(`/api/rooms/${code}`);
}

export function advanceRoom(code: string, hostPlayerId: string) {
  return request<{ ok: boolean }>(`/api/rooms/${code}/next`, {
    method: "POST",
    body: JSON.stringify({ host_player_id: hostPlayerId }),
  });
}

export function roomSocketUrl(code: string, playerId: string, token: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/rooms/${code}/ws?player_id=${encodeURIComponent(
    playerId
  )}&token=${encodeURIComponent(token)}`;
}
