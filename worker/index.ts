// Kaki Quiz API — Cloudflare Worker with D1 + one Durable Object per live room.
import type { Env, QuestionRow, SessionRow } from "./types";
import { THEMES } from "./types";
import {
  displayedCorrectIndex,
  newId,
  randomRoomCode,
  scorePoints,
  selectQuestionIds,
  seededShuffle,
  mulberry32,
  toCanonicalChoice,
  toPublicQuestion,
} from "./engine";

export { RoomDO } from "./room";

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const badRequest = (message: string, status = 400) => json({ error: message }, status);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const method = request.method;

    try {
      let m: RegExpMatchArray | null;

      if (path === "/api/sessions" && method === "POST") return createSoloSession(request, env);
      if ((m = path.match(/^\/api\/sessions\/([^/]+)\/questions\/(\d+)$/)) && method === "GET")
        return getQuestion(env, m[1], Number(m[2]));
      if ((m = path.match(/^\/api\/sessions\/([^/]+)\/answer$/)) && method === "POST")
        return submitAnswer(request, env, m[1]);
      if ((m = path.match(/^\/api\/sessions\/([^/]+)\/results$/)) && method === "GET")
        return getResults(env, m[1]);

      if (path === "/api/rooms" && method === "POST") return createRoom(request, env);
      if ((m = path.match(/^\/api\/rooms\/([^/]+)\/join$/)) && method === "POST")
        return joinRoom(request, env, m[1].toUpperCase());
      if ((m = path.match(/^\/api\/rooms\/([^/]+)$/)) && method === "GET")
        return getRoomInfo(env, m[1].toUpperCase());
      if ((m = path.match(/^\/api\/rooms\/([^/]+)\/(ws|next)$/)))
        return forwardToRoom(request, env, m[1].toUpperCase(), m[2]);

      return badRequest("Not found", 404);
    } catch (err) {
      console.error(err);
      return badRequest("Internal error", 500);
    }
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Session creation (shared by solo + room)
// ---------------------------------------------------------------------------

async function buildSession(
  env: Env,
  opts: {
    mode: "solo" | "room";
    theme: string;
    count: number;
    playerId: string | null; // whose history to use for the "not seen recently" rule
    roomCode?: string;
    hostPlayerId?: string;
    questionSeconds?: number | null;
    state: string;
  }
): Promise<SessionRow> {
  const pool = (
    await env.DB.prepare("SELECT id, difficulty FROM questions WHERE theme = ?")
      .bind(opts.theme)
      .all<{ id: number; difficulty: number }>()
  ).results;
  if (pool.length === 0) throw new Error(`No questions for theme ${opts.theme}`);

  // Questions this player saw in their last 3 sessions.
  const recentlySeen = new Set<number>();
  if (opts.playerId) {
    const recent = (
      await env.DB.prepare(
        `SELECT s.question_ids_json FROM sessions s
         JOIN players p ON p.session_id = s.id
         WHERE p.id = ? ORDER BY s.created_at DESC LIMIT 3`
      )
        .bind(opts.playerId)
        .all<{ question_ids_json: string }>()
    ).results;
    for (const row of recent) for (const id of JSON.parse(row.question_ids_json)) recentlySeen.add(id);
  }

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const questionIds = selectQuestionIds(pool, opts.count, seed, recentlySeen);
  if (questionIds.length < opts.count)
    throw new Error(`Only ${questionIds.length} questions available for ${opts.theme}`);

  const now = Date.now();
  const session: SessionRow = {
    id: newId("sess"),
    mode: opts.mode,
    theme: opts.theme,
    room_code: opts.roomCode ?? null,
    host_player_id: opts.hostPlayerId ?? null,
    seed,
    question_ids_json: JSON.stringify(questionIds),
    state: opts.state,
    current_index: 0,
    question_seconds: opts.questionSeconds ?? null,
    created_at: now,
    expires_at: now + SESSION_TTL_MS,
  };

  await env.DB.prepare(
    `INSERT INTO sessions (id, mode, theme, room_code, host_player_id, seed, question_ids_json,
       state, current_index, question_seconds, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      session.id, session.mode, session.theme, session.room_code, session.host_player_id,
      session.seed, session.question_ids_json, session.state, session.current_index,
      session.question_seconds, session.created_at, session.expires_at
    )
    .run();

  await env.DB.prepare(
    `UPDATE questions SET times_served = times_served + 1
     WHERE id IN (${questionIds.map(() => "?").join(",")})`
  )
    .bind(...questionIds)
    .run();

  return session;
}

async function getSession(env: Env, id: string): Promise<SessionRow | null> {
  return env.DB.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<SessionRow>();
}

async function getQuestionRow(env: Env, session: SessionRow, index: number): Promise<QuestionRow | null> {
  const ids: number[] = JSON.parse(session.question_ids_json);
  if (index < 0 || index >= ids.length) return null;
  return env.DB.prepare("SELECT * FROM questions WHERE id = ?").bind(ids[index]).first<QuestionRow>();
}

async function createSoloSession(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => ({}));
  const theme = String(body.theme ?? "");
  const count = Math.min(Math.max(Number(body.count) || 10, 3), 15);
  const playerId = body.player_id ? String(body.player_id) : newId("plyr");
  if (!THEMES.includes(theme as any)) return badRequest("Unknown theme");
  if ((body.mode ?? "solo") !== "solo") return badRequest("Use POST /api/rooms for room mode");

  const session = await buildSession(env, {
    mode: "solo",
    theme,
    count,
    playerId,
    questionSeconds: null,
    state: "active",
  });

  await env.DB.prepare(
    "INSERT INTO players (id, session_id, nickname, joined_at) VALUES (?, ?, ?, ?)"
  )
    .bind(playerId, session.id, String(body.nickname ?? "You").slice(0, 20), Date.now())
    .run();

  const row = await getQuestionRow(env, session, 0);
  const total = JSON.parse(session.question_ids_json).length;
  return json({
    session_id: session.id,
    player_id: playerId,
    theme,
    total,
    state: session.state,
    question: row ? toPublicQuestion(row, session.seed, 0, total) : null,
  });
}

async function getQuestion(env: Env, sessionId: string, index: number): Promise<Response> {
  const session = await getSession(env, sessionId);
  if (!session) return badRequest("Session not found", 404);
  const row = await getQuestionRow(env, session, index);
  if (!row) return badRequest("No such question", 404);
  // Never serve ahead of the session's progress — answer_index stays server-side
  // and clients can't peek at future questions either.
  if (index > session.current_index) return badRequest("Question not yet available", 403);
  const total = JSON.parse(session.question_ids_json).length;
  return json({ question: toPublicQuestion(row, session.seed, index, total), state: session.state });
}

// ---------------------------------------------------------------------------
// Answer submission — the single engine for both solo and room games
// ---------------------------------------------------------------------------

async function submitAnswer(request: Request, env: Env, sessionId: string): Promise<Response> {
  const body = await request.json<any>().catch(() => ({}));
  const playerId = String(body.player_id ?? "");
  const qIndex = Number(body.q_index);
  const choiceIndex = Number(body.choice_index);
  const msTaken = Math.max(0, Number(body.ms_taken) || 0);

  const session = await getSession(env, sessionId);
  if (!session) return badRequest("Session not found", 404);

  const player = await env.DB.prepare("SELECT * FROM players WHERE session_id = ? AND id = ?")
    .bind(sessionId, playerId)
    .first();
  if (!player) return badRequest("Not a player in this session", 403);

  const expectedState = session.mode === "solo" ? "active" : "question";
  if (session.state !== expectedState) return badRequest(`Answers closed (state: ${session.state})`, 409);
  if (qIndex !== session.current_index) return badRequest("Not the current question", 409);

  const row = await getQuestionRow(env, session, qIndex);
  if (!row) return badRequest("No such question", 404);
  const options: string[] = JSON.parse(row.options_json);
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= options.length)
    return badRequest("Invalid choice");

  const canonicalChoice = toCanonicalChoice(session.seed, qIndex, choiceIndex, options.length);
  const correct = canonicalChoice === row.answer_index;
  const points = scorePoints(correct, msTaken, session.question_seconds);

  const insert = await env.DB.prepare(
    `INSERT OR IGNORE INTO answers (session_id, player_id, question_index, choice_index, is_correct, ms_taken, points)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(sessionId, playerId, qIndex, choiceIndex, correct ? 1 : 0, Math.round(msTaken), points)
    .run();
  if (!insert.meta.changes) return badRequest("Already answered", 409);

  if (correct)
    await env.DB.prepare("UPDATE questions SET times_correct = times_correct + 1 WHERE id = ?")
      .bind(row.id)
      .run();

  const total = JSON.parse(session.question_ids_json).length;

  if (session.mode === "solo") {
    // Self-paced: advance immediately and return the reveal + next question.
    const nextIndex = qIndex + 1;
    const finished = nextIndex >= total;
    await env.DB.prepare("UPDATE sessions SET current_index = ?, state = ? WHERE id = ?")
      .bind(finished ? qIndex : nextIndex, finished ? "ended" : "active", sessionId)
      .run();
    const nextRow = finished ? null : await getQuestionRow(env, session, nextIndex);
    return json({
      correct,
      points,
      correct_index: displayedCorrectIndex(session.seed, qIndex, row.answer_index, options.length),
      explanation: row.explanation,
      finished,
      next_question: nextRow ? toPublicQuestion(nextRow, session.seed, nextIndex, total) : null,
    });
  }

  // Room mode: no reveal here — that arrives for everyone at once via the
  // Durable Object's question_end broadcast. Just confirm receipt and let the
  // room know the answer count changed.
  const stub = env.ROOM.get(env.ROOM.idFromName(session.room_code!));
  await stub.fetch("https://room/answer-submitted", {
    method: "POST",
    body: JSON.stringify({ q_index: qIndex }),
    headers: { "content-type": "application/json", "x-room-code": session.room_code! },
  });
  return json({ accepted: true });
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

async function getResults(env: Env, sessionId: string): Promise<Response> {
  const session = await getSession(env, sessionId);
  if (!session) return badRequest("Session not found", 404);

  const leaderboard = (
    await env.DB.prepare(
      `SELECT p.id AS player_id, p.nickname,
              COALESCE(SUM(a.points), 0) AS total_points,
              COALESCE(SUM(a.is_correct), 0) AS correct_count,
              COUNT(a.question_index) AS answered
       FROM players p
       LEFT JOIN answers a ON a.session_id = p.session_id AND a.player_id = p.id
       WHERE p.session_id = ?
       GROUP BY p.id, p.nickname
       ORDER BY total_points DESC, correct_count DESC, p.joined_at ASC`
    )
      .bind(sessionId)
      .all()
  ).results;

  const total = JSON.parse(session.question_ids_json).length;
  let questions: unknown[] = [];
  if (session.state === "ended") {
    const ids: number[] = JSON.parse(session.question_ids_json);
    const rows = (
      await env.DB.prepare(
        `SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(",")})`
      )
        .bind(...ids)
        .all<QuestionRow>()
    ).results;
    const byId = new Map(rows.map((r) => [r.id, r]));
    questions = ids.map((id, index) => {
      const row = byId.get(id)!;
      const opts: string[] = JSON.parse(row.options_json);
      const pub = toPublicQuestion(row, session.seed, index, total);
      return {
        ...pub,
        correct_index: displayedCorrectIndex(session.seed, index, row.answer_index, opts.length),
        explanation: row.explanation,
      };
    });
  }

  return json({
    session_id: sessionId,
    mode: session.mode,
    theme: session.theme,
    state: session.state,
    total,
    leaderboard,
    questions,
  });
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => ({}));
  const theme = String(body.theme ?? "");
  const count = Math.min(Math.max(Number(body.count) || 10, 3), 15);
  const questionSeconds = Math.min(Math.max(Number(body.question_seconds) || 20, 5), 60);
  if (!THEMES.includes(theme as any)) return badRequest("Unknown theme");

  const hostPlayerId = body.host_player_id ? String(body.host_player_id) : newId("host");

  let roomCode = randomRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await env.DB.prepare(
      "SELECT id FROM sessions WHERE room_code = ? AND state != 'ended'"
    )
      .bind(roomCode)
      .first();
    if (!clash) break;
    roomCode = randomRoomCode();
  }

  const session = await buildSession(env, {
    mode: "room",
    theme,
    count,
    playerId: null,
    roomCode,
    hostPlayerId,
    questionSeconds,
    state: "lobby",
  });

  return json({
    room_code: roomCode,
    session_id: session.id,
    host_player_id: hostPlayerId,
    theme,
    count,
    question_seconds: questionSeconds,
  });
}

async function getRoomSession(env: Env, code: string): Promise<SessionRow | null> {
  return env.DB.prepare(
    "SELECT * FROM sessions WHERE room_code = ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(code)
    .first<SessionRow>();
}

async function getRoomInfo(env: Env, code: string): Promise<Response> {
  const session = await getRoomSession(env, code);
  if (!session) return badRequest("Room not found", 404);
  const players = (
    await env.DB.prepare(
      "SELECT id, nickname FROM players WHERE session_id = ? ORDER BY joined_at"
    )
      .bind(session.id)
      .all()
  ).results;
  return json({
    room_code: code,
    session_id: session.id,
    theme: session.theme,
    state: session.state,
    current_index: session.current_index,
    total: JSON.parse(session.question_ids_json).length,
    question_seconds: session.question_seconds,
    players,
  });
}

async function joinRoom(request: Request, env: Env, code: string): Promise<Response> {
  const body = await request.json<any>().catch(() => ({}));
  const nickname = String(body.nickname ?? "").trim().slice(0, 20);
  if (!nickname) return badRequest("Nickname required");

  const session = await getRoomSession(env, code);
  if (!session) return badRequest("Room not found", 404);
  if (session.state === "ended") return badRequest("This room has ended", 410);

  const playerId = body.player_id ? String(body.player_id) : newId("plyr");
  await env.DB.prepare(
    `INSERT INTO players (id, session_id, nickname, joined_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (session_id, id) DO UPDATE SET nickname = excluded.nickname`
  )
    .bind(playerId, session.id, nickname, Date.now())
    .run();

  // Tell the room DO so connected clients see the roster update immediately.
  const stub = env.ROOM.get(env.ROOM.idFromName(code));
  await stub.fetch("https://room/player-joined", {
    method: "POST",
    headers: { "x-room-code": code },
  });

  return json({
    player_id: playerId,
    ws_token: playerId, // v1: guest token == player id
    session_id: session.id,
    theme: session.theme,
    total: JSON.parse(session.question_ids_json).length,
    state: session.state,
    question_seconds: session.question_seconds,
  });
}

async function forwardToRoom(request: Request, env: Env, code: string, action: string): Promise<Response> {
  const session = await getRoomSession(env, code);
  if (!session) return badRequest("Room not found", 404);
  const stub = env.ROOM.get(env.ROOM.idFromName(code));
  const url = new URL(request.url);
  url.pathname = `/${action}`;
  const forwarded = new Request(url.toString(), request);
  forwarded.headers.set("x-room-code", code);
  return stub.fetch(forwarded);
}
