// One Durable Object per live room. Owns the room's realtime state machine:
// lobby -> question -> reveal -> ... -> ended. Broadcasts events over WebSocket.
// Question data, answers and scores live in D1 (shared with solo mode);
// the DO only orchestrates timing and fan-out.
import type { Env, QuestionRow, SessionRow } from "./types";
import { displayedCorrectIndex, toPublicQuestion } from "./engine";

interface SocketInfo {
  playerId: string;
  nickname: string;
  role: "host" | "player";
}

export class RoomDO implements DurableObject {
  private sockets = new Map<WebSocket, SocketInfo>();
  private code: string | null = null;
  private questionStartedAt = 0;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.code ??= request.headers.get("x-room-code");
    if (!this.code) return new Response("Missing room code", { status: 400 });

    switch (url.pathname) {
      case "/ws":
        return this.handleWebSocket(request, url);
      case "/next":
        return this.handleNext(request);
      case "/answer-submitted":
        return this.handleAnswerSubmitted(request);
      case "/player-joined":
        await this.broadcastRoster();
        return new Response("ok");
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private async session(): Promise<SessionRow> {
    const row = await this.env.DB.prepare(
      "SELECT * FROM sessions WHERE room_code = ? ORDER BY created_at DESC LIMIT 1"
    )
      .bind(this.code)
      .first<SessionRow>();
    if (!row) throw new Error(`No session for room ${this.code}`);
    return row;
  }

  private async setSessionState(id: string, state: string, currentIndex: number) {
    await this.env.DB.prepare("UPDATE sessions SET state = ?, current_index = ? WHERE id = ?")
      .bind(state, currentIndex, id)
      .run();
  }

  // -------------------------------------------------------------------------
  // WebSocket handling
  // -------------------------------------------------------------------------

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected WebSocket", { status: 426 });

    const playerId = url.searchParams.get("player_id") ?? "";
    const token = url.searchParams.get("token") ?? "";
    const session = await this.session();

    let info: SocketInfo | null = null;
    if (playerId && playerId === session.host_player_id) {
      info = { playerId, nickname: "Host", role: "host" };
    } else if (playerId && token === playerId) {
      const player = await this.env.DB.prepare(
        "SELECT nickname FROM players WHERE session_id = ? AND id = ?"
      )
        .bind(session.id, playerId)
        .first<{ nickname: string }>();
      if (player) info = { playerId, nickname: player.nickname, role: "player" };
    }
    if (!info) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.set(server, info);
    server.addEventListener("close", () => {
      this.sockets.delete(server);
      void this.broadcastRoster();
    });
    server.addEventListener("error", () => this.sockets.delete(server));

    await this.sendSnapshot(server, session);
    await this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Bring a newly connected (or reconnected) client up to speed. */
  private async sendSnapshot(socket: WebSocket, session: SessionRow) {
    const total = (JSON.parse(session.question_ids_json) as number[]).length;
    const snapshot: Record<string, unknown> = {
      type: "snapshot",
      state: session.state,
      current_index: session.current_index,
      total,
      theme: session.theme,
      question_seconds: session.question_seconds,
      players: await this.roster(session.id),
    };
    if (session.state === "question") {
      const row = await this.questionRow(session, session.current_index);
      if (row) {
        snapshot.question = toPublicQuestion(row, session.seed, session.current_index, total);
        snapshot.ends_at = this.questionStartedAt + (session.question_seconds ?? 20) * 1000;
      }
    }
    if (session.state === "reveal" || session.state === "ended") {
      snapshot.leaderboard = await this.leaderboard(session.id);
    }
    socket.send(JSON.stringify(snapshot));
  }

  private broadcast(event: Record<string, unknown>) {
    const message = JSON.stringify(event);
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private async roster(sessionId: string) {
    const rows = (
      await this.env.DB.prepare(
        "SELECT id, nickname FROM players WHERE session_id = ? ORDER BY joined_at"
      )
        .bind(sessionId)
        .all<{ id: string; nickname: string }>()
    ).results;
    return rows.map((r) => ({ id: r.id, nickname: r.nickname }));
  }

  private async broadcastRoster() {
    if (!this.code) return;
    const session = await this.session().catch(() => null);
    if (!session) return;
    this.broadcast({ type: "player_joined", players: await this.roster(session.id) });
  }

  // -------------------------------------------------------------------------
  // Game state machine (host-driven, with a timer alarm per question)
  // -------------------------------------------------------------------------

  private async handleNext(request: Request): Promise<Response> {
    const body = await request.json<any>().catch(() => ({}));
    const session = await this.session();
    if (String(body.host_player_id ?? "") !== session.host_player_id)
      return new Response(JSON.stringify({ error: "Host only" }), { status: 403 });

    const total = (JSON.parse(session.question_ids_json) as number[]).length;
    if (session.state === "lobby") {
      await this.startQuestion(session, 0);
    } else if (session.state === "question") {
      await this.endQuestion(session); // host can cut a question short
    } else if (session.state === "reveal") {
      const next = session.current_index + 1;
      if (next < total) await this.startQuestion(session, next);
      else await this.endSession(session);
    } else {
      return new Response(JSON.stringify({ error: `Nothing to advance (state: ${session.state})` }), {
        status: 409,
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  private async questionRow(session: SessionRow, index: number): Promise<QuestionRow | null> {
    const ids: number[] = JSON.parse(session.question_ids_json);
    if (index < 0 || index >= ids.length) return null;
    return this.env.DB.prepare("SELECT * FROM questions WHERE id = ?")
      .bind(ids[index])
      .first<QuestionRow>();
  }

  private async startQuestion(session: SessionRow, index: number) {
    const row = await this.questionRow(session, index);
    if (!row) return this.endSession(session);
    const total = (JSON.parse(session.question_ids_json) as number[]).length;
    const seconds = session.question_seconds ?? 20;

    await this.setSessionState(session.id, "question", index);
    this.questionStartedAt = Date.now();
    await this.state.storage.put("questionStartedAt", this.questionStartedAt);
    // Grace of 1s over the nominal limit before the server force-reveals.
    await this.state.storage.setAlarm(Date.now() + seconds * 1000 + 1000);

    this.broadcast({
      type: "question_start",
      question: toPublicQuestion(row, session.seed, index, total),
      seconds,
      ends_at: this.questionStartedAt + seconds * 1000,
    });
  }

  async alarm() {
    const session = await this.session().catch(() => null);
    if (session && session.state === "question") await this.endQuestion(session);
  }

  private async handleAnswerSubmitted(request: Request): Promise<Response> {
    const body = await request.json<any>().catch(() => ({}));
    const session = await this.session();
    if (session.state !== "question" || body.q_index !== session.current_index)
      return new Response("stale", { status: 200 });

    const counts = await this.answerCount(session.id, session.current_index);
    this.broadcast({ type: "answer_count", index: session.current_index, ...counts });
    if (counts.answered >= counts.players && counts.players > 0) {
      await this.endQuestion(session); // everyone in — reveal early
    }
    return new Response("ok");
  }

  private async answerCount(sessionId: string, index: number) {
    const row = await this.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM answers WHERE session_id = ?1 AND question_index = ?2) AS answered,
         (SELECT COUNT(*) FROM players WHERE session_id = ?1) AS players`
    )
      .bind(sessionId, index)
      .first<{ answered: number; players: number }>();
    return row ?? { answered: 0, players: 0 };
  }

  private async leaderboard(sessionId: string) {
    return (
      await this.env.DB.prepare(
        `SELECT p.id AS player_id, p.nickname,
                COALESCE(SUM(a.points), 0) AS total_points,
                COALESCE(SUM(a.is_correct), 0) AS correct_count
         FROM players p
         LEFT JOIN answers a ON a.session_id = p.session_id AND a.player_id = p.id
         WHERE p.session_id = ?
         GROUP BY p.id, p.nickname
         ORDER BY total_points DESC, correct_count DESC, p.joined_at ASC`
      )
        .bind(sessionId)
        .all()
    ).results;
  }

  private async endQuestion(session: SessionRow) {
    await this.state.storage.deleteAlarm();
    const index = session.current_index;
    const row = await this.questionRow(session, index);
    if (!row) return;
    const options: string[] = JSON.parse(row.options_json);

    await this.setSessionState(session.id, "reveal", index);
    const perPlayer = (
      await this.env.DB.prepare(
        "SELECT player_id, points, is_correct FROM answers WHERE session_id = ? AND question_index = ?"
      )
        .bind(session.id, index)
        .all<{ player_id: string; points: number; is_correct: number }>()
    ).results;
    this.broadcast({
      type: "question_end",
      index,
      correct_index: displayedCorrectIndex(session.seed, index, row.answer_index, options.length),
      explanation: row.explanation,
      points_by_player: Object.fromEntries(perPlayer.map((a) => [a.player_id, a.points])),
      leaderboard: await this.leaderboard(session.id),
    });
  }

  private async endSession(session: SessionRow) {
    await this.state.storage.deleteAlarm();
    await this.setSessionState(session.id, "ended", session.current_index);
    const leaderboard = await this.leaderboard(session.id);
    this.broadcast({
      type: "session_end",
      leaderboard,
      podium: leaderboard.slice(0, 3),
    });
  }
}
