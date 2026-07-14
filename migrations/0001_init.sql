-- Kaki Quiz schema

CREATE TABLE IF NOT EXISTS questions (
  id            INTEGER PRIMARY KEY,
  theme         TEXT NOT NULL,
  difficulty    INTEGER NOT NULL CHECK (difficulty IN (1, 2, 3)),
  prompt        TEXT NOT NULL,
  options_json  TEXT NOT NULL,
  answer_index  INTEGER NOT NULL,
  explanation   TEXT NOT NULL,
  times_served  INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_questions_theme_diff ON questions (theme, difficulty);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  mode              TEXT NOT NULL CHECK (mode IN ('solo', 'room')),
  theme             TEXT NOT NULL,
  room_code         TEXT UNIQUE,
  host_player_id    TEXT,
  seed              INTEGER NOT NULL,
  question_ids_json TEXT NOT NULL,
  state             TEXT NOT NULL,
  current_index     INTEGER NOT NULL DEFAULT 0,
  question_seconds  INTEGER,
  created_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON sessions (room_code);

CREATE TABLE IF NOT EXISTS players (
  id         TEXT NOT NULL,
  session_id TEXT NOT NULL,
  nickname   TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, id)
);
CREATE INDEX IF NOT EXISTS idx_players_player ON players (id, joined_at);

CREATE TABLE IF NOT EXISTS answers (
  session_id     TEXT NOT NULL,
  player_id      TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  choice_index   INTEGER NOT NULL,
  is_correct     INTEGER NOT NULL,
  ms_taken       INTEGER NOT NULL,
  points         INTEGER NOT NULL,
  PRIMARY KEY (session_id, player_id, question_index)
);
