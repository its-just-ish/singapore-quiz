import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Screen from "../components/Screen";
import ThemePicker from "../components/ThemePicker";
import { createRoom } from "../lib/api";
import { rememberHostKey } from "../lib/player";

const ACCENT = "#7e22ce";

export default function RoomCreate() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<string | null>(null);
  const [count, setCount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!theme || busy) return;
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(theme, count, seconds);
      rememberHostKey(room.room_code, room.host_player_id);
      navigate(`/host/${room.room_code}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Screen accent={ACCENT} backTo="/">
      <h1 className="text-2xl font-black mb-1">Host a room 🎤</h1>
      <p className="text-ink/60 font-medium mb-5">
        Pick a theme, get a code, and your kakis join on their phones.
      </p>

      <ThemePicker selected={theme} onPick={setTheme} />

      <div className="grid grid-cols-2 gap-3 mt-6">
        <label className="block">
          <span className="text-sm font-bold text-ink/60">Questions</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border-2 border-black/10 bg-white px-3 py-3 font-bold"
          >
            <option value={5}>5 — quick one</option>
            <option value={10}>10 — standard</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-ink/60">Seconds per question</span>
          <select
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border-2 border-black/10 bg-white px-3 py-3 font-bold"
          >
            <option value={10}>10 — kancheong</option>
            <option value={20}>20 — standard</option>
            <option value={30}>30 — relak</option>
          </select>
        </label>
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-100 border border-rose-300 p-3 font-semibold text-sm">⚠️ {error}</p>}

      <button
        onClick={create}
        disabled={!theme || busy}
        className="btn-accent mt-6 w-full rounded-2xl py-4 font-bold text-lg disabled:opacity-40"
      >
        {busy ? "Creating…" : "Create room"}
      </button>
    </Screen>
  );
}
