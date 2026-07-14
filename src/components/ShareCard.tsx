import { useState } from "react";
import { THEME_META } from "../lib/types";

interface Props {
  theme: string;
  points: number;
  correct: number;
  total: number;
}

function verdict(correct: number, total: number): string {
  const r = correct / total;
  if (r === 1) return "Powerful lah! Full marks! 💯";
  if (r >= 0.8) return "Steady pom pi pi! 🔥";
  if (r >= 0.6) return "Not bad ah, quite on! 👍";
  if (r >= 0.4) return "Aiyo, half-half only 😅";
  return "Die die must try again! 🫠";
}

export default function ShareCard({ theme, points, correct, total }: Props) {
  const meta = THEME_META[theme];
  const [copied, setCopied] = useState(false);

  const shareText = `${meta.emoji} Kaki Quiz — ${meta.label}\nI scored ${points} pts (${correct}/${total} correct). ${verdict(correct, total)}\nCome and beat me: ${location.origin}`;

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: "Kaki Quiz", text: shareText }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div
      className="rounded-3xl p-6 text-center shadow-md animate-pop"
      style={{ backgroundColor: meta.tile }}
    >
      <span className="text-4xl">{meta.emoji}</span>
      <p className="mt-1 text-sm font-bold uppercase tracking-widest" style={{ color: meta.accent }}>
        {meta.label}
      </p>
      <p className="text-5xl font-black mt-3 tabular-nums" style={{ color: meta.accent }}>
        {points}
      </p>
      <p className="text-sm font-semibold text-ink/60">points</p>
      <p className="mt-2 font-bold">
        {correct}/{total} correct
      </p>
      <p className="text-sm text-ink/70 mt-1">{verdict(correct, total)}</p>
      <button
        onClick={share}
        className="mt-5 w-full rounded-2xl py-3 font-bold text-white active:scale-[0.98] transition-transform"
        style={{ backgroundColor: meta.accent }}
      >
        {copied ? "Copied! 📋" : "Share your score"}
      </button>
    </div>
  );
}
