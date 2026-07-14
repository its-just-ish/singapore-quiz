# Kaki Quiz 🇸🇬

A Singapore-themed community quiz web app. Play solo at your own pace, or host
a live room where your kakis join with a 5-character code (or QR), answer on
their phones, and battle for the podium.

**Stack:** React + Vite + TypeScript + Tailwind on the front, a Cloudflare
Worker API with D1 (SQLite) storage and one Durable Object per live room on
the back. Mobile-first, no auth for v1 (a guest `player_id` lives in
`localStorage`).

## Setup

Prereqs: Node 20+.

```bash
npm install
npm run db:migrate   # create local D1 schema (.wrangler/state)
npm run db:seed      # load the 60-question bank
npm run dev          # wrangler dev (:8787) + vite (:5173) together
```

Open http://localhost:5173. Vite proxies `/api` (including WebSockets) to the
Worker on :8787.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev:api` / `dev:web` | run just the Worker or just Vite |
| `npm run db:reset` | wipe local D1, re-migrate, re-seed |
| `npm run typecheck` | typecheck the app and the Worker |
| `npm run build` | production build of the frontend |

To try a live room on one machine, open the host page in one window and join
from a private/incognito window (players are keyed by a per-browser guest id).

## The two modes, one engine

- **Solo** — pick a theme, play 10 questions self-paced, get a score + share
  card. A solo game is just a session with one player and no host.
- **Room** — host creates a room (theme + question count + seconds per
  question) and gets a code + QR. Players join with a nickname only. The host
  advances questions; everyone answers on their phone; a live leaderboard
  shows between questions and a podium at the end (which nudges players to the
  solo daily quiz).

Both modes share the same code paths end to end: question rendering
(`src/components/QuestionView.tsx`), answer submission
(`POST /api/sessions/:id/answer`), and scoring/selection
(`worker/engine.ts`). The room's Durable Object only orchestrates timing and
WebSocket fan-out — questions, answers and points all live in D1 exactly as
they do for solo.

## Themes & question bank

Six themes — `makan`, `mrt_buses`, `singlish`, `heartlands`, `then_and_now`,
`national` — with 10 hand-written MCQs each (4 easy / 4 medium / 2 hard, four
options, one-line explanation). Source of truth is `seed/questions.json`;
`scripts/seed.mjs` generates SQL (shuffling stored option order
deterministically so `answer_index` varies) and loads it into local D1.

## Question selection

At session creation the server does a stratified draw: for 10 questions, 4
easy + 4 medium + 2 hard, ordered easy → hard. A random session seed shuffles
both the question order (within each difficulty tier) and each question's
option order. The chosen `question_ids` + seed are locked into the session
row. Questions the player saw in their last 3 sessions are excluded — but
since each theme has exactly 10 questions in v1, an immediate replay of the
same theme falls back to reusing seen questions (fresh ones are always
preferred first).

## Scoring

```
points = correct ? round(100 * (1 - 0.5 * elapsed/limit)) : 0
```

Room answers earn 100 at 0s decaying to 50 at the time limit (`elapsed` is
clamped to the limit). Solo has no timer and scores a flat 100 per correct
answer.

## Security model

Server-authoritative: `answer_index` never leaves the server before reveal.
Clients receive pre-shuffled option text and only ever post a *choice index*,
which the server maps back through the seeded permutation. Duplicate answers,
answers for non-current questions, answers after reveal, and question
peeking ahead of session progress are all rejected server-side. `/next` is
host-only, and WebSocket connections are validated against the session's
player list.

## API

| Method | Path | Body → Response |
| --- | --- | --- |
| POST | `/api/sessions` | `{mode:'solo', theme, count, player_id}` → session + first question |
| GET | `/api/sessions/:id/questions/:i` | → question `i` (only up to current progress) |
| POST | `/api/sessions/:id/answer` | `{player_id, q_index, choice_index, ms_taken}` → solo: correct + explanation + next question; room: `{accepted}` |
| GET | `/api/sessions/:id/results` | → leaderboard (+ full reveal once ended) |
| POST | `/api/rooms` | `{theme, count, question_seconds}` → `{room_code, session_id, host_player_id}` |
| POST | `/api/rooms/:code/join` | `{nickname, player_id?}` → `{player_id, ws_token, session_id}` |
| GET | `/api/rooms/:code` | → room info (theme, state, players) |
| WS | `/api/rooms/:code/ws` | events: `snapshot`, `player_joined`, `question_start`, `answer_count`, `question_end` (reveal + leaderboard), `session_end` |
| POST | `/api/rooms/:code/next` | `{host_player_id}` — host only; starts / reveals / advances |

Room flow niceties: a question auto-reveals when every player has answered,
and a Durable Object alarm force-reveals when the timer (plus 1s grace) runs
out even if nobody answers. Reconnecting sockets get a `snapshot` event to
catch up mid-game.

## Schema (D1)

```
questions(id, theme, difficulty, prompt, options_json, answer_index,
          explanation, times_served, times_correct)
sessions(id, mode, theme, room_code, host_player_id, seed, question_ids_json,
         state, current_index, question_seconds, created_at, expires_at)
players(id, session_id, nickname, joined_at)
answers(session_id, player_id, question_index, choice_index, is_correct,
        ms_taken, points)
```

## v1 limitations

- `ms_taken` is client-reported (clamped server-side to the question limit);
  a v2 would time answers against the server's `question_start` timestamp.
- `ws_token` is just the player id — fine for guest-only v1, replace with a
  signed token when auth lands.
- Deploying to real Cloudflare needs a real `database_id` in `wrangler.toml`
  and `wrangler d1 migrations apply` / seed with `--remote`.
