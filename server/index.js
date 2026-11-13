import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USERS, initial, reduce, summary } from "../shared/progress.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.DATA_DIR || path.join(root, "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "ghar.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS profiles (name TEXT PRIMARY KEY, progress TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, name TEXT NOT NULL);",
);
for (const name of USERS)
  db.prepare("INSERT OR IGNORE INTO profiles (name,progress) VALUES (?,?)").run(
    name,
    JSON.stringify(initial()),
  );
const get = (name) => {
  const r = db.prepare("SELECT * FROM profiles WHERE name=?").get(name);
  return { progress: JSON.parse(r.progress), version: r.version };
};
const app = express();
app.use(express.json({ limit: "12mb" }));
app.use("/api", (_, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (_, res) => res.json({ ok: true }));
app.get("/api/scoreboard", (_, res) =>
  res.json(
    USERS.map((name) => ({
      name,
      ...summary(get(name).progress),
      arcade: get(name).progress.arcade.sessions,
    })),
  ),
);
app.param("name", (req, res, next, name) =>
  USERS.includes(name)
    ? next()
    : res.status(404).json({ error: "Choose Alex or Andrew." }),
);
app.get("/api/users/:name", (req, res) => res.json(get(req.params.name)));
app.post("/api/users/:name/actions", (req, res) => {
  const name = req.params.name,
    a = req.body;
  if (
    !a ||
    typeof a.id !== "string" ||
    a.id.length > 100 ||
    ![
      "review",
      "answer",
      "test",
      "arcade",
      "settings",
      "replace",
      "reset",
    ].includes(a.type)
  )
    return res.status(400).json({ error: "Invalid action." });
  try {
    db.exec("BEGIN IMMEDIATE");
    const old = get(name);
    const exists = db.prepare("SELECT name FROM actions WHERE id=?").get(a.id);
    if (exists) {
      if (exists.name !== name) throw Error("Action belongs to another user");
      db.exec("COMMIT");
      return res.json(old);
    }
    if (
      ["replace", "reset"].includes(a.type) &&
      a.baseVersion !== old.version
    ) {
      db.exec("ROLLBACK");
      return res
        .status(409)
        .json({
          error: "Progress changed on another device. Refresh and try again.",
        });
    }
    if (
      a.type === "review" &&
      !["again", "hard", "good", "easy"].includes(a.payload?.rate)
    )
      throw Error("Invalid rating");
    if (a.type === "answer" && ![0, 1, 2].includes(a.payload?.score))
      throw Error("Invalid score");
    const progress = reduce(old.progress, a);
    db.prepare(
      "UPDATE profiles SET progress=?, version=version+1 WHERE name=?",
    ).run(JSON.stringify(progress), name);
    db.prepare("INSERT INTO actions VALUES (?,?)").run(a.id, name);
    db.exec("COMMIT");
    res.json(get(name));
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    res.status(400).json({ error: e.message });
  }
});
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
}
app.use((err, req, res, next) =>
  res.status(err.status || 500).json({ error: err.message }),
);
const server = app.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
  console.log("Ghar is ready at http://localhost:" + server.address().port),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
