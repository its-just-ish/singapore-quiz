import type { LeaderboardEntry } from "../lib/types";

export default function Leaderboard({
  entries,
  highlightId,
}: {
  entries: LeaderboardEntry[];
  highlightId?: string;
}) {
  return (
    <ol className="grid gap-2">
      {entries.map((entry, i) => (
        <li
          key={entry.player_id}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 border animate-rise ${
            entry.player_id === highlightId
              ? "bg-white border-[var(--accent)] shadow-sm"
              : "bg-white/70 border-black/10"
          }`}
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className="w-7 text-center font-bold text-ink/50">{i + 1}</span>
          <span className="font-semibold flex-1 truncate">
            {entry.nickname}
            {entry.player_id === highlightId && <span className="text-ink/40"> (you)</span>}
          </span>
          <span className="font-bold tabular-nums text-accent">{entry.total_points}</span>
        </li>
      ))}
    </ol>
  );
}
