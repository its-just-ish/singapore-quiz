import type { LeaderboardEntry } from "../lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];
const HEIGHTS = ["h-28", "h-20", "h-14"];
const ORDER = [1, 0, 2]; // display silver–gold–bronze

export default function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  return (
    <div className="flex items-end justify-center gap-3 py-4">
      {ORDER.filter((rank) => rank < top.length).map((rank) => {
        const entry = top[rank];
        return (
          <div key={entry.player_id} className="flex flex-col items-center w-24 animate-rise" style={{ animationDelay: `${rank * 120}ms` }}>
            <span className="text-3xl mb-1">{MEDALS[rank]}</span>
            <span className="font-bold text-sm text-center truncate w-full">{entry.nickname}</span>
            <span className="text-xs text-ink/60 mb-2 tabular-nums">{entry.total_points} pts</span>
            <div
              className={`w-full ${HEIGHTS[rank]} rounded-t-xl`}
              style={{ backgroundColor: "var(--accent)", opacity: 1 - rank * 0.25 }}
            />
          </div>
        );
      })}
    </div>
  );
}
