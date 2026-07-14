// Shared quiz engine: question selection, seeded shuffles, scoring.
// Used by both the HTTP API (solo + room answers) and the Room Durable Object,
// so solo and room games run through identical logic.
import type { PublicQuestion, QuestionRow } from "./types";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deterministic permutation of option order for one question in one session.
 * perm[displayedIndex] = canonicalIndex.
 */
export function optionPerm(sessionSeed: number, questionIndex: number, n: number): number[] {
  const rng = mulberry32((sessionSeed ^ (questionIndex * 0x9e3779b9)) >>> 0);
  return seededShuffle(Array.from({ length: n }, (_, i) => i), rng);
}

/** Stratified draw: ~40% easy, ~40% medium, rest hard, ordered easy -> hard.
 *  Prefers questions the player has not seen recently; tops up from seen ones
 *  if the pool runs dry. Question order within each tier is shuffled by seed. */
export function selectQuestionIds(
  pool: { id: number; difficulty: number }[],
  count: number,
  seed: number,
  recentlySeen: Set<number>
): number[] {
  const easyTarget = Math.round(count * 0.4);
  const mediumTarget = Math.round(count * 0.4);
  const targets: [number, number][] = [
    [1, easyTarget],
    [2, mediumTarget],
    [3, count - easyTarget - mediumTarget],
  ];
  const rng = mulberry32(seed);
  const picked: number[] = [];
  for (const [difficulty, target] of targets) {
    const tier = pool.filter((q) => q.difficulty === difficulty);
    const fresh = seededShuffle(tier.filter((q) => !recentlySeen.has(q.id)), rng);
    const seen = seededShuffle(tier.filter((q) => recentlySeen.has(q.id)), rng);
    picked.push(...[...fresh, ...seen].slice(0, target).map((q) => q.id));
  }
  return picked;
}

/** Build the client-safe question payload: options shuffled by session seed, no answer index. */
export function toPublicQuestion(
  row: QuestionRow,
  seed: number,
  index: number,
  total: number
): PublicQuestion {
  const options: string[] = JSON.parse(row.options_json);
  const perm = optionPerm(seed, index, options.length);
  return {
    index,
    total,
    prompt: row.prompt,
    options: perm.map((canonical) => options[canonical]),
    theme: row.theme,
    difficulty: row.difficulty,
  };
}

/** Map a displayed choice index back to the canonical stored index. */
export function toCanonicalChoice(seed: number, index: number, displayedChoice: number, n: number): number {
  return optionPerm(seed, index, n)[displayedChoice];
}

/** Where the canonical correct answer appears in the displayed (shuffled) order. */
export function displayedCorrectIndex(seed: number, index: number, answerIndex: number, n: number): number {
  return optionPerm(seed, index, n).indexOf(answerIndex);
}

/**
 * points = correct ? round(100 * (1 - 0.5 * elapsed/limit)) : 0
 * Solo has no timer (limitSeconds null) and scores a flat 100 for correct.
 */
export function scorePoints(correct: boolean, msTaken: number, limitSeconds: number | null): number {
  if (!correct) return 0;
  if (!limitSeconds) return 100;
  const limitMs = limitSeconds * 1000;
  const elapsed = Math.min(Math.max(msTaken, 0), limitMs);
  return Math.round(100 * (1 - 0.5 * (elapsed / limitMs)));
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no confusable 0/O/1/I/L

export function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
