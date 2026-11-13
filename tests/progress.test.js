import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  reduce,
  summary,
  normalize,
  schedule,
} from "../shared/progress.js";
import { evaluate, variant } from "../shared/original-algorithms.js";
import fs from "node:fs";
const c = JSON.parse(
  fs.readFileSync(new URL("../shared/curriculum.json", import.meta.url)),
);
test("full source curriculum and register pairs retained", () => {
  assert.equal(c.words.length, 1016);
  assert.equal(c.frequencyIds.length, 500);
  assert.equal(new Set(c.words.map((w) => w.id)).size, 1016);
  for (const id of c.sentenceIds) {
    const w = c.words.find((w) => w.id === id);
    assert.ok(["casual", "polite"].includes(w.tone));
    assert.ok(w.hi && w.ro && w.note);
  }
});
test("flashcard review updates both algorithms without mutating prior state", () => {
  let p = initial();
  const n = reduce(p, {
    type: "review",
    payload: { id: "mother", rate: "good" },
    at: 1700000000000,
  });
  assert.equal(Object.keys(p.cards).length, 0);
  assert.ok(n.cards.mother.srs.fsrs.due > 1700000000000);
  assert.ok(n.cards.mother.srs.sm2.due > 1700000000000);
  assert.equal(summary(n).studied, 1);
  assert.equal(schedule(n.cards.mother, n).due, n.cards.mother.srs.fsrs.due);
});
test("graded answers, sessions, arcade summaries and imports work", () => {
  let p = initial();
  p = reduce(p, { type: "answer", payload: { id: "mother", score: 0 } });
  assert.deepEqual(p.missedIds, ["mother"]);
  p = reduce(p, { type: "answer", payload: { id: "mother", score: 2 } });
  assert.deepEqual(p.missedIds, []);
  p = reduce(p, { type: "test", payload: { total: 10, points: 15 } });
  p = reduce(p, {
    type: "arcade",
    payload: {
      score: 120,
      hits: 1,
      misses: 2,
      difficulty: "easy",
      source: "all",
      category: "all",
    },
  });
  assert.equal(summary(p).accuracy, 75);
  assert.equal(summary(p).arcadeBest, 120);
  assert.equal(normalize({ cards: {}, tests: [] }).scheduler.algorithm, "fsrs");
  assert.throws(() => normalize({}), /cards/);
});
test("Hindi, Roman aliases and original grammar evaluation", () => {
  const w = c.words.find((w) => w.id === "mother");
  assert.equal(evaluate("माँ", w, "typing"), 2);
  assert.equal(evaluate("mata", w, "typing"), 2);
  const form = variant(
    c.verbs.toeat,
    c.pronouns.find((p) => p.ro === "main"),
    "m",
    "habitual",
  );
  assert.equal(form.hi, "मैं खाता हूँ");
});
