import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Page shell: sets the per-screen accent colour and a phone-width column. */
export default function Screen({
  accent,
  children,
  backTo,
}: {
  accent: string;
  children: ReactNode;
  /** Where "‹ Back" leads; omit for the home page (no header shown). */
  backTo?: string;
}) {
  return (
    <div className="min-h-dvh" style={{ "--accent": accent } as React.CSSProperties}>
      <div className="mx-auto max-w-md px-5 pt-5 pb-10">
        {backTo !== undefined && (
          <header className="flex items-center justify-between mb-4">
            <Link to={backTo} className="font-black text-lg tracking-tight text-accent">
              ‹ Back
            </Link>
            <Link to="/" className="font-black tracking-tight text-accent">
              Kaki Quiz
            </Link>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
