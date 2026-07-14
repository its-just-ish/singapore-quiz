import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Screen from "../components/Screen";
import QuestionView from "../components/QuestionView";
import Leaderboard from "../components/Leaderboard";
import Podium from "../components/Podium";
import { joinRoom, submitAnswer } from "../lib/api";
import { getNickname, getPlayerId, setNickname as saveNickname } from "../lib/player";
import { useRoomSocket } from "../lib/useRoomSocket";
import { THEME_META, dailyTheme } from "../lib/types";
import type { LeaderboardEntry, PublicQuestion, Reveal, RoomEvent } from "../lib/types";

const ACCENT = "#0369a1";

type Phase = "join" | "lobby" | "question" | "reveal" | "ended";

export default function RoomJoin() {
  const { code: codeParam = "" } = useParams();
  const navigate = useNavigate();
  const code = codeParam.toUpperCase();

  const [nickname, setNickname] = useState(getNickname());
  const [joined, setJoined] = useState<{ player_id: string; ws_token: string; session_id: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("join");
  const [players, setPlayers] = useState<{ id: string; nickname: string }[]>([]);
  const [theme, setTheme] = useState("");
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosenRef = useRef<number | null>(null);

  const playerId = getPlayerId();

  useRoomSocket(
    joined ? code : null,
    playerId,
    joined?.ws_token ?? null,
    (event: RoomEvent) => {
      switch (event.type) {
        case "snapshot":
          setPhase((event.state as string) === "lobby" ? "lobby" : (event.state as Phase));
          setPlayers((event.players as any[]) ?? []);
          setTheme(event.theme as string);
          setSeconds((event.question_seconds as number) ?? null);
          if (event.question) setQuestion(event.question as PublicQuestion);
          if (event.ends_at) setEndsAt(event.ends_at as number);
          if (event.leaderboard) setLeaderboard(event.leaderboard as LeaderboardEntry[]);
          break;
        case "player_joined":
          setPlayers(event.players as any[]);
          break;
        case "question_start":
          setPhase("question");
          setQuestion(event.question as PublicQuestion);
          setEndsAt(event.ends_at as number);
          setSeconds(event.seconds as number);
          setChosen(null);
          chosenRef.current = null;
          setReveal(null);
          break;
        case "question_end": {
          setPhase("reveal");
          setEndsAt(null);
          const myChoice = chosenRef.current;
          const correctIndex = event.correct_index as number;
          const pointsMap = (event.points_by_player as Record<string, number>) ?? {};
          setReveal({
            correct: myChoice === null ? null : myChoice === correctIndex,
            correct_index: correctIndex,
            explanation: event.explanation as string,
            points: pointsMap[playerId] ?? 0,
            your_choice: myChoice,
          });
          setLeaderboard(event.leaderboard as LeaderboardEntry[]);
          break;
        }
        case "session_end":
          setPhase("ended");
          setLeaderboard(event.leaderboard as LeaderboardEntry[]);
          break;
      }
    }
  );

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await joinRoom(code, nickname.trim(), playerId);
      saveNickname(nickname.trim());
      setJoined(res);
      setTheme(res.theme);
      setPhase(res.state === "lobby" ? "lobby" : (res.state as Phase));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function answer(choiceIndex: number, msTaken: number) {
    if (!joined || !question || chosenRef.current !== null) return;
    setChosen(choiceIndex);
    chosenRef.current = choiceIndex;
    try {
      await submitAnswer(joined.session_id, playerId, question.index, choiceIndex, msTaken);
    } catch {
      /* too late or duplicate — the reveal broadcast will sort it out */
    }
  }

  if (!code)
    return (
      <Screen accent={ACCENT} backTo="/">
        <h1 className="text-2xl font-black mb-3">Join a room</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = (new FormData(e.currentTarget).get("code") as string).trim().toUpperCase();
            if (value) navigate(`/join/${value}`);
          }}
        >
          <input
            name="code"
            placeholder="ABCDE"
            maxLength={5}
            className="w-full rounded-2xl border-2 border-black/10 bg-white px-4 py-4 font-black tracking-[0.4em] uppercase text-center text-xl focus:outline-none focus:border-[var(--accent)]"
          />
          <button type="submit" className="btn-accent mt-4 w-full rounded-2xl py-4 font-bold text-lg">
            Continue
          </button>
        </form>
      </Screen>
    );

  const meta = THEME_META[theme];
  const myEntry = leaderboard.find((e) => e.player_id === playerId);
  const myRank = leaderboard.findIndex((e) => e.player_id === playerId) + 1;

  return (
    <Screen accent={ACCENT} backTo="/">
      {phase === "join" && (
        <form onSubmit={join} className="animate-rise">
          <h1 className="text-2xl font-black mb-1">Joining room {code}</h1>
          <p className="text-ink/60 font-medium mb-5">What should your kakis call you?</p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your nickname"
            maxLength={20}
            autoFocus
            className="w-full rounded-2xl border-2 border-black/10 bg-white px-4 py-4 font-bold text-lg focus:outline-none focus:border-[var(--accent)]"
          />
          {error && (
            <p className="mt-4 rounded-xl bg-rose-100 border border-rose-300 p-3 font-semibold text-sm">
              ⚠️ {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!nickname.trim() || busy}
            className="btn-accent mt-4 w-full rounded-2xl py-4 font-bold text-lg disabled:opacity-40"
          >
            {busy ? "Joining…" : "Join room"}
          </button>
        </form>
      )}

      {phase === "lobby" && (
        <div className="text-center animate-rise">
          <p className="text-5xl mt-8">{meta?.emoji ?? "🎉"}</p>
          <h1 className="text-2xl font-black mt-2">You're in, {nickname}!</h1>
          <p className="text-ink/60 font-medium mt-1">
            {meta ? `Theme: ${meta.label}. ` : ""}Waiting for the host to start…
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-6">
            {players.map((p) => (
              <span
                key={p.id}
                className={`rounded-full px-3 py-1.5 font-semibold border animate-pop ${
                  p.id === playerId ? "bg-white border-[var(--accent)]" : "bg-white/70 border-black/10"
                }`}
              >
                {p.nickname}
              </span>
            ))}
          </div>
        </div>
      )}

      {(phase === "question" || phase === "reveal") && question && (
        <>
          <QuestionView
            key={question.index}
            question={question}
            onAnswer={answer}
            chosen={chosen}
            reveal={reveal}
            endsAt={endsAt}
            seconds={seconds}
          />
          {phase === "reveal" && (
            <>
              <h2 className="font-bold text-lg mt-6 mb-2">Leaderboard</h2>
              <Leaderboard entries={leaderboard} highlightId={playerId} />
              <p className="mt-3 text-center text-sm font-semibold text-ink/50">
                Host controls the next question — get ready!
              </p>
            </>
          )}
        </>
      )}

      {phase === "ended" && (
        <div className="animate-rise">
          <h1 className="text-2xl font-black text-center">
            {myRank === 1 ? "Champion lah! 🏆" : "Game over!"}
          </h1>
          {myEntry && (
            <p className="text-center text-ink/60 font-semibold mt-1">
              You finished #{myRank} with {myEntry.total_points} pts
            </p>
          )}
          <Podium entries={leaderboard} />
          <Leaderboard entries={leaderboard} highlightId={playerId} />

          <Link
            to={`/solo/${dailyTheme()}`}
            className="block mt-6 rounded-2xl p-4 text-center shadow-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: THEME_META[dailyTheme()].tile }}
          >
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: THEME_META[dailyTheme()].accent }}>
              ☀️ Keep the streak going
            </p>
            <p className="font-bold text-lg mt-0.5">Play today's solo daily quiz →</p>
          </Link>
          <Link to="/" className="block text-center font-semibold text-ink/60 py-4">
            Back home
          </Link>
        </div>
      )}
    </Screen>
  );
}
