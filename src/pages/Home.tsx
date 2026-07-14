import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Screen from "../components/Screen";
import ThemePicker from "../components/ThemePicker";
import { THEME_META, dailyTheme } from "../lib/types";

export default function Home() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const daily = dailyTheme();
  const dailyMeta = THEME_META[daily];

  return (
    <Screen accent="#0e7490">
      <div className="text-center mt-2 mb-6">
        <h1 className="text-4xl font-black tracking-tight">
          Kaki <span className="text-accent">Quiz</span>
        </h1>
        <p className="mt-1 text-ink/60 font-medium">How Singaporean are you, ah?</p>
      </div>

      <Link
        to={`/solo/${daily}`}
        className="block rounded-2xl p-4 mb-6 border-2 border-transparent shadow-sm active:scale-[0.98] transition-transform animate-pop"
        style={{ backgroundColor: dailyMeta.tile }}
      >
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: dailyMeta.accent }}>
          ☀️ Today's daily quiz
        </p>
        <p className="font-bold text-lg mt-0.5">
          {dailyMeta.emoji} {dailyMeta.label} — 10 questions
        </p>
      </Link>

      <h2 className="font-bold text-lg mb-3">Play solo — pick a theme</h2>
      <ThemePicker onPick={(theme) => navigate(`/solo/${theme}`)} />

      <h2 className="font-bold text-lg mt-8 mb-3">Play with your kakis</h2>
      <div className="grid gap-3">
        <Link
          to="/host"
          className="btn-accent block rounded-2xl py-4 text-center font-bold text-lg shadow-sm"
        >
          🎤 Host a room
        </Link>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (joinCode.trim()) navigate(`/join/${joinCode.trim().toUpperCase()}`);
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={5}
            className="flex-1 rounded-2xl border-2 border-black/10 bg-white px-4 py-3 font-bold tracking-[0.3em] uppercase text-center focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={joinCode.trim().length < 5}
            className="btn-accent rounded-2xl px-6 font-bold disabled:opacity-40"
          >
            Join
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-ink/40 mt-10">
        Made with ❤️ for kopitiam trivia nights
      </p>
    </Screen>
  );
}
