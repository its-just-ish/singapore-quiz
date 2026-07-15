#!/usr/bin/env node
// Sanity-checks the question bank without needing a database:
// 60 questions, 10 per theme (4 easy / 4 medium / 2 hard), 4 distinct options each.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(readFileSync(join(root, "seed", "questions.json"), "utf8"));

const THEMES = ["makan", "mrt_buses", "singlish", "heartlands", "then_and_now", "national"];
const errors = [];

if (questions.length !== 60) errors.push(`Expected 60 questions, found ${questions.length}`);

const byTheme = {};
questions.forEach((q, i) => {
  const where = `question ${i + 1} (${q.theme})`;
  if (!THEMES.includes(q.theme)) errors.push(`${where}: unknown theme`);
  if (![1, 2, 3].includes(q.difficulty)) errors.push(`${where}: bad difficulty ${q.difficulty}`);
  if (!q.prompt?.trim()) errors.push(`${where}: empty prompt`);
  if (!q.explanation?.trim()) errors.push(`${where}: empty explanation`);
  const options = [q.answer, ...(q.distractors ?? [])];
  if (options.length !== 4) errors.push(`${where}: needs exactly 4 options, has ${options.length}`);
  if (new Set(options).size !== options.length) errors.push(`${where}: duplicate options`);
  byTheme[q.theme] ??= { 1: 0, 2: 0, 3: 0 };
  byTheme[q.theme][q.difficulty]++;
});

for (const theme of THEMES) {
  const counts = byTheme[theme] ?? { 1: 0, 2: 0, 3: 0 };
  if (counts[1] !== 4 || counts[2] !== 4 || counts[3] !== 2)
    errors.push(`${theme}: expected 4 easy / 4 medium / 2 hard, got ${counts[1]}/${counts[2]}/${counts[3]}`);
}

if (errors.length) {
  console.error("Question bank validation FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Question bank OK: ${questions.length} questions across ${THEMES.length} themes.`);
