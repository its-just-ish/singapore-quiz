import { useEffect, useRef, useState } from "react";
import type { PublicQuestion, Reveal } from "../lib/types";

const OPTION_LABELS = ["A", "B", "C", "D"];

interface Props {
  question: PublicQuestion;
  /** Called once when the player picks an option. */
  onAnswer: (choiceIndex: number, msTaken: number) => void;
  /** The player's committed choice (locks the buttons). */
  chosen: number | null;
  /** When set, shows the answer, explanation and points. */
  reveal: Reveal | null;
  /** Countdown deadline (epoch ms) for room mode; solo passes null. */
  endsAt: number | null;
  seconds?: number | null;
  /** Host/observer view: buttons locked, no "waiting" message. */
  spectator?: boolean;
}

/**
 * The one question renderer used by BOTH solo and room games.
 * Solo: answer -> reveal arrives from the answer response.
 * Room: answer -> wait -> reveal arrives via the question_end broadcast.
 */
export default function QuestionView({ question, onAnswer, chosen, reveal, endsAt, seconds, spectator }: Props) {
  const shownAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    shownAt.current = Date.now();
  }, [question.index]);

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [endsAt]);

  const msLeft = endsAt ? Math.max(0, endsAt - now) : null;
  const fracLeft = msLeft !== null && seconds ? msLeft / (seconds * 1000) : null;

  const answered = chosen !== null;

  return (
    <div className="animate-rise">
      <div className="flex items-center justify-between text-sm font-semibold text-ink/60 mb-2">
        <span>
          Question {question.index + 1} of {question.total}
        </span>
        <span>{"●".repeat(question.difficulty)}{"○".repeat(3 - question.difficulty)}</span>
      </div>

      {fracLeft !== null && (
        <div className="h-2 rounded-full bg-black/10 overflow-hidden mb-4">
          <div
            className="h-full rounded-full transition-[width] duration-100 ease-linear"
            style={{ width: `${fracLeft * 100}%`, backgroundColor: "var(--accent)" }}
          />
        </div>
      )}

      <h2 className="text-2xl font-bold leading-snug mb-5">{question.prompt}</h2>

      <div className="grid gap-3">
        {question.options.map((option, i) => {
          const isChosen = chosen === i;
          const isCorrect = reveal && reveal.correct_index === i;
          const isWrongPick = reveal && isChosen && reveal.correct_index !== i;
          let cls =
            "w-full min-h-14 rounded-2xl px-4 py-3 text-left text-base font-semibold border-2 flex items-center gap-3 transition-colors";
          if (isCorrect) cls += " bg-emerald-100 border-emerald-500 text-emerald-900";
          else if (isWrongPick) cls += " bg-rose-100 border-rose-400 text-rose-900";
          else if (isChosen) cls += " border-[var(--accent)] bg-white shadow-sm";
          else if (reveal || answered) cls += " bg-white/70 border-black/10 text-ink/50";
          else cls += " bg-white border-black/10 shadow-sm active:scale-[0.98]";
          return (
            <button
              key={i}
              className={cls}
              disabled={spectator || answered || !!reveal || (msLeft !== null && msLeft <= 0)}
              onClick={() => onAnswer(i, Date.now() - shownAt.current)}
            >
              <span
                className="shrink-0 w-8 h-8 rounded-full grid place-items-center text-sm font-bold text-white"
                style={{ backgroundColor: isCorrect ? "#059669" : isWrongPick ? "#e11d48" : "var(--accent)" }}
              >
                {OPTION_LABELS[i]}
              </span>
              <span>{option}</span>
              {isCorrect && <span className="ml-auto">✓</span>}
              {isWrongPick && <span className="ml-auto">✗</span>}
            </button>
          );
        })}
      </div>

      {answered && !reveal && !spectator && (
        <p className="mt-4 text-center text-sm font-semibold text-ink/60 animate-pop">
          Answer locked in — waiting for everyone…
        </p>
      )}

      {reveal && (
        <div className="mt-5 rounded-2xl bg-white border border-black/10 p-4 shadow-sm animate-pop">
          <p className="font-bold text-lg">
            {reveal.correct === null
              ? "⏱️ Time's up!"
              : reveal.correct
                ? `✅ Correct! +${reveal.points} pts`
                : "❌ Not quite"}
          </p>
          <p className="mt-1 text-sm text-ink/70 leading-relaxed">{reveal.explanation}</p>
        </div>
      )}
    </div>
  );
}
