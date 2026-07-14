import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Screen from "../components/Screen";
import QuestionView from "../components/QuestionView";
import ShareCard from "../components/ShareCard";
import { createSoloSession, submitAnswer } from "../lib/api";
import { getPlayerId } from "../lib/player";
import { THEME_META, dailyTheme } from "../lib/types";
import type { PublicQuestion, Reveal } from "../lib/types";

export default function SoloPlay() {
  const { theme = "" } = useParams();
  const meta = THEME_META[theme];

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [nextQuestion, setNextQuestion] = useState<PublicQuestion | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!meta || started.current) return;
    started.current = true;
    createSoloSession(theme, getPlayerId())
      .then((res) => {
        setSessionId(res.session_id);
        setQuestion(res.question);
      })
      .catch((e) => setError(e.message));
  }, [theme, meta]);

  if (!meta) return <Navigate to="/" replace />;

  async function answer(choiceIndex: number, msTaken: number) {
    if (!sessionId || !question || chosen !== null) return;
    setChosen(choiceIndex);
    try {
      const res = await submitAnswer(sessionId, getPlayerId(), question.index, choiceIndex, msTaken);
      setReveal({
        correct: res.correct ?? false,
        correct_index: res.correct_index ?? 0,
        explanation: res.explanation ?? "",
        points: res.points ?? 0,
        your_choice: choiceIndex,
      });
      if (res.correct) {
        setTotalPoints((p) => p + (res.points ?? 0));
        setCorrectCount((c) => c + 1);
      }
      setNextQuestion(res.next_question ?? null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function advance() {
    if (nextQuestion) {
      setQuestion(nextQuestion);
      setNextQuestion(null);
      setChosen(null);
      setReveal(null);
    } else {
      setFinished(true);
    }
  }

  if (error)
    return (
      <Screen accent={meta.accent} backTo="/">
        <p className="rounded-2xl bg-rose-100 border border-rose-300 p-4 font-semibold">⚠️ {error}</p>
      </Screen>
    );

  if (finished && question)
    return (
      <Screen accent={meta.accent} backTo="/">
        <h1 className="text-2xl font-black text-center mb-4">Quiz done! 🎉</h1>
        <ShareCard theme={theme} points={totalPoints} correct={correctCount} total={question.total} />
        <div className="grid gap-3 mt-6">
          <button
            onClick={() => {
              started.current = false;
              setSessionId(null);
              setQuestion(null);
              setChosen(null);
              setReveal(null);
              setTotalPoints(0);
              setCorrectCount(0);
              setFinished(false);
              createSoloSession(theme, getPlayerId()).then((res) => {
                started.current = true;
                setSessionId(res.session_id);
                setQuestion(res.question);
              });
            }}
            className="btn-accent rounded-2xl py-4 font-bold text-lg"
          >
            Play {meta.label} again
          </button>
          <Link
            to={`/solo/${dailyTheme()}`}
            className="block text-center rounded-2xl py-4 font-bold border-2 border-black/10 bg-white"
            onClick={() => {
              started.current = false;
            }}
          >
            ☀️ Try today's daily quiz
          </Link>
          <Link to="/" className="text-center font-semibold text-ink/60 py-2">
            Back home
          </Link>
        </div>
      </Screen>
    );

  return (
    <Screen accent={meta.accent} backTo="/">
      <div className="flex items-center justify-between mb-4">
        <span
          className="rounded-full px-3 py-1 text-sm font-bold"
          style={{ backgroundColor: meta.tile, color: meta.accent }}
        >
          {meta.emoji} {meta.label}
        </span>
        <span className="font-bold tabular-nums text-accent">{totalPoints} pts</span>
      </div>

      {!question && <p className="text-center text-ink/50 font-semibold mt-16 animate-pulse">Preparing your questions…</p>}

      {question && (
        <>
          <QuestionView
            key={question.index}
            question={question}
            onAnswer={answer}
            chosen={chosen}
            reveal={reveal}
            endsAt={null}
          />
          {reveal && (
            <button onClick={advance} className="btn-accent mt-5 w-full rounded-2xl py-4 font-bold text-lg animate-pop">
              {nextQuestion ? "Next question →" : "See my score 🏁"}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}
