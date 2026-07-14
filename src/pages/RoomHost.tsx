import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import Screen from "../components/Screen";
import QuestionView from "../components/QuestionView";
import Leaderboard from "../components/Leaderboard";
import Podium from "../components/Podium";
import { advanceRoom } from "../lib/api";
import { getHostKey } from "../lib/player";
import { useRoomSocket } from "../lib/useRoomSocket";
import { THEME_META } from "../lib/types";
import type { LeaderboardEntry, PublicQuestion, Reveal, RoomEvent } from "../lib/types";

const ACCENT = "#7e22ce";

type Phase = "lobby" | "question" | "reveal" | "ended";

export default function RoomHost() {
  const { code = "" } = useParams();
  const hostId = useMemo(() => getHostKey(code), [code]);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<{ id: string; nickname: string }[]>([]);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [theme, setTheme] = useState<string>("");
  const [answered, setAnswered] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [qr, setQr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const joinUrl = `${location.origin}/join/${code}`;
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 480, margin: 1, color: { dark: "#263238" } }).then(setQr);
  }, [joinUrl]);

  const connected = useRoomSocket(code, hostId, hostId, (event: RoomEvent) => {
    switch (event.type) {
      case "snapshot": {
        setPhase(event.state as Phase);
        setPlayers((event.players as any[]) ?? []);
        setTheme(event.theme as string);
        setSeconds((event.question_seconds as number) ?? null);
        if (event.question) setQuestion(event.question as PublicQuestion);
        if (event.ends_at) setEndsAt(event.ends_at as number);
        if (event.leaderboard) setLeaderboard(event.leaderboard as LeaderboardEntry[]);
        break;
      }
      case "player_joined":
        setPlayers(event.players as any[]);
        break;
      case "question_start":
        setPhase("question");
        setQuestion(event.question as PublicQuestion);
        setEndsAt(event.ends_at as number);
        setSeconds(event.seconds as number);
        setAnswered(0);
        setReveal(null);
        break;
      case "answer_count":
        setAnswered(event.answered as number);
        break;
      case "question_end":
        setPhase("reveal");
        setEndsAt(null);
        setReveal({
          correct: null,
          correct_index: event.correct_index as number,
          explanation: event.explanation as string,
          points: 0,
          your_choice: null,
        });
        setLeaderboard(event.leaderboard as LeaderboardEntry[]);
        break;
      case "session_end":
        setPhase("ended");
        setLeaderboard(event.leaderboard as LeaderboardEntry[]);
        break;
    }
  });

  if (!hostId)
    return (
      <Screen accent={ACCENT} backTo="/">
        <p className="rounded-2xl bg-rose-100 border border-rose-300 p-4 font-semibold">
          This browser isn't the host of room {code}.{" "}
          <Link to="/host" className="underline">Create your own room?</Link>
        </p>
      </Screen>
    );

  async function next() {
    if (busy) return;
    setBusy(true);
    try {
      await advanceRoom(code, hostId!);
    } finally {
      setBusy(false);
    }
  }

  const meta = THEME_META[theme];
  const isLastQuestion = question ? question.index + 1 >= question.total : false;

  return (
    <Screen accent={ACCENT} backTo="/">
      <div className="flex items-center justify-between mb-4">
        <span className="rounded-full bg-white border border-black/10 px-3 py-1 font-black tracking-[0.2em]">
          {code}
        </span>
        <span className={`text-xs font-bold ${connected ? "text-emerald-600" : "text-rose-500"}`}>
          {connected ? "● live" : "○ reconnecting…"}
        </span>
      </div>

      {phase === "lobby" && (
        <div className="text-center animate-rise">
          <h1 className="text-2xl font-black">
            {meta ? `${meta.emoji} ${meta.label}` : "Room"} lobby
          </h1>
          <p className="text-ink/60 font-medium mt-1 mb-4">Scan to join, or enter the code at kaki quiz</p>
          {qr && (
            <img
              src={qr}
              alt={`QR code to join room ${code}`}
              className="mx-auto w-56 h-56 rounded-2xl border border-black/10 bg-white p-2"
            />
          )}
          <p className="mt-3 text-3xl font-black tracking-[0.35em] text-accent">{code}</p>

          <div className="mt-6 text-left">
            <h2 className="font-bold mb-2">
              Players ({players.length}) {players.length === 0 && "— waiting for kakis…"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <span key={p.id} className="rounded-full bg-white border border-black/10 px-3 py-1.5 font-semibold animate-pop">
                  {p.nickname}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={next}
            disabled={players.length === 0 || busy}
            className="btn-accent mt-8 w-full rounded-2xl py-4 font-bold text-lg disabled:opacity-40"
          >
            Start quiz ▶
          </button>
        </div>
      )}

      {phase === "question" && question && (
        <>
          <QuestionView
            key={question.index}
            question={question}
            onAnswer={() => {}}
            chosen={null}
            reveal={null}
            endsAt={endsAt}
            seconds={seconds}
            spectator
          />
          <p className="mt-4 text-center font-bold text-ink/70">
            {answered}/{players.length} answered
          </p>
          <button onClick={next} disabled={busy} className="btn-accent mt-4 w-full rounded-2xl py-3 font-bold">
            Reveal now ⏭
          </button>
        </>
      )}

      {phase === "reveal" && question && (
        <>
          <QuestionView
            key={`reveal-${question.index}`}
            question={question}
            onAnswer={() => {}}
            chosen={null}
            reveal={reveal}
            endsAt={null}
          />
          <h2 className="font-bold text-lg mt-6 mb-2">Leaderboard</h2>
          <Leaderboard entries={leaderboard} />
          <button onClick={next} disabled={busy} className="btn-accent mt-5 w-full rounded-2xl py-4 font-bold text-lg">
            {isLastQuestion ? "Finish — show podium 🏆" : "Next question →"}
          </button>
        </>
      )}

      {phase === "ended" && (
        <div className="animate-rise">
          <h1 className="text-2xl font-black text-center">Final podium 🏆</h1>
          <Podium entries={leaderboard} />
          <Leaderboard entries={leaderboard} />
          <Link
            to="/host"
            className="btn-accent block mt-6 rounded-2xl py-4 text-center font-bold text-lg"
          >
            Host another round
          </Link>
        </div>
      )}
    </Screen>
  );
}
