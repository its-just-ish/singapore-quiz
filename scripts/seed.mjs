#!/usr/bin/env node
// Generates SQL from seed/questions.json and loads it into the local D1 database.
// Options are shuffled deterministically per question so the stored answer_index varies.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(readFileSync(join(root, "seed", "questions.json"), "utf8"));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;

const rows = questions.map((q, i) => {
  const options = [q.answer, ...q.distractors];
  if (options.length !== 4) throw new Error(`Question ${i + 1} does not have 4 options`);
  const rng = mulberry32(0x5eed + i * 97);
  for (let j = options.length - 1; j > 0; j--) {
    const k = Math.floor(rng() * (j + 1));
    [options[j], options[k]] = [options[k], options[j]];
  }
  const answerIndex = options.indexOf(q.answer);
  return `(${i + 1}, ${esc(q.theme)}, ${q.difficulty}, ${esc(q.prompt)}, ${esc(
    JSON.stringify(options)
  )}, ${answerIndex}, ${esc(q.explanation)}, 0, 0)`;
});

const sql = [
  "DELETE FROM answers;",
  "DELETE FROM players;",
  "DELETE FROM sessions;",
  "DELETE FROM questions;",
  "INSERT INTO questions (id, theme, difficulty, prompt, options_json, answer_index, explanation, times_served, times_correct) VALUES",
  rows.join(",\n") + ";",
].join("\n");

const outPath = join(root, "seed", "seed.generated.sql");
writeFileSync(outPath, sql);
console.log(`Wrote ${questions.length} questions to ${outPath}`);

const themes = {};
for (const q of questions) {
  themes[q.theme] ??= { 1: 0, 2: 0, 3: 0 };
  themes[q.theme][q.difficulty]++;
}
console.table(themes);

execSync(`npx wrangler d1 execute kaki-quiz-db --local --file=${outPath}`, {
  cwd: root,
  stdio: "inherit",
});
console.log("Seed complete.");
