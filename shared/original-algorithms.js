const variant = (v, p, sex, tense) => {
  const plural = p.plural,
    female = sex === "f";
  const hiPref = p.hi,
    roPref = p.ro;
  const mIndex = plural ? 1 : 0;
  const habHi = v.stem + (female ? "ती" : plural ? "ते" : "ता"),
    habRo = v.roman + (female ? "ti" : plural ? "te" : "ta");
  const contHi = v.stem + " " + (female ? "रही" : plural ? "रहे" : "रहा"),
    contRo = v.roman + " " + (female ? "rahi" : plural ? "rahe" : "raha");
  const phi = (hi, ro) => ({ hi: hiPref + " " + hi, ro: roPref + " " + ro });
  const pastAux = female ? p.pastAuxF : p.pastAuxM,
    pastAuxRo = female ? p.pastRoF : p.pastRoM;
  switch (tense) {
    case "habitual":
      return phi(habHi + " " + p.aux, habRo + " " + p.auxRo);
    case "continuous":
      return phi(contHi + " " + p.aux, contRo + " " + p.auxRo);
    case "pastHabitual":
      return phi(habHi + " " + pastAux, habRo + " " + pastAuxRo);
    case "pastContinuous":
      return phi(contHi + " " + pastAux, contRo + " " + pastAuxRo);
    case "future": {
      const endingHi = plural ? "गे" : "गा",
        endingRo = plural ? "ge" : "ga";
      const eHi = female ? "गी" : endingHi,
        eRo = female ? "gi" : endingRo;
      return phi(v.sub[p.subIndex] + eHi, v.subRoman[p.subIndex] + eRo);
    }
    case "subjunctive":
      return phi(v.sub[p.subIndex], v.subRoman[p.subIndex]);
    case "perfective":
    case "presentPerfect":
    case "pastPerfect": {
      if (v.kind === "intr") {
        let hi = female
          ? p.hi === "हम" || p.hi === "वे"
            ? v.pf === "गई"
              ? "गईं"
              : v.pf === "आई"
                ? "आईं"
                : v.pf === "सोई"
                  ? "सोईं"
                  : v.pf + "ं"
            : v.pf
          : plural
            ? v.pm === "गया"
              ? "गए"
              : v.pm === "आया"
                ? "आए"
                : v.pm === "सोया"
                  ? "सोए"
                  : v.pm.endsWith("ा")
                    ? v.pm.slice(0, -1) + "े"
                    : v.pm
            : v.pm;
        let ro = female
          ? p.hi === "हम" || p.hi === "वे"
            ? v.prf + "n"
            : v.prf
          : plural
            ? v.prm.endsWith("a")
              ? v.prm.slice(0, -1) + "e"
              : v.prm
            : v.prm;
        if (tense === "presentPerfect")
          return phi(hi + " " + p.aux, ro + " " + p.auxRo);
        if (tense === "pastPerfect")
          return phi(hi + " " + pastAux, ro + " " + pastAuxRo);
        return phi(hi, ro);
      }
      const objHi = v.kind === "fixed" ? "" : female ? v.of : v.om;
      const objRo = v.kind === "fixed" ? "" : female ? v.ofr : v.omr;
      const perfHi = female ? v.pf : v.pm,
        perfRo = female ? v.prf : v.prm;
      // With ने the perfective agrees with a bare object, not necessarily with the speaker.
      let phraseHi = (objHi ? objHi + " " : "") + perfHi,
        phraseRo = (objRo ? objRo + " " : "") + perfRo;
      if (tense === "presentPerfect") {
        phraseHi += " है";
        phraseRo += " hai";
      }
      if (tense === "pastPerfect") {
        const objPastHi =
          v.kind === "fixed"
            ? v.id === "tohelp"
              ? "थी"
              : "था"
            : female
              ? "थी"
              : "था";
        phraseHi += " " + objPastHi;
        phraseRo += " " + (objPastHi === "थी" ? "thi" : "tha");
      }
      return { hi: p.ergHi + " " + phraseHi, ro: p.ergRo + " " + phraseRo };
    }
    default:
      return { hi: "", ro: "" };
  }
};
const SRS_DAY = 86400000;
const FSRS6_W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
];
const SRS_RATES = { again: 1, hard: 2, good: 3, easy: 4 };
const SRS_SM2_QUALITY = { again: 1, hard: 3, good: 4, easy: 5 };
const SRS_DEFAULT = () => ({
  algorithm: "fsrs",
  retention: 0.9,
  fromTests: true,
});
const srsClamp = (n, low, high) => Math.max(low, Math.min(high, n));
const srsDate = (val) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const srsD0 = (g) =>
  srsClamp(FSRS6_W[4] - Math.exp(FSRS6_W[5] * (g - 1)) + 1, 1, 10);
const srsFactor = () => Math.pow(0.9, -1 / FSRS6_W[20]) - 1;
function fsrsRetrievability(state, at = Date.now()) {
  if (!state || !state.stability || !state.lastReview) return null;
  const days = Math.max(0, (at - state.lastReview) / SRS_DAY);
  return Math.pow(
    1 + (srsFactor() * days) / Math.max(0.01, state.stability),
    -FSRS6_W[20],
  );
}
function fsrsNext(before, rate, time, retention) {
  const w = FSRS6_W,
    g = SRS_RATES[rate],
    prior = before?.lastReview ? before : null;
  let S,
    D,
    again = rate === "again";
  if (!prior) {
    S = w[g - 1];
    D = srsD0(g);
  } else {
    const oldS = srsClamp(Number(prior.stability) || w[2], 0.01, 36500),
      oldD = srsClamp(Number(prior.difficulty) || srsD0(3), 1, 10);
    const elapsed = Math.max(0, (time - prior.lastReview) / SRS_DAY),
      R = Math.pow(1 + (srsFactor() * elapsed) / oldS, -w[20]);
    D = srsClamp(
      w[7] * srsD0(4) +
        (1 - w[7]) * (oldD - (w[6] * (g - 3) * (10 - oldD)) / 9),
      1,
      10,
    );
    if (elapsed < 1) {
      // FSRS-6 same-day review rule, with success stability guaranteed not to fall.
      S = oldS * Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(oldS, -w[19]);
      if (!again) S = Math.max(oldS, S);
    } else if (again) {
      S =
        w[11] *
        Math.pow(D, -w[12]) *
        (Math.pow(oldS + 1, w[13]) - 1) *
        Math.exp(w[14] * (1 - R));
      S = Math.min(S, oldS);
    } else {
      const multiplier = (g === 2 ? w[15] : 1) * (g === 4 ? w[16] : 1);
      S =
        oldS *
        (1 +
          Math.exp(w[8]) *
            (11 - D) *
            Math.pow(oldS, -w[9]) *
            (Math.exp(w[10] * (1 - R)) - 1) *
            multiplier);
      S = Math.max(S, oldS);
    }
  }
  S = srsClamp(S, 0.01, 36500);
  const requested = srsClamp(Number(retention) || 0.9, 0.8, 0.97);
  const rawInterval = (S / srsFactor()) * (Math.pow(requested, -1 / w[20]) - 1);
  // The 10-minute relearning step after Again is a UI convention; the memory
  // state and long-term intervals use the published FSRS-6 equations.
  const intervalDays = again
    ? 10 / 1440
    : srsClamp(Math.round(rawInterval), 1, 36500);
  return {
    version: "fsrs6",
    stability: S,
    difficulty: D,
    reps: (prior?.reps || 0) + 1,
    lapses: (prior?.lapses || 0) + (again ? 1 : 0),
    lastReview: time,
    due: time + intervalDays * SRS_DAY,
    intervalDays,
  };
}
function sm2Next(before, rate, time) {
  const q = SRS_SM2_QUALITY[rate];
  const prev = before || {};
  const oldEase = srsClamp(Number(prev.ease) || 2.5, 1.3, 5);
  let repetitions = Number(prev.repetitions) || 0,
    intervalDays;
  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else if (repetitions === 0) {
    repetitions = 1;
    intervalDays = 1;
  } else if (repetitions === 1) {
    repetitions = 2;
    intervalDays = 6;
  } else {
    repetitions++;
    intervalDays = Math.ceil(
      Math.max(1, Number(prev.intervalDays) || 1) * oldEase,
    );
  }
  const ease = Math.max(
    1.3,
    oldEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );
  return {
    version: "sm2",
    repetitions,
    ease,
    intervalDays,
    lastReview: time,
    due: time + intervalDays * SRS_DAY,
    reps: (Number(prev.reps) || 0) + 1,
    lapses: (Number(prev.lapses) || 0) + (q < 3 ? 1 : 0),
  };
}
const clean = (s) =>
  String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u093c]/g, "")
    .replace(/[।.!?,;:'"“”’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const latin = (s) =>
  clean(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(aa|ā)\b/g, "aa");
function editDistance(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < b.length; j++)
      row.push(
        Math.min(
          prev[j + 1] + 1,
          row[j] + 1,
          prev[j] + (a[i] === b[j] ? 0 : 1),
        ),
      );
    prev = row;
  }
  return prev[b.length];
}
function evaluate(input, w, direction) {
  const normalized = latin(input);
  if (!normalized) return 0;
  const candidates =
    direction === "english"
      ? [
          w.en,
          ...(w.en.includes(" / ") ? w.en.split(" / ") : []),
          ...(w.id.startsWith("freq_")
            ? [w.en.replace(/\s*\([^)]*\)/g, "").trim()]
            : []),
          ...englishAliases(w),
        ]
      : [w.ro, w.hi, ...w.alts];
  const opts = candidates.map(latin);
  if (opts.includes(normalized)) return 2;
  let best = Infinity,
    bestlen = 0;
  for (const x of opts) {
    const d = editDistance(normalized, x);
    if (d < best) {
      best = d;
      bestlen = x.length;
    }
  }
  if (
    (best <= 2 && bestlen >= 6) ||
    (best <= Math.floor(bestlen * 0.13) && bestlen >= 12)
  )
    return 1;
  return 0;
}
function englishAliases(w) {
  const alias = {
    mother: ["mom", "mum"],
    father: ["dad", "papa"],
    motherinlaw: ["mother in law"],
    fatherinlaw: ["father in law"],
    grandmother: ["grandma"],
    goodm: ["good"],
    goodf: ["good"],
    tiredm: ["tired"],
    tiredf: ["tired"],
    bigm: ["big"],
    smallm: ["small", "younger"],
    old: ["old"],
    howareyou: ["how are you"],
    howareyouf: ["how are you"],
    twobrothers: ["i have two brothers"],
    calllater: ["i will call you later"],
    day: ["day"],
    friend: ["friend"],
    toeat: ["to eat"],
    haveeaten: ["have you eaten"],
    thankyou: ["thanks"],
  };
  return alias[w.id] || [];
}
export {
  variant,
  fsrsNext,
  sm2Next,
  fsrsRetrievability,
  evaluate,
  clean,
  latin,
  editDistance,
};

function arcadeCanon(s) {
  return latin(String(s).replace(/\([^)]*\)/g, ""))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function arcadeAnswers(w) {
  // Real-life sentence cards add a register annotation to English; it's metadata, not part of the translation.
  const original = w.en
    .replace(/\s*[·•]\s*(casual|respectful)\s*\((tum|aap)\)\s*$/i, "")
    .trim();
  const bases = [
    original,
    original.replace(/\s*\([^)]*\)/g, "").trim(),
    ...(original.includes(" / ") ? original.split(" / ") : []),
    ...englishAliases(w),
  ];
  const synonyms = {
    mother: ["mom", "mum"],
    father: ["dad"],
    grandmother: ["grandma"],
    grandfather: ["grandpa"],
    thanks: ["thank you"],
    yes: ["yeah", "yep"],
    no: ["nope"],
  };
  if (synonyms[w.id]) bases.push(...synonyms[w.id]);
  for (const x of [...bases]) {
    if (/^to\s+/i.test(x)) bases.push(x.replace(/^to\s+/i, ""));
    if (/^the\s+/i.test(x)) bases.push(x.replace(/^the\s+/i, ""));
    if (/^a\s+/i.test(x)) bases.push(x.replace(/^a\s+/i, ""));
    if (x.includes(", ")) bases.push(...x.split(", "));
  }
  return [...new Set(bases.map(arcadeCanon).filter(Boolean))];
}
function arcadeMatches(input, w) {
  const a = arcadeCanon(input);
  if (!a) return false;
  return arcadeAnswers(w).some(
    (b) =>
      a === b ||
      (b.length >= 6 &&
        Math.abs(a.length - b.length) <= 2 &&
        editDistance(a, b) <= (b.length >= 14 ? 2 : 1)),
  );
}
function romanCanonical(s) {
  let x = latin(s);
  if (/[\u0900-\u097F]/.test(x)) return x;
  return x
    .replace(/\bmein\b/g, "main")
    .replace(/\bhum\b/g, "ham")
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/\bhoon\b/g, "hun")
    .replace(/\bhun\b/g, "hun")
    .replace(/w/g, "v")
    .replace(/\s+/g, " ")
    .trim();
}
export { arcadeMatches, romanCanonical };
