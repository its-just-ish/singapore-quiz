import { THEME_META, THEMES } from "../lib/types";

export default function ThemePicker({
  selected,
  onPick,
}: {
  selected?: string | null;
  onPick: (theme: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {THEMES.map((theme, i) => {
        const meta = THEME_META[theme];
        const isSelected = selected === theme;
        return (
          <button
            key={theme}
            onClick={() => onPick(theme)}
            className={`rounded-2xl p-4 text-left border-2 transition-transform active:scale-[0.97] animate-rise ${
              isSelected ? "border-ink/70 shadow-md" : "border-transparent shadow-sm"
            }`}
            style={{ backgroundColor: meta.tile, animationDelay: `${i * 40}ms` }}
          >
            <span className="text-3xl">{meta.emoji}</span>
            <p className="mt-2 font-bold leading-tight" style={{ color: meta.accent }}>
              {meta.label}
            </p>
            <p className="text-xs mt-0.5 text-ink/60 leading-snug">{meta.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}
