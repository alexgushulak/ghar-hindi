import { fsrsNext, sm2Next } from "./original-algorithms.js";
export const USERS = ["Alex", "Andrew"];
export const initial = () => ({
  schemaVersion: 2,
  cards: {},
  days: {},
  tests: [],
  grammarRounds: [],
  attemptLog: [],
  srsEvents: [],
  missedIds: [],
  scheduler: { algorithm: "fsrs", retention: 0.9, fromTests: true },
  arcade: {
    sessions: [],
    settings: {
      source: "experience",
      category: "all",
      difficulty: "normal",
      roman: "off",
    },
    selectedIds: [],
    highScores: {},
    stats: { hits: 0, misses: 0 },
  },
  experience: "family",
  includeCore: true,
});
export const dayKey = (time = Date.now()) =>
  new Date(time).toLocaleDateString("en-CA");
export function normalize(input) {
  if (
    !input ||
    typeof input !== "object" ||
    !input.cards ||
    Array.isArray(input.cards) ||
    typeof input.cards !== "object"
  )
    throw Error("Choose a Ghar progress JSON file with a cards object.");
  const p = { ...initial(), ...input };
  for (const k of [
    "tests",
    "grammarRounds",
    "attemptLog",
    "srsEvents",
    "missedIds",
  ])
    p[k] = Array.isArray(p[k]) ? p[k] : [];
  p.days = p.days && typeof p.days === "object" ? p.days : {};
  p.scheduler = { ...initial().scheduler, ...p.scheduler };
  p.arcade = { ...initial().arcade, ...p.arcade };
  p.arcade.sessions = Array.isArray(p.arcade.sessions) ? p.arcade.sessions : [];
  p.arcade.selectedIds = Array.isArray(p.arcade.selectedIds)
    ? p.arcade.selectedIds
    : [];
  return p;
}
export function schedule(card, p) {
  return (
    card?.srs?.[p.scheduler.algorithm] ||
    (card?.reviews > 0 && card.due ? { due: card.due } : null)
  );
}
export function reduce(p, action) {
  p = structuredClone(p);
  const { type, payload: v = {}, at = Date.now() } = action;
  const mark = () => (p.days[dayKey(at)] = (p.days[dayKey(at)] || 0) + 1);
  const card = (id) =>
    (p.cards[id] ||= {
      reviews: 0,
      level: 0,
      quizAttempts: 0,
      quizEarned: 0,
      quizPossible: 0,
    });
  const review = (id, rate, source) => {
    const c = card(id);
    c.srs ||= {};
    c.srs.fsrs = fsrsNext(c.srs.fsrs, rate, at, p.scheduler.retention);
    c.srs.sm2 = sm2Next(c.srs.sm2, rate, at);
    c.due = schedule(c, p).due;
    c.reviewLog = [...(c.reviewLog || []), { date: at, rate, source }].slice(
      -1500,
    );
    p.srsEvents.push({ id, date: at, rate, source });
    p.srsEvents = p.srsEvents.slice(-6000);
  };
  if (type === "review") {
    const c = card(v.id);
    c.reviews++;
    c.level =
      v.rate === "again"
        ? 0
        : Math.min(6, (c.level || 0) + (v.rate === "easy" ? 2 : 1));
    review(v.id, v.rate, "flashcard");
    mark();
  } else if (type === "answer") {
    const c = card(v.id);
    c.quizAttempts++;
    c.quizEarned += v.score;
    c.quizPossible += 2;
    p.attemptLog.push({
      id: v.id,
      date: at,
      score: v.score,
      experience: v.experience,
    });
    p.attemptLog = p.attemptLog.slice(-6000);
    p.missedIds =
      v.score < 2
        ? [...new Set([...p.missedIds, v.id])]
        : p.missedIds.filter((id) => id !== v.id);
    if (p.scheduler.fromTests)
      review(
        v.id,
        v.score === 2
          ? v.choice
            ? "hard"
            : "good"
          : v.score === 1
            ? "hard"
            : "again",
        "test",
      );
    mark();
  } else if (type === "test") {
    p[v.grammar ? "grammarRounds" : "tests"].push({ ...v, date: at });
    p[v.grammar ? "grammarRounds" : "tests"] =
      p[v.grammar ? "grammarRounds" : "tests"].slice(-200);
  } else if (type === "arcade") {
    p.arcade.sessions.push({ ...v, date: at });
    p.arcade.sessions = p.arcade.sessions.slice(-350);
    const k = [v.difficulty, v.source, v.category].join("|");
    p.arcade.highScores[k] = Math.max(p.arcade.highScores[k] || 0, v.score);
    p.arcade.stats.hits = (p.arcade.stats.hits || 0) + v.hits;
    p.arcade.stats.misses = (p.arcade.stats.misses || 0) + v.misses;
    mark();
  } else if (type === "settings") {
    if (v.scheduler) p.scheduler = { ...p.scheduler, ...v.scheduler };
    for (const k of ["experience", "includeCore"]) if (k in v) p[k] = v[k];
    if (v.arcade) p.arcade = { ...p.arcade, ...v.arcade };
  } else if (type === "replace") return normalize(v);
  else if (type === "reset") return initial();
  else throw Error("Unknown action");
  return p;
}
export function streak(p) {
  let n = 0,
    d = new Date();
  if (!p.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (p.days[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
export function summary(p) {
  const cards = Object.values(p.cards);
  const tests = [...p.tests, ...p.grammarRounds];
  const earned = tests.reduce((n, t) => n + Number(t.points || 0), 0),
    possible = tests.reduce((n, t) => n + Number(t.total || 0) * 2, 0);
  return {
    streak: streak(p),
    studied: cards.filter((c) => c.reviews || c.quizAttempts).length,
    mastered: cards.filter((c) => c.level >= 3).length,
    reviews: cards.reduce((n, c) => n + (c.reviews || 0), 0),
    tests: tests.length,
    accuracy: possible ? Math.round((earned / possible) * 100) : null,
    arcadeRuns: p.arcade.sessions.length,
    arcadeBest: Math.max(0, ...p.arcade.sessions.map((s) => s.score || 0)),
    activeDays: Object.keys(p.days).length,
  };
}
