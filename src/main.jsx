import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import curriculum from "../shared/curriculum.json";
import {
  initial,
  normalize,
  reduce,
  schedule,
  summary,
  USERS,
  dayKey,
} from "../shared/progress.js";
import {
  evaluate,
  variant,
  clean,
  latin,
  editDistance,
  arcadeMatches,
  romanCanonical,
} from "../shared/original-algorithms.js";
import "./original.css";
import "./styles.css";
const {
  words,
  experiences,
  coreIds,
  frequencyIds,
  sentenceIds,
  verbs,
  genders,
  plurals,
  pronouns,
  tenses,
} = curriculum;
const byId = new Map(words.map((w) => [w.id, w]));
const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const speak = (w) => {
  if (!window.speechSynthesis)
    return alert("Speech playback is unavailable in this browser.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(w.hi);
  u.lang = "hi-IN";
  u.rate = 0.78;
  speechSynthesis.speak(u);
};
const options = [
  ["all", "This experience"],
  ["today", "☀ Today’s plan"],
  ["due", "Due for review"],
  ["new", "New cards"],
  ["weak", "Weak / missed words"],
  ["core50", "First 50 essentials"],
  ["coreall", "Everyday essentials"],
  ["corephrases", "Essential phrases"],
  ["freqall", "Top 500"],
  ...Array.from({ length: 5 }, (_, i) => [
    "freq" + (i + 1),
    `Top 500 · ${i * 100 + 1}–${(i + 1) * 100}`,
  ]),
  ["sentences", "Useful sentences"],
  ["sentences-casual", "Casual · tum"],
  ["sentences-polite", "Respectful · aap"],
  ...["Basics", "Nouns", "Verbs", "Adjectives", "Phrases"].map((x) => [x, x]),
];
const active = (p) =>
  words.filter(
    (w) =>
      w.experiences.includes(p.experience) ||
      (p.includeCore && coreIds.includes(w.id)),
  );
function poolFor(deck, p) {
  if (deck.startsWith("custom:")) return pick(deck.slice(7).split(","));
  const now = Date.now(),
    due = words.filter((w) => schedule(p.cards[w.id], p)?.due <= now),
    fresh = words.filter((w) => !schedule(p.cards[w.id], p)),
    weak = words.filter(
      (w) =>
        p.missedIds.includes(w.id) ||
        (p.cards[w.id]?.quizAttempts &&
          p.cards[w.id].quizEarned / p.cards[w.id].quizPossible < 0.7),
    );
  if (deck === "today")
    return [
      ...new Map(
        [
          ...due.slice(0, 20),
          ...pick(coreIds)
            .filter((w) => fresh.includes(w))
            .slice(0, 10),
          ...weak.slice(0, 5),
        ].map((w) => [w.id, w]),
      ).values(),
    ];
  if (deck === "due") return due;
  if (deck === "new") return fresh;
  if (deck === "weak") return weak;
  if (deck === "core50") return pick(coreIds).slice(0, 50);
  if (deck === "coreall") return pick(coreIds);
  if (deck === "corephrases")
    return pick(coreIds).filter((w) => w.cat === "Phrases");
  if (deck === "freqall") return pick(frequencyIds);
  if (/^freq[1-5]$/.test(deck))
    return pick(frequencyIds).slice(
      (Number(deck.at(-1)) - 1) * 100,
      Number(deck.at(-1)) * 100,
    );
  if (deck.startsWith("sentences"))
    return pick(sentenceIds).filter(
      (w) =>
        deck === "sentences" ||
        w.tone === (deck.endsWith("casual") ? "casual" : "polite"),
    );
  if (deck === "everything") return words;
  return active(p).filter((w) => deck === "all" || w.cat === deck);
}
function Select({ value, onChange, items, label }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}
function Metric({ label, value, detail }) {
  return (
    <div className="panel metric">
      <div className="meta">{label}</div>
      <strong>{value ?? "—"}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
async function api(path, body) {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) {
    const error = Error(data.error || "Could not connect");
    error.status = r.status;
    throw error;
  }
  return data;
}
function useProfile(name) {
  const [p, setP] = useState(null),
    [status, setStatus] = useState("Loading shared progress…");
  const pending = useRef([]),
    version = useRef(0),
    busy = useRef(false),
    alive = useRef(true);
  const current = useRef(null);
  const drain = useCallback(async () => {
    if (busy.current || !pending.current.length) return;
    busy.current = true;
    try {
      while (pending.current.length) {
        const a = pending.current[0];
        const result = await api(`users/${name}/actions`, a);
        pending.current.shift();
        version.current = result.version;
        let next = result.progress;
        for (const q of pending.current) next = reduce(next, q);
        current.current = next;
        if (alive.current) setP(next);
        localStorage.setItem(
          "ghar-pending-" + name,
          JSON.stringify(pending.current),
        );
      }
      if (alive.current) setStatus("Saved to shared server");
    } catch (e) {
      if (e.status === 409) {
        pending.current.shift();
        localStorage.setItem(
          "ghar-pending-" + name,
          JSON.stringify(pending.current),
        );
        const r = await api("users/" + name);
        version.current = r.version;
        current.current = r.progress;
        if (alive.current) {
          setP(r.progress);
          alert(e.message);
        }
      }
      if (alive.current) setStatus("Save pending · " + e.message);
    } finally {
      busy.current = false;
    }
  }, [name]);
  useEffect(() => {
    alive.current = true;
    let stopped = false;
    const load = async () => {
      try {
        const r = await api("users/" + name);
        if (stopped) return;
        version.current = r.version;
        try {
          pending.current = JSON.parse(
            localStorage.getItem("ghar-pending-" + name) || "[]",
          );
        } catch {
          pending.current = [];
        }
        let next = r.progress;
        for (const a of pending.current) next = reduce(next, a);
        current.current = next;
        setP(next);
        setStatus("Saved to shared server");
        drain();
      } catch (e) {
        if (!stopped) setStatus("Connection failed · " + e.message);
      }
    };
    load();
    const t = setInterval(async () => {
      if (pending.current.length) {
        drain();
        return;
      }
      if (busy.current) return;
      try {
        const r = await api("users/" + name);
        if (!stopped && !pending.current.length) {
          version.current = r.version;
          current.current = r.progress;
          setP(r.progress);
          setStatus("Saved to shared server");
        }
      } catch {
        if (!stopped) setStatus("Offline · reconnect to sync");
      }
    }, 5000);
    return () => {
      stopped = true;
      alive.current = false;
      clearInterval(t);
    };
  }, [name, drain]);
  const dispatch = (type, payload) => {
    const a = {
      id: crypto.randomUUID(),
      type,
      payload,
      at: Date.now(),
      baseVersion: version.current,
    };
    current.current = reduce(current.current, a);
    setP(current.current);
    pending.current.push(a);
    localStorage.setItem(
      "ghar-pending-" + name,
      JSON.stringify(pending.current),
    );
    setStatus("Saving…");
    drain();
  };
  return { p, dispatch, status, pending: pending.current.length, retry: drain };
}
function App() {
  const [name, setName] = useState(null);
  return name ? (
    <Studio key={name} name={name} onSwitch={() => setName(null)} />
  ) : (
    <div className="welcome">
      <div className="welcome-art">घर</div>
      <div className="eyebrow">YOUR HINDI LEARNING STUDIO</div>
      <h1>
        A little Hindi.
        <br />A little closer.
      </h1>
      <p>
        Your words, your world, your pace.
        <br />
        Choose who’s learning today.
      </p>
      <div className="user-choices">
        {USERS.map((n, i) => (
          <button key={n} onClick={() => setName(n)} className="user-choice">
            <span className={"person p" + i}>{n[0]}</span>
            <strong>{n}</strong>
            <small>Continue learning ↗</small>
          </button>
        ))}
      </div>
      <small className="muted">
        Two learners. Separate progress. A little friendly competition.
      </small>
    </div>
  );
}
function Studio({ name, onSwitch }) {
  const { p, dispatch, status, pending, retry } = useProfile(name);
  const [page, setPage] = useState("home"),
    [deck, setDeck] = useState("all"),
    [menu, setMenu] = useState(false);
  const go = (v, d) => {
    if (d) setDeck(d);
    setPage(v);
    setMenu(false);
    window.scrollTo(0, 0);
  };
  if (!p)
    return (
      <div className="welcome">
        <h1>Namaste, {name}.</h1>
        <p role="status">{status}</p>
        <button className="btn secondary" onClick={() => location.reload()}>
          Retry connection
        </button>
      </div>
    );
  const ex = experiences.find((e) => e.id === p.experience) || experiences[1],
    stats = summary(p);
  const nav = [
    ["home", "⌂", "My studio"],
    ["cards", "▱", "Flashcards"],
    ["quiz", "✦", "Practice tests"],
    ["library", "≡", "Word library"],
    ["sentences", "❝", "Useful sentences"],
    ["grammar", "↗", "Grammar lab"],
    ["arcade", "⚡", "Hindi Rush"],
    ["scoreboard", "♜", "Alex vs Andrew"],
    ["progress", "◷", "My progress"],
  ];
  return (
    <div
      className="layout"
      style={{
        "--brand": ex.accent,
        "--brand-dark": ex.dark,
        "--brand-pale": ex.pale,
      }}
    >
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <div className="brand">
          <span className="mark">घ</span>
          <div className="brandtext">
            <b>Ghar</b>
            <small>Your Hindi studio</small>
          </div>
          <button
            className="menu-close"
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>
        <div className="navlabel">MAKE YOURSELF AT HOME</div>
        <nav className="nav">
          {nav.map(([id, icon, title]) => (
            <button
              key={id}
              className={"nav-btn " + (page === id ? "active" : "")}
              onClick={() => go(id)}
            >
              <span>{icon}</span>
              {title}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="tipbox">
            <b>Little by little. रोज़ थोड़ा।</b>
            <p>{ex.tip}</p>
          </div>
          <button
            className="link-btn"
            onClick={() => {
              if (pending) {
                alert("Wait for pending saves before switching learners.");
                return;
              }
              onSwitch();
            }}
          >
            Switch learner · {name} ↗
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div className="top-identity">
            <button
              className="menu-toggle"
              onClick={() => setMenu(!menu)}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <span className="crumb">
              Ghar / <strong>{nav.find((x) => x[0] === page)?.[2]}</strong>
            </span>
          </div>
          <div className="topright">
            <button
              className="sync"
              onClick={retry}
              title="Retry pending saves"
              aria-live="polite"
            >
              {status}
            </button>
            <span className="avatar" title={name}>
              {name[0]}
            </span>
          </div>
        </header>
        <div className="world-picker">
          <Select
            label="YOUR WORLD"
            value={p.experience}
            items={experiences.map((e) => [e.id, e.icon + " " + e.name])}
            onChange={(v) => dispatch("settings", { experience: v })}
          />
          <label className="core-check">
            <input
              type="checkbox"
              checked={p.includeCore}
              onChange={(e) =>
                dispatch("settings", { includeCore: e.target.checked })
              }
            />{" "}
            Include everyday essentials
          </label>
        </div>
        {page === "home" && (
          <>
            <div className="hero">
              <div className="hero-copy">
                <div className="eyebrow">नमस्ते, {name.toUpperCase()}</div>
                <h1>{ex.title}</h1>
                <p>{ex.blurb}</p>
                <button className="btn" onClick={() => go("cards", "today")}>
                  Start today’s practice →
                </button>
              </div>
              <div className="home-illustration" aria-hidden="true">
                <span>घर</span>
                <small>{ex.hi}</small>
              </div>
            </div>
            <div className="metrics">
              <Metric
                label="Words practiced"
                value={stats.studied}
                detail={`of ${words.length} cards`}
              />
              <Metric label="Words mastered" value={stats.mastered} />
              <Metric
                label="Test accuracy"
                value={stats.accuracy === null ? "—" : stats.accuracy + "%"}
              />
              <Metric
                label="Day streak"
                value={stats.streak}
                detail="Keep showing up"
              />
            </div>
            <div className="section-head">
              <h2>Your daily rhythm</h2>
              <button className="link-btn" onClick={() => go("progress")}>
                See progress ↗
              </button>
            </div>
            <div className="daily-grid">
              {[
                ["due", "Review what’s due", "Keep familiar words fresh."],
                [
                  "new",
                  "Meet something new",
                  "Build your everyday vocabulary.",
                ],
                [
                  "weak",
                  "Give tricky words some love",
                  "Practice your missed answers.",
                ],
              ].map(([d, title, desc]) => (
                <button
                  className="panel daily-card"
                  key={d}
                  onClick={() => go("cards", d)}
                >
                  <span>{poolFor(d, p).length}</span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </button>
              ))}
            </div>
            <div className="section-head">
              <h2>Find your next words.</h2>
            </div>
            <div className="category-grid">
              {[
                ["core50", "⭐", "Your first 50"],
                ["freqall", "🔤", "Top 500 words"],
                ["sentences", "❝", "Real-life sentences"],
                ["all", ex.icon, ex.name + " vocabulary"],
              ].map(([d, icon, title]) => (
                <button
                  key={d}
                  className="category"
                  onClick={() => go("cards", d)}
                >
                  <span className="cat-icon">{icon}</span>
                  <div>
                    <b>{title}</b>
                    <small>{poolFor(d, p).length} cards to explore</small>
                  </div>
                  <span className="arr">→</span>
                </button>
              ))}
            </div>
            <div className="arcade-invite panel">
              <div>
                <div className="eyebrow">A DIFFERENT KIND OF RECALL</div>
                <h2>A little rush. A lot of Hindi.</h2>
                <p>
                  Clear falling Hindi words by typing their English meaning.
                </p>
              </div>
              <button className="btn" onClick={() => go("arcade")}>
                Play Hindi Rush ⚡
              </button>
            </div>
          </>
        )}
        {page === "cards" && (
          <Flashcards p={p} dispatch={dispatch} deck={deck} setDeck={setDeck} />
        )}
        {page === "quiz" && (
          <Quiz p={p} dispatch={dispatch} initialDeck={deck} />
        )}
        {page === "library" && <Library p={p} go={go} />}
        {page === "sentences" && <Library p={p} go={go} sentences />}
        {page === "grammar" && <Grammar p={p} dispatch={dispatch} />}
        {page === "arcade" && <Arcade p={p} dispatch={dispatch} />}
        {page === "scoreboard" && <Scoreboard />}
        {page === "progress" && (
          <Progress p={p} dispatch={dispatch} name={name} pending={pending} />
        )}
      </main>
      <nav className="mobile-nav">
        {nav
          .filter((x) =>
            ["home", "cards", "arcade", "scoreboard"].includes(x[0]),
          )
          .map(([id, icon, title]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <span>{icon}</span>
              {id === "scoreboard"
                ? "Scores"
                : id === "cards"
                  ? "Cards"
                  : id === "home"
                    ? "Studio"
                    : "Rush"}
            </button>
          ))}
        <button onClick={() => setMenu(true)}>
          <span>☰</span>More
        </button>
      </nav>
    </div>
  );
}
function Scheduler({ p, dispatch }) {
  return (
    <div className="srs-panel">
      <div className="srs-row">
        <div>
          <div className="eyebrow">SPACED REPETITION</div>
          <h3>Remember more, review less.</h3>
        </div>
        <div className="srs-selects">
          <Select
            label="Algorithm"
            value={p.scheduler.algorithm}
            items={[
              ["fsrs", "FSRS-6 · Modern"],
              ["sm2", "SM-2 · Classic"],
            ]}
            onChange={(v) =>
              dispatch("settings", { scheduler: { algorithm: v } })
            }
          />
          <Select
            label="Target recall"
            value={p.scheduler.retention}
            items={[
              [0.85, "85% · Fewer reviews"],
              [0.9, "90% · Balanced"],
              [0.95, "95% · More reviews"],
            ]}
            onChange={(v) =>
              dispatch("settings", { scheduler: { retention: Number(v) } })
            }
          />
        </div>
      </div>
      <label className="core-check">
        <input
          type="checkbox"
          checked={p.scheduler.fromTests}
          onChange={(e) =>
            dispatch("settings", { scheduler: { fromTests: e.target.checked } })
          }
        />{" "}
        Update review schedules from graded tests
      </label>
    </div>
  );
}
function Flashcards({ p, dispatch, deck, setDeck }) {
  const [queue, setQueue] = useState(() => poolFor(deck, p)),
    [i, setI] = useState(0),
    [flip, setFlip] = useState(false);
  useEffect(() => {
    setQueue(poolFor(deck, p));
    setI(0);
    setFlip(false);
  }, [deck, p.experience, p.includeCore]);
  const w = queue[i];
  const advance = (n) => {
    setI((x) => (x + n + queue.length) % queue.length);
    setFlip(false);
  };
  useEffect(() => {
    const handler = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlip((v) => !v);
      }
      if (e.key === "ArrowRight" && w) advance(1);
      if (e.key === "ArrowLeft" && w) advance(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue.length, w]);
  return (
    <>
      <div className="headline">
        <div className="eyebrow">RECALL PRACTICE</div>
        <h1>Your flashcards.</h1>
        <p>Flip, remember, and rate how well you knew it.</p>
      </div>
      <Scheduler p={p} dispatch={dispatch} />
      <div className="study-wrap">
        <Select
          label="Choose your deck"
          value={deck}
          onChange={setDeck}
          items={
            deck.startsWith("custom:")
              ? [
                  [
                    "custom:" + queue.map((w) => w.id).join(","),
                    "Your filtered collection",
                  ],
                  ...options,
                ]
              : options
          }
        />
        <div className="study-meta">
          <span>
            {w ? `Card ${i + 1} of ${queue.length}` : "All caught up"}
          </span>
          <span className="tag">{w?.cat || "REVIEW"}</span>
        </div>
        <button
          className={"study-card " + (flip ? "flipped" : "")}
          onClick={() => setFlip(!flip)}
          aria-pressed={flip}
        >
          <span className="mini">
            {w ? (flip ? "THE ANSWER" : "TRANSLATE TO HINDI") : "YOU DID IT"}
          </span>
          <div
            className={"mainword " + (flip ? "hindi" : "")}
            lang={flip ? "hi" : "en"}
          >
            {w ? (flip ? w.hi : w.en) : "All caught up ✨"}
          </div>
          <div className="subword">{flip && w?.ro}</div>
          <span className="helper">
            {flip ? "HOW WELL DID YOU REMEMBER?" : "TAP TO REVEAL ANSWER ↗"}
          </span>
        </button>
        <p className="card-note">
          {flip && w?.note}
          {flip &&
            genders[w?.id] &&
            " · " + (genders[w.id] === "f" ? "Feminine" : "Masculine")}
        </p>
        {w && schedule(p.cards[w.id], p) && (
          <p className="schedule-note">
            Next review:{" "}
            {new Date(schedule(p.cards[w.id], p).due).toLocaleString()} ·{" "}
            {p.scheduler.algorithm === "fsrs" ? "FSRS-6" : "SM-2"}
          </p>
        )}
        <div className="study-grade">
          {[
            ["again", "↻ Again", "danger"],
            ["hard", "◔ Hard", "warn"],
            ["good", "✓ Good", "good"],
            ["easy", "★ Easy", "green"],
          ].map(([rate, title, cls]) => (
            <button
              key={rate}
              className={"btn " + cls}
              disabled={!flip || !w}
              onClick={() => {
                dispatch("review", { id: w.id, rate });
                advance(1);
              }}
            >
              {title}
            </button>
          ))}
        </div>
        <div className="study-controls">
          <button
            className="btn secondary"
            disabled={!w}
            onClick={() => advance(-1)}
          >
            ← Previous
          </button>
          <button
            className="btn secondary"
            disabled={!w}
            onClick={() => speak(w)}
          >
            ♫ Listen
          </button>
          <button
            className="btn secondary"
            disabled={!w}
            onClick={() => advance(1)}
          >
            Next →
          </button>
        </div>
        <p className="keyboard">Space to flip · Arrow keys to navigate</p>
      </div>
    </>
  );
}
function Quiz({ p, dispatch, initialDeck = "all", grammarMode }) {
  const [deck, setDeck] = useState(
      options.some(([id]) => id === initialDeck) ? initialDeck : "all",
    ),
    [format, setFormat] = useState("typing"),
    [length, setLength] = useState("10"),
    [run, setRun] = useState(null),
    [answer, setAnswer] = useState(""),
    [result, setResult] = useState(null),
    [done, setDone] = useState(false);
  const start = (retry) => {
    let items =
      retry ||
      shuffle(poolFor(deck, p)).slice(
        0,
        length === "all" ? Infinity : Number(length),
      );
    if (grammarMode)
      items = Array.from(
        { length: length === "all" ? 20 : Number(length) },
        () => {
          const w = shuffle(
            active(p).filter((w) =>
              grammarMode === "nouns"
                ? genders[w.id]
                : verbs[w.id] && verbs[w.id].kind !== "exp",
            ),
          )[0];
          if (!w) return null;
          if (grammarMode === "nouns")
            return {
              ...w,
              prompt: w.hi + " · " + w.ro,
              expected: genders[w.id],
              grammar: true,
            };
          const pronoun = shuffle(pronouns)[0],
            sex = Math.random() < 0.5 ? "m" : "f",
            tense = shuffle(tenses.filter((t) => t[0] !== "imperative"))[0];
          const form = variant(verbs[w.id], pronoun, sex, tense[0]);
          return {
            ...w,
            prompt: `${w.en} · ${pronoun.hi} (${pronoun.ro}) · ${sex === "f" ? "feminine" : "masculine"} · ${tense[1]}`,
            hi: form.hi,
            ro: form.ro,
            alts: [],
            grammar: true,
          };
        },
      ).filter(Boolean);
    if (!items.length)
      return alert("No cards in that deck yet. Choose another deck.");
    setRun({
      items,
      i: 0,
      points: 0,
      answers: [],
      choices: makeChoices(items[0]),
    });
    setDone(false);
    setResult(null);
    setAnswer("");
  };
  const makeChoices = (w) =>
    shuffle([
      w,
      ...shuffle(poolFor(deck, p).filter((x) => x.id !== w.id)).slice(0, 3),
    ]);
  const w = run?.items[run.i];
  const submit = (value) => {
    if (result !== null || !String(value).trim()) return;
    const score =
      value === "__reveal__"
        ? 0
        : grammarMode === "verbs"
          ? [w.hi, w.ro].some(
              (a) => romanCanonical(a) === romanCanonical(value),
            )
            ? 2
            : evaluate(value, w, "typing")
          : grammarMode === "nouns"
            ? value === w.expected
              ? 2
              : 0
            : format === "choice" && !grammarMode
              ? value === w.id
                ? 2
                : 0
              : evaluate(value, w, format);
    setResult(score);
    setRun({
      ...run,
      points: run.points + score,
      answers: [...run.answers, { id: w.id, score }],
    });
    dispatch("answer", {
      id: w.id,
      score,
      choice: format === "choice",
      experience: p.experience,
    });
  };
  const next = () => {
    if (run.i + 1 === run.items.length) {
      dispatch("test", {
        points: run.points,
        total: run.items.length,
        type: grammarMode ? "grammar-" + grammarMode : format,
        grammar: !!grammarMode,
        deck,
        experience: p.experience,
      });
      setDone(true);
    } else
      setRun({
        ...run,
        i: run.i + 1,
        choices: makeChoices(run.items[run.i + 1]),
      });
    setResult(null);
    setAnswer("");
  };
  return (
    <div className="quiz-shell">
      <div className="headline">
        <div className="eyebrow">PUT IT INTO PRACTICE</div>
        <h1>
          {grammarMode ? "Grammar practice." : "A little test of recall."}
        </h1>
        <p>
          Exact answers earn 2 points. Close answers earn 1. Every attempt helps
          you learn.
        </p>
      </div>
      {!run ? (
        <div className="panel quiz-setup">
          <h2>Ready when you are.</h2>
          <div className="setup-grid">
            {!grammarMode && (
              <>
                <Select
                  label="What to practice"
                  value={deck}
                  onChange={setDeck}
                  items={options}
                />
                <Select
                  label="Answer format"
                  value={format}
                  onChange={setFormat}
                  items={[
                    ["typing", "Type Hindi / Roman Hindi"],
                    ["english", "Translate to English"],
                    ["choice", "Multiple choice"],
                  ]}
                />
              </>
            )}
            <Select
              label="Questions"
              value={length}
              onChange={setLength}
              items={[
                ["10", "10 · Quick practice"],
                ["20", "20 · Deep practice"],
                ["all", "All available"],
              ]}
            />
          </div>
          <button className="btn" onClick={() => start()}>
            Start my test →
          </button>
        </div>
      ) : done ? (
        <div className="panel quiz-panel test-results">
          <div className="eyebrow">SESSION COMPLETE</div>
          <h1>Nicely practiced.</h1>
          <div className="result-circle">
            {Math.round((run.points / (run.items.length * 2)) * 100)}%
          </div>
          <p>
            You earned {run.points} of {run.items.length * 2} possible points.
          </p>
          <div className="button-row">
            <button
              className="btn"
              onClick={() => {
                setRun(null);
                setDone(false);
              }}
            >
              New test
            </button>
            <button
              className="btn secondary"
              disabled={!run.answers.some((a) => a.score < 2)}
              onClick={() =>
                start(run.items.filter((_, i) => run.answers[i].score < 2))
              }
            >
              Retry misses →
            </button>
          </div>
        </div>
      ) : (
        <div className="panel quiz-panel">
          <div className="row">
            <span className="question-meta">
              QUESTION {run.i + 1} OF {run.items.length}
            </span>
            <span className="tag">{run.points} points</span>
          </div>
          <div className="qbar">
            <div style={{ width: `${(run.i / run.items.length) * 100}%` }} />
          </div>
          <div className="promptarea">
            <span className="promptmini">
              {grammarMode === "nouns"
                ? "WHAT IS THE GENDER?"
                : format === "english"
                  ? "TRANSLATE TO ENGLISH"
                  : "SAY THIS IN HINDI"}
            </span>
            <div className="promptword">
              {w.prompt || (format === "english" ? w.hi : w.en)}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              result !== null ? next() : submit(answer);
            }}
          >
            {grammarMode === "nouns" ? (
              <div className="answer-options">
                {[
                  ["m", "Masculine"],
                  ["f", "Feminine"],
                  ["c", "Common gender"],
                ].map(([v, title]) => (
                  <button
                    type="button"
                    key={v}
                    className="choice"
                    disabled={result !== null}
                    onClick={() => submit(v)}
                  >
                    {title}
                  </button>
                ))}
              </div>
            ) : format === "choice" && !grammarMode ? (
              <div className="answer-options">
                {run.choices.map((c) => (
                  <button
                    type="button"
                    className={
                      "choice " +
                      (result !== null && c.id === w.id ? "correct-choice" : "")
                    }
                    key={c.id}
                    disabled={result !== null}
                    onClick={() => submit(c.id)}
                  >
                    {c.ro}
                  </button>
                ))}
              </div>
            ) : (
              <div className="quiz-entry">
                <input
                  autoFocus
                  className="input"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  readOnly={result !== null}
                  placeholder="Type your answer…"
                  aria-label="Your answer"
                />
                <button
                  className="btn"
                  disabled={result !== null || !answer.trim()}
                >
                  Check →
                </button>
              </div>
            )}
            {grammarMode && result === null && (
              <button
                className="link-btn reveal-btn"
                type="button"
                onClick={() => submit("__reveal__")}
              >
                Reveal answer · 0 points
              </button>
            )}
            {result !== null && (
              <div
                className={
                  "feedback " +
                  (result === 0 ? "bad" : result === 1 ? "partial" : "")
                }
                role="status"
              >
                <b>
                  {result === 2
                    ? "Perfect!"
                    : result === 1
                      ? "Close!"
                      : "Keep practicing."}{" "}
                  {result} points
                </b>
                <div className="feedback-word">
                  {grammarMode === "nouns"
                    ? w.expected === "f"
                      ? "Feminine"
                      : w.expected === "m"
                        ? "Masculine"
                        : "Common gender"
                    : format === "english"
                      ? w.en
                      : w.hi + " · " + w.ro}
                </div>
                <p>{w.note}</p>
              </div>
            )}
            {result !== null && (
              <button className="btn next-btn" type="button" onClick={next}>
                {run.i + 1 === run.items.length
                  ? "See my results"
                  : "Next question"}{" "}
                →
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
function Library({ p, go, sentences = false }) {
  const [deck, setDeck] = useState(sentences ? "sentences" : "all"),
    [query, setQuery] = useState(""),
    [scene, setScene] = useState("all"),
    [tone, setTone] = useState("both");
  let list = poolFor(deck, p).filter((w) =>
    clean([w.en, w.hi, w.ro, w.note].join(" ")).includes(clean(query)),
  );
  if (sentences)
    list = list.filter(
      (w) =>
        (scene === "all" || w.experiences.includes(scene)) &&
        (tone === "both" || w.tone === tone),
    );
  return (
    <>
      <div className="headline">
        <div className="eyebrow">
          {sentences
            ? "EVERYDAY CONVERSATION · REAL HINDI"
            : "EXPLORE YOUR VOCABULARY"}
        </div>
        <h1>{sentences ? "Say it naturally." : "A word for your world."}</h1>
        <p>
          {sentences
            ? "Practice tum (casual) and aap (respectful) separately, with Hindi script, Roman pronunciation, and grammar notes."
            : "All the original words, phrases, pronunciation, and notes. Search in English, Hindi, or Roman Hindi."}
        </p>
      </div>
      {sentences && (
        <div className="sentence-notice">
          <b>Casual ≠ rude.</b> Tum is natural with friends and peers. Aap
          conveys respect and is safer with elders, new acquaintances, and
          service staff.
        </div>
      )}
      <div className="library-filters panel">
        {sentences ? (
          <>
            <Select
              label="Situation"
              value={scene}
              onChange={setScene}
              items={[
                ["all", "All situations"],
                ...experiences.map((e) => [e.id, e.icon + " " + e.name]),
              ]}
            />
            <Select
              label="Speak to…"
              value={tone}
              onChange={setTone}
              items={[
                ["both", "Both · tum + aap"],
                ["casual", "Casual · tum"],
                ["polite", "Respectful · aap"],
              ]}
            />
          </>
        ) : (
          <Select
            label="Collection"
            value={deck}
            onChange={setDeck}
            items={[...options, ["everything", "Entire curriculum"]]}
          />
        )}
        <label className="field">
          <span>SEARCH</span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try ‘water’, ‘paani’, ‘पानी’…"
          />
        </label>
      </div>
      {!sentences && deck.startsWith("freq") && (
        <div className="freq-grid">
          {[1, 2, 3, 4, 5].map((n) => {
            const level = pick(frequencyIds).slice((n - 1) * 100, n * 100);
            const count = level.filter(
              (w) => p.cards[w.id]?.reviews || p.cards[w.id]?.quizAttempts,
            ).length;
            return (
              <div className="panel freq-unit" key={n}>
                <span className="eyebrow">LEVEL {n}</span>
                <h3>
                  Words {(n - 1) * 100 + 1}–{n * 100}
                </h3>
                <p>{count} / 100 practiced</p>
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{ width: count + "%" }}
                  />
                </div>
                <div className="button-row">
                  <button
                    className="btn smallbtn"
                    onClick={() => go("cards", "freq" + n)}
                  >
                    Study →
                  </button>
                  <button
                    className="btn secondary smallbtn"
                    onClick={() => go("quiz", "freq" + n)}
                  >
                    Test ↗
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="row library-meta">
        <span className="small muted">{list.length} words & phrases</span>
        <button
          className="btn secondary smallbtn"
          onClick={() =>
            go("cards", "custom:" + list.map((w) => w.id).join(","))
          }
        >
          Study this collection →
        </button>
      </div>
      {sentences ? (
        <div className="sentence-list">
          {list.map((w) => (
            <article className="panel sentence-item" key={w.id}>
              <div className="sentence-item-head">
                <span className="sentence-context">
                  {w.scene ||
                    w.experiences.filter((x) => x !== "family").join(" · ") ||
                    "Everyday"}
                </span>
                <span className="sentence-register">
                  {w.tone === "polite" ? "Respectful · aap" : "Casual · tum"}
                </span>
              </div>
              <h3>{w.en}</h3>
              <div className="sentence-hi" lang="hi">
                {w.hi}
              </div>
              <p className="sentence-ro">{w.ro}</p>
              <div className="sentence-item-bottom">
                <p>{w.note}</p>
                <button
                  className="btn secondary smallbtn"
                  onClick={() => speak(w)}
                  aria-label={"Listen to " + w.en}
                >
                  ♫ Listen
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="vocab">
            <thead>
              <tr>
                <th>English</th>
                <th>हिन्दी / Roman Hindi</th>
                <th>Notes</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id}>
                  <td>
                    <b>{w.en}</b>
                    <small>
                      {w.cat}
                      {genders[w.id]
                        ? " · " +
                          (genders[w.id] === "f" ? "Feminine" : "Masculine")
                        : ""}
                    </small>
                  </td>
                  <td>
                    <span className="native" lang="hi">
                      {w.hi}
                    </span>
                    <small>{w.ro}</small>
                    <button
                      className="listen-btn"
                      onClick={() => speak(w)}
                      aria-label={"Listen to " + w.en}
                    >
                      ♫
                    </button>
                  </td>
                  <td>{w.note}</td>
                  <td>
                    {p.cards[w.id]?.level >= 3
                      ? "Mastered"
                      : p.cards[w.id]
                        ? "Practicing"
                        : "New"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!list.length && <p className="empty">No matches. Try another search.</p>}
    </>
  );
}
function Grammar({ p, dispatch }) {
  const [mode, setMode] = useState("verbs"),
    [test, setTest] = useState(false),
    [verb, setVerb] = useState("toeat"),
    [tense, setTense] = useState("habitual"),
    [q, setQ] = useState(""),
    [noun, setNoun] = useState(null);
  const verbWords = active(p).filter(
      (w) =>
        verbs[w.id] && clean(w.en + " " + w.hi + " " + w.ro).includes(clean(q)),
    ),
    nounWords = active(p).filter(
      (w) =>
        w.cat === "Nouns" &&
        genders[w.id] &&
        clean(w.en + " " + w.hi + " " + w.ro).includes(clean(q)),
    );
  const v = verbs[verb];
  return (
    <>
      <div className="headline">
        <div className="eyebrow">PATTERNS THAT MAKE IT CLICK</div>
        <h1>Your grammar lab.</h1>
        <p>Explore verb forms, noun genders, and how words fit together.</p>
      </div>
      <div className="toolbar">
        <div className="tabs">
          {["verbs", "nouns"].map((m) => (
            <button
              className={"tab " + (mode === m ? "active" : "")}
              key={m}
              onClick={() => {
                setMode(m);
                setTest(false);
                setQ("");
              }}
            >
              {m === "verbs" ? "Verb conjugation" : "Noun gender"}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setTest(!test)}>
          {test ? "Back to reference" : "Practice " + mode + " →"}
        </button>
      </div>
      {test ? (
        <Quiz key={mode} p={p} dispatch={dispatch} grammarMode={mode} />
      ) : (
        <>
          <input
            className="input grammar-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={"Search " + mode + "…"}
            aria-label={"Search " + mode}
          />
          {mode === "verbs" ? (
            <>
              <div className="setup-grid">
                <Select
                  label="Verb"
                  value={verb}
                  onChange={setVerb}
                  items={verbWords.map((w) => [w.id, w.en + " · " + w.hi])}
                />
                <Select
                  label="Tense"
                  value={tense}
                  onChange={setTense}
                  items={tenses.map((t) => [t[0], t[1]])}
                />
              </div>
              <p className="notice">
                {tenses.find((t) => t[0] === tense)?.[2]}
              </p>
              {v.kind === "exp" && (
                <p className="notice">
                  मुझे चाय पसंद है — mujhe chai pasand hai. Use the dative
                  experiencer (mujhe / tumhen / aapko). Hona agrees with the
                  thing liked: चाय पसंद है, किताबें पसंद हैं. Past: पसंद थी; future: पसंद
                  होगी; liked it: पसंद आई.
                </p>
              )}
              {tense === "imperative" && v.kind !== "exp" ? (
                <div className="panel grammar-forms">
                  <h2>Commands & requests</h2>
                  {[
                    ["तू · direct", v.imp0, v.impr0],
                    ["तुम · familiar", v.imp1, v.impr1],
                    ["आप · respectful", v.imp2, v.impr2],
                  ].map(([label, hi, ro]) => (
                    <div className="form-row" key={label}>
                      <b>{label}</b>
                      <div lang="hi">{hi || v.stem}</div>
                      <small>{ro || v.roman}</small>
                    </div>
                  ))}
                  <p className="small">
                    Tu is very intimate; tum is familiar, and aap is respectful.
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="vocab">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>
                          {[
                            "perfective",
                            "presentPerfect",
                            "pastPerfect",
                          ].includes(tense) && v.kind !== "intr"
                            ? "Masculine object"
                            : "Masculine speaker"}
                        </th>
                        <th>
                          {[
                            "perfective",
                            "presentPerfect",
                            "pastPerfect",
                          ].includes(tense) && v.kind !== "intr"
                            ? "Feminine object"
                            : "Feminine speaker"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pronouns.map((pr) => (
                        <tr key={pr.hi}>
                          <td>
                            {pr.hi}
                            <small>{pr.ro}</small>
                          </td>
                          {["m", "f"].map((sex) => {
                            const f =
                              v.kind === "exp"
                                ? {
                                    hi: pr.dativeHi + " चाय पसंद है",
                                    ro: pr.dativeRo + " chai pasand hai",
                                  }
                                : variant(v, pr, sex, tense);
                            return (
                              <td key={sex}>
                                <span className="native" lang="hi">
                                  {f.hi}
                                </span>
                                <small>{f.ro}</small>
                                <button
                                  className="listen-btn"
                                  onClick={() => speak(f)}
                                  aria-label={"Listen to " + f.ro}
                                >
                                  ♫
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="notice">
                मेरा / मेरी agrees with the noun being owned, not with the person
                who owns it.
              </p>
              <div className="table-wrap">
                <table className="vocab">
                  <thead>
                    <tr>
                      <th>Noun</th>
                      <th>Gender</th>
                      <th>Direct plural</th>
                      <th>Oblique plural</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nounWords.map((w) => (
                      <tr key={w.id} onClick={() => setNoun(w)}>
                        <td>
                          <button
                            className="noun-link"
                            onClick={() => setNoun(w)}
                          >
                            {w.en}
                          </button>
                          <span className="native">{w.hi}</span>
                          <small>{w.ro}</small>
                        </td>
                        <td>
                          {genders[w.id] === "f"
                            ? "♀ Feminine"
                            : genders[w.id] === "m"
                              ? "♂ Masculine"
                              : "Common gender"}
                        </td>
                        <td>
                          {plurals[w.id]?.[0] || "—"}
                          <small>{plurals[w.id]?.[1]}</small>
                        </td>
                        <td>
                          {plurals[w.id]?.[2] || "—"}
                          <small>{plurals[w.id]?.[3]}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {noun && (
                <div className="noun-detail panel">
                  <button
                    className="btn secondary"
                    onClick={() => setNoun(null)}
                  >
                    Close ✕
                  </button>
                  <h2>
                    {noun.en} · {noun.hi}
                  </h2>
                  <p>{noun.note}</p>
                  <div className="native">
                    {genders[noun.id] === "f" ? "मेरी" : "मेरा"} {noun.hi}
                  </div>
                  <p>
                    {genders[noun.id] === "f" ? "meri" : "mera"} {noun.ro}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
const speeds = {
  easy: { speed: 58, spawn: 3150 },
  normal: { speed: 82, spawn: 2550 },
  hard: { speed: 111, spawn: 1970 },
  expert: { speed: 143, spawn: 1550 },
};
function Arcade({ p, dispatch }) {
  const [settings, setSettings] = useState(p.arcade.settings),
    [selected, setSelected] = useState(p.arcade.selectedIds),
    [search, setSearch] = useState(""),
    [view, setView] = useState("setup"),
    [frame, setFrame] = useState(null),
    [input, setInput] = useState(""),
    [feedback, setFeedback] = useState(""),
    [result, setResult] = useState(null);
  const game = useRef(null),
    stage = useRef(null),
    entry = useRef(null),
    raf = useRef(0),
    last = useRef(0),
    dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const source =
    settings.source === "experience"
      ? "all"
      : settings.source === "core"
        ? "coreall"
        : settings.source;
  const available = (
    settings.source === "selected" ? pick(selected) : poolFor(source, p)
  ).filter((w) => settings.category === "all" || w.cat === settings.category);
  const preview = available
    .filter((w) =>
      clean(w.en + " " + w.hi + " " + w.ro).includes(clean(search)),
    )
    .slice(0, 100);
  useEffect(() => {
    document.body.classList.toggle(
      "rush-playing",
      view === "game" || view === "paused",
    );
    return () => document.body.classList.remove("rush-playing");
  }, [view]);
  const saveSettings = (v) => {
    const next = { ...settings, ...v };
    setSettings(next);
    dispatch("settings", { arcade: { settings: next } });
  };
  const finish = useCallback((reason) => {
    const g = game.current;
    if (!g || g.status === "finished") return;
    g.status = "finished";
    cancelAnimationFrame(raf.current);
    const r = {
      score: g.score,
      hits: g.hits,
      misses: g.misses,
      accuracy:
        g.hits + g.misses
          ? Math.round((g.hits / (g.hits + g.misses)) * 100)
          : 0,
      difficulty: g.settings.difficulty,
      source: g.settings.source,
      category: g.settings.category,
      level: g.level,
      duration: Math.round(g.elapsed / 1000),
      endedBy: reason,
    };
    dispatchRef.current("arcade", r);
    setResult(r);
    setView("result");
  }, []);
  const pause = useCallback(() => {
    const g = game.current;
    if (g?.status === "running") {
      g.status = "paused";
      cancelAnimationFrame(raf.current);
      setView("paused");
    }
  }, []);
  const tick = useCallback(
    (ts) => {
      const g = game.current;
      if (!g || g.status !== "running") return;
      const dt = last.current ? Math.min(60, ts - last.current) : 0;
      last.current = ts;
      g.elapsed += dt;
      g.spawnIn -= dt;
      if (g.spawnIn <= 0) {
        const w = g.pool[Math.floor(Math.random() * g.pool.length)];
        g.active.push({
          id: crypto.randomUUID(),
          w,
          x: -20,
          lane: Math.floor(Math.random() * 4),
        });
        g.spawnIn = Math.max(
          700,
          speeds[g.settings.difficulty].spawn / (1 + (g.level - 1) * 0.1),
        );
      }
      const width = stage.current?.clientWidth || 600;
      for (const a of g.active)
        a.x +=
          (dt / 1000) *
          speeds[g.settings.difficulty].speed *
          (0.8 + g.level * 0.08) *
          Math.max(0.48, Math.min(1.15, width / 850));
      for (const a of g.active.filter((a) => a.x > width - 90)) {
        g.misses++;
        g.combo = 0;
        g.lives--;
        dispatchRef.current("answer", {
          id: a.w.id,
          score: 0,
          experience: g.experience,
        });
        setFeedback("Missed: " + a.w.en);
      }
      g.active = g.active.filter((a) => a.x <= width - 90);
      if (g.lives <= 0) {
        finish("Game over");
        return;
      }
      setFrame({ ...g, active: [...g.active] });
      raf.current = requestAnimationFrame(tick);
    },
    [finish],
  );
  const resume = () => {
    if (!game.current) return;
    game.current.status = "running";
    last.current = 0;
    setView("game");
    raf.current = requestAnimationFrame(tick);
    setTimeout(() => entry.current?.focus(), 50);
  };
  const start = () => {
    if (!available.length)
      return alert("Choose a source with words, or select some vocabulary.");
    game.current = {
      status: "running",
      settings: { ...settings },
      experience: p.experience,
      pool: available,
      active: [],
      score: 0,
      hits: 0,
      misses: 0,
      lives: 5,
      combo: 0,
      level: 1,
      elapsed: 0,
      spawnIn: 0,
    };
    setInput("");
    setFeedback("Type the English meaning, then press Enter.");
    setFrame({ ...game.current });
    setView("game");
    last.current = 0;
    raf.current = requestAnimationFrame(tick);
    setTimeout(() => entry.current?.focus(), 50);
  };
  useEffect(() => {
    const hide = () => {
        if (document.hidden) pause();
      },
      key = (e) => {
        if (e.key === "Escape") pause();
      };
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("keydown", key);
      if (
        game.current?.status === "running" ||
        game.current?.status === "paused"
      )
        finish("Left arcade");
    };
  }, [pause, finish]);
  const shoot = (e) => {
    e.preventDefault();
    const g = game.current;
    if (g?.status !== "running" || !input.trim()) return;
    const hit = [...g.active]
      .sort((a, b) => b.x - a.x)
      .find((a) => arcadeMatches(input, a.w));
    if (hit) {
      g.hits++;
      g.combo++;
      g.score += 100 + Math.min(10, g.combo) * 10;
      g.level = 1 + Math.floor(g.hits / 8);
      g.active = g.active.filter((a) => a.id !== hit.id);
      dispatch("answer", { id: hit.w.id, score: 2, experience: p.experience });
      setFeedback("✓ " + hit.w.en + " · " + hit.w.ro);
    } else {
      g.combo = 0;
      setFeedback("No match yet — try another meaning.");
    }
    setInput("");
  };
  return (
    <>
      <div className="headline">
        <div className="eyebrow">RECALL AT FULL SPEED</div>
        <h1>
          Hindi Rush<span className="rush-dot">⚡</span>
        </h1>
        <p>Read the Hindi. Type the English. Keep your streak alive.</p>
      </div>
      {view === "setup" ? (
        <>
          <div className="arcade-banner">
            <div>
              <small>YOUR VOCABULARY. A NEW CHALLENGE.</small>
              <h2>Let the words come to you.</h2>
              <p>
                Five lives. Four difficulty levels. A fresh way to practice.
              </p>
            </div>
            <span aria-hidden="true">अ आ इ</span>
          </div>
          <div className="panel arcade-settings">
            <div className="setup-grid">
              <Select
                label="Word source"
                value={settings.source}
                onChange={(v) => saveSettings({ source: v })}
                items={[
                  ["experience", "This experience"],
                  ["everything", "Entire curriculum"],
                  ["freqall", "Top 500"],
                  ...[1, 2, 3, 4, 5].map((n) => [
                    "freq" + n,
                    `Top 500 · Level ${n}`,
                  ]),
                  ["core", "Everyday essentials"],
                  ["sentences", "Useful sentences"],
                  ["due", "Due reviews"],
                  ["weak", "Weak words"],
                  ["selected", "Hand-picked words"],
                ]}
              />
              <Select
                label="Difficulty"
                value={settings.difficulty}
                onChange={(v) => saveSettings({ difficulty: v })}
                items={Object.keys(speeds).map((s) => [
                  s,
                  s[0].toUpperCase() + s.slice(1),
                ])}
              />
              <Select
                label="Category"
                value={settings.category}
                onChange={(v) => saveSettings({ category: v })}
                items={[
                  ["all", "All categories"],
                  ...["Basics", "Nouns", "Verbs", "Adjectives", "Phrases"].map(
                    (x) => [x, x],
                  ),
                ]}
              />
              <Select
                label="Roman Hindi hints"
                value={settings.roman}
                onChange={(v) => saveSettings({ roman: v })}
                items={[
                  ["off", "Off · Read Hindi"],
                  ["on", "On · Show pronunciation"],
                ]}
              />
            </div>
            <div className="row">
              <span className="small muted">
                {available.length} words ready
              </span>
              <button className="btn" onClick={start}>
                Start Hindi Rush ⚡
              </button>
            </div>
          </div>
          <div className="section-head">
            <h2>Make it your own.</h2>
            <span className="small muted">{selected.length} selected</span>
          </div>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find words to hand-pick…"
            aria-label="Search arcade words"
          />
          <div className="button-row">
            <button
              className="btn secondary smallbtn"
              onClick={() => {
                const ids = [
                  ...new Set([...selected, ...preview.map((w) => w.id)]),
                ];
                setSelected(ids);
                dispatch("settings", { arcade: { selectedIds: ids } });
              }}
            >
              Select visible
            </button>
            <button
              className="btn secondary smallbtn"
              onClick={() => {
                setSelected([]);
                dispatch("settings", { arcade: { selectedIds: [] } });
              }}
            >
              Clear selection
            </button>
            <button
              className="btn secondary smallbtn"
              onClick={() => saveSettings({ source: "selected" })}
            >
              Use hand-picked
            </button>
          </div>
          <div className="word-picker">
            {preview.map((w) => (
              <button
                className={"word-pick " + (selected.includes(w.id) ? "on" : "")}
                key={w.id}
                onClick={() => {
                  const ids = selected.includes(w.id)
                    ? selected.filter((id) => id !== w.id)
                    : [...selected, w.id];
                  setSelected(ids);
                  dispatch("settings", { arcade: { selectedIds: ids } });
                }}
                aria-pressed={selected.includes(w.id)}
              >
                <span>{selected.includes(w.id) ? "☑" : "□"}</span>
                <b>
                  {w.en}
                  <small lang="hi">{w.hi}</small>
                </b>
              </button>
            ))}
          </div>
        </>
      ) : view === "result" ? (
        <div className="panel rush-result">
          <div className="eyebrow">RUN SAVED · {result.endedBy}</div>
          <h1>Nice run!</h1>
          <div className="rush-total">
            {result.score.toLocaleString()}
            <small>POINTS</small>
          </div>
          <div className="metrics">
            <Metric label="Cleared" value={result.hits} />
            <Metric label="Missed" value={result.misses} />
            <Metric label="Accuracy" value={result.accuracy + "%"} />
            <Metric label="Level" value={result.level} />
          </div>
          <div className="button-row">
            <button className="btn" onClick={start}>
              Play again ⚡
            </button>
            <button className="btn secondary" onClick={() => setView("setup")}>
              Change settings
            </button>
          </div>
        </div>
      ) : (
        <div className="rush-game">
          <div className="rush-hud">
            <div>
              <small>SCORE</small>
              <b>{frame?.score || 0}</b>
            </div>
            <div>
              <small>LIVES</small>
              <b>{"♥".repeat(Math.max(0, frame?.lives || 0))}</b>
            </div>
            <div>
              <small>LEVEL / COMBO</small>
              <b>
                {frame?.level} / {frame?.combo}
              </b>
            </div>
            <button className="btn secondary smallbtn" onClick={pause}>
              Pause
            </button>
          </div>
          <div className="rush-stage" ref={stage}>
            {[0, 1, 2, 3].map((n) => (
              <div
                className="rush-lane"
                key={n}
                style={{ top: n * 25 + "%" }}
              />
            ))}
            {frame?.active.map((a) => (
              <div
                className="falling-word"
                key={a.id}
                style={{ left: a.x, top: a.lane * 23 + 3 + "%" }}
              >
                <span lang="hi">{a.w.hi}</span>
                {settings.roman === "on" && <small>{a.w.ro}</small>}
              </div>
            ))}
            <div className="rush-danger" />
            {view === "paused" && (
              <div className="rush-overlay">
                <h2>Take a breath.</h2>
                <p>The words can wait.</p>
                <button className="btn" onClick={resume}>
                  Resume →
                </button>
                <button
                  className="btn secondary"
                  onClick={() => finish("Quit")}
                >
                  Finish & save
                </button>
              </div>
            )}
          </div>
          <form className="rush-entry" onSubmit={shoot}>
            <input
              ref={entry}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={view === "paused"}
              placeholder="English meaning…"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              aria-label="Type English meaning"
            />
            <button className="btn" disabled={view === "paused"}>
              Clear ↗
            </button>
          </form>
          <div className="rush-feedback" role="status">
            {feedback}
          </div>
          <button className="link-btn" onClick={() => finish("Quit")}>
            Finish & save run
          </button>
        </div>
      )}
    </>
  );
}
function Scoreboard() {
  const [rows, setRows] = useState(null),
    [error, setError] = useState(""),
    [difficulty, setDifficulty] = useState("all"),
    [source, setSource] = useState("all");
  useEffect(() => {
    let live = true;
    const load = () =>
      api("scoreboard")
        .then((r) => {
          if (live) {
            setRows(r);
            setError("");
          }
        })
        .catch((e) => live && setError(e.message));
    load();
    const timer = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const metrics = [
    ["Words practiced", "studied"],
    ["Words mastered", "mastered"],
    ["Flashcard reviews", "reviews"],
    ["Completed tests", "tests"],
    ["Test accuracy", "accuracy"],
    ["Active days", "activeDays"],
    ["Current streak", "streak"],
  ];
  const runs = rows
    ?.flatMap((r) => r.arcade.map((s) => ({ ...s, name: r.name })))
    .filter(
      (s) =>
        (difficulty === "all" || s.difficulty === difficulty) &&
        (source === "all" || s.source === source),
    )
    .sort((a, b) => b.score - a.score);
  return (
    <>
      <div className="headline">
        <div className="eyebrow">A LITTLE FRIENDLY COMPETITION</div>
        <h1>Better, together.</h1>
        <p>
          Alex and Andrew’s shared scoreboard. Updates every five seconds across
          devices.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {!rows ? (
        <p>Loading scoreboard…</p>
      ) : (
        <>
          <div className="compare-head">
            <span>YOUR LEARNING</span>
            {rows.map((r, i) => (
              <div key={r.name}>
                <span className={"person p" + i}>{r.name[0]}</span>
                <h2>{r.name}</h2>
              </div>
            ))}
          </div>
          <div className="panel compare-table">
            {metrics.map(([title, key]) => (
              <div className="compare-row" key={key}>
                <span>{title}</span>
                {rows.map((r) => (
                  <b
                    key={r.name}
                    className={
                      r[key] !== null &&
                      r[key] > Math.min(...rows.map((x) => x[key] ?? 0))
                        ? "leading"
                        : ""
                    }
                  >
                    {r[key] ?? "—"}
                    {key === "accuracy" && r[key] !== null ? "%" : ""}
                  </b>
                ))}
              </div>
            ))}
          </div>
          <div className="section-head">
            <h2>Hindi Rush leaderboard</h2>
          </div>
          <div className="setup-grid">
            <Select
              label="Difficulty"
              value={difficulty}
              onChange={setDifficulty}
              items={[
                ["all", "All difficulties"],
                ...Object.keys(speeds).map((k) => [k, k]),
              ]}
            />
            <Select
              label="Word source"
              value={source}
              onChange={setSource}
              items={[
                ["all", "All sources"],
                ...[
                  ...new Set(
                    rows.flatMap((r) => r.arcade.map((s) => s.source)),
                  ),
                ].map((k) => [k, k]),
              ]}
            />
          </div>
          <p className="small muted">
            Compare the same difficulty and source for a closer match.
            Hand-picked decks can vary.
          </p>
          <div className="score-duel">
            {rows.map((r, i) => {
              const rr = r.arcade.filter(
                (s) =>
                  (difficulty === "all" || s.difficulty === difficulty) &&
                  (source === "all" || s.source === source),
              );
              return (
                <div className="panel duel-card" key={r.name}>
                  <span className={"person p" + i}>{r.name[0]}</span>
                  <h3>{r.name}</h3>
                  <strong>
                    {Math.max(0, ...rr.map((s) => s.score)).toLocaleString()}
                  </strong>
                  <p>best score · {rr.length} runs</p>
                </div>
              );
            })}
          </div>
          <div className="session-list">
            {runs.slice(0, 20).map((r, i) => (
              <div className="session" key={r.name + "-" + r.date + "-" + i}>
                <div>
                  <b>
                    #{i + 1} · {r.name}
                  </b>
                  <small>
                    {r.difficulty} · {r.source} ·{" "}
                    {new Date(r.date).toLocaleDateString()} · {r.hits} cleared
                  </small>
                </div>
                <strong>{r.score.toLocaleString()} pts</strong>
              </div>
            ))}
            {!runs.length && (
              <p className="empty">Your first run starts the leaderboard.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
function Progress({ p, dispatch, name, pending }) {
  const stats = summary(p),
    [period, setPeriod] = useState("all"),
    [scope, setScope] = useState("all"),
    [mode, setMode] = useState("all");
  const input = useRef(null);
  const history = [...p.tests, ...p.grammarRounds]
    .filter(
      (t) =>
        (period === "all" || t.date > Date.now() - Number(period) * 86400000) &&
        (scope === "all" || t.experience === p.experience) &&
        (mode === "all" ||
          (mode === "grammar"
            ? String(t.type).startsWith("grammar")
            : !String(t.type).startsWith("grammar"))),
    )
    .sort((a, b) => a.date - b.date);
  const exportFile = () => {
    const blob = new Blob(
        [
          JSON.stringify(
            {
              app: "ghar",
              version: 2,
              exportedAt: new Date().toISOString(),
              progress: p,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ghar-" + name.toLowerCase() + "-progress.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const next = normalize(data.progress || data);
      if (
        !confirm(
          `Replace ${name}’s shared progress with this file? A backup will be kept in this browser.`,
        )
      )
        return;
      localStorage.setItem("ghar-backup-" + name, JSON.stringify(p));
      dispatch("replace", next);
    } catch (e) {
      alert(e.message);
    }
  };
  const due = words.filter(
    (w) => schedule(p.cards[w.id], p)?.due <= Date.now(),
  ).length;
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const from = Date.now() + i * 86400000;
    return words.filter((w) => {
      const d = schedule(p.cards[w.id], p)?.due;
      return d >= from && d < from + 86400000;
    }).length;
  });
  return (
    <>
      <div className="headline">
        <div className="eyebrow">SMALL STEPS ADD UP</div>
        <h1>Look how far you’ve come.</h1>
        <p>{name}’s learning history, review schedule, and arcade results.</p>
      </div>
      <div className="metrics">
        <Metric label="Words practiced" value={stats.studied} />
        <Metric label="Words mastered" value={stats.mastered} />
        <Metric
          label="Test accuracy"
          value={stats.accuracy === null ? "—" : stats.accuracy + "%"}
        />
        <Metric label="Due now" value={due} />
      </div>
      <Scheduler p={p} dispatch={dispatch} />
      <section className="panel analytics-panel">
        <h2>The week ahead</h2>
        <div className="forecast">
          {forecast.map((n, i) => (
            <div key={i}>
              <strong>{n}</strong>
              <div
                style={{
                  height: Math.max(3, (n / Math.max(1, ...forecast)) * 80),
                }}
              />
              <small>
                {new Date(Date.now() + i * 86400000).toLocaleDateString(
                  undefined,
                  { weekday: "short" },
                )}
              </small>
            </div>
          ))}
        </div>
      </section>
      <section className="panel analytics-panel">
        <h2>Your test performance</h2>
        <div className="analytics-filters">
          <Select
            label="Period"
            value={period}
            onChange={setPeriod}
            items={[
              ["all", "All time"],
              ["7", "Last 7 days"],
              ["30", "Last 30 days"],
            ]}
          />
          <Select
            label="Scope"
            value={scope}
            onChange={setScope}
            items={[
              ["all", "All worlds"],
              ["current", "This world"],
            ]}
          />
          <Select
            label="Mode"
            value={mode}
            onChange={setMode}
            items={[
              ["all", "All tests"],
              ["vocab", "Vocabulary"],
              ["grammar", "Grammar"],
            ]}
          />
        </div>
        {history.length ? (
          <>
            <svg
              className="react-chart"
              viewBox="0 0 700 220"
              role="img"
              aria-label="Test accuracy over time"
            >
              <line x1="25" y1="195" x2="685" y2="195" stroke="#ddd7ca" />
              {[0, 50, 100].map((n) => (
                <text
                  key={n}
                  x="0"
                  y={195 - n * 1.7}
                  fill="#7c817b"
                  fontSize="12"
                >
                  {n}
                </text>
              ))}
              <polyline
                fill="none"
                stroke="var(--brand)"
                strokeWidth="3"
                points={history
                  .slice(-30)
                  .map(
                    (t, i, a) =>
                      `${35 + (i / Math.max(1, a.length - 1)) * 640},${195 - (t.points / (t.total * 2)) * 170}`,
                  )
                  .join(" ")}
              />
              {history.slice(-30).map((t, i, a) => (
                <circle
                  key={i}
                  cx={35 + (i / Math.max(1, a.length - 1)) * 640}
                  cy={195 - (t.points / (t.total * 2)) * 170}
                  r="4"
                  fill="var(--brand)"
                >
                  <title>
                    {new Date(t.date).toLocaleDateString()}:{" "}
                    {Math.round((t.points / (t.total * 2)) * 100)}%
                  </title>
                </circle>
              ))}
            </svg>
            <div className="session-list">
              {history
                .slice(-8)
                .reverse()
                .map((t, i) => (
                  <div className="session" key={i}>
                    <div>
                      <b>{t.type}</b>
                      <small>
                        {new Date(t.date).toLocaleDateString()} · {t.total}{" "}
                        questions · {t.experience}
                      </small>
                    </div>
                    <strong>
                      {Math.round((t.points / (t.total * 2)) * 100)}%
                    </strong>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <p className="empty">Complete your first test to start your graph.</p>
        )}
      </section>
      <section className="panel analytics-panel">
        <h2>Words that need a little love</h2>
        {Object.entries(p.cards)
          .filter(([id, c]) => byId.has(id) && c.quizAttempts > 0)
          .sort(
            (a, b) =>
              a[1].quizEarned / a[1].quizPossible -
              b[1].quizEarned / b[1].quizPossible,
          )
          .slice(0, 6)
          .map(([id, c]) => (
            <div className="row weak-row" key={id}>
              <span>
                {byId.get(id).en} · <span lang="hi">{byId.get(id).hi}</span>
              </span>
              <b>{Math.round((c.quizEarned / c.quizPossible) * 100)}%</b>
            </div>
          ))}
      </section>
      <section className="panel analytics-panel">
        <h2>Your arcade history</h2>
        <div className="metrics">
          <Metric label="Runs played" value={stats.arcadeRuns} />
          <Metric label="Personal best" value={stats.arcadeBest} />
        </div>
        <div className="session-list">
          {p.arcade.sessions
            .slice(-8)
            .reverse()
            .map((r, i) => (
              <div className="session" key={i}>
                <div>
                  <b>
                    {r.difficulty} · {r.source}
                  </b>
                  <small>
                    {new Date(r.date).toLocaleDateString()} · {r.hits} cleared ·{" "}
                    {r.accuracy}% accuracy
                  </small>
                </div>
                <strong>{r.score} pts</strong>
              </div>
            ))}
        </div>
      </section>
      <section className="panel analytics-panel">
        <h2>Your progress, to keep.</h2>
        <p className="small">
          Export a copy or import your original Ghar JSON. Imports and resets
          apply to {name} across all devices.
        </p>
        <div className="button-row">
          <button className="btn secondary" onClick={exportFile}>
            Export JSON ↓
          </button>
          <button
            className="btn secondary"
            disabled={pending > 0}
            onClick={() => input.current.click()}
          >
            Import JSON ↑
          </button>
          <button
            className="btn secondary"
            disabled={pending > 0}
            onClick={() => {
              const backup = localStorage.getItem("ghar-backup-" + name);
              if (!backup) return alert("No import backup in this browser.");
              if (confirm("Restore the backup for " + name + "?")) {
                const old = JSON.stringify(p);
                dispatch("replace", normalize(JSON.parse(backup)));
                localStorage.setItem("ghar-backup-" + name, old);
              }
            }}
          >
            Restore import backup
          </button>
          <button
            className="btn danger"
            disabled={pending > 0}
            onClick={() => {
              if (
                confirm(
                  "Reset all of " +
                    name +
                    "’s shared progress? Export a backup first.",
                )
              )
                dispatch("reset", {});
            }}
          >
            Reset progress
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={importFile}
          />
        </div>
      </section>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
