import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
test("API isolates users, merges devices, deduplicates retries and survives restart", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ghar-test-"));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ["server/index.js"], {
      env: { ...process.env, DATA_DIR: dir, PORT: "3198" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      child.stdout.on("data", (d) => {
        if (String(d).includes("ready")) resolve();
      });
      child.on("error", reject);
      child.on("exit", (code) => reject(Error("server exited " + code)));
    });
    base = "http://127.0.0.1:3198/api/";
  }
  async function stop() {
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  }
  const get = (p) => fetch(base + p).then((r) => r.json());
  const post = (name, a) =>
    fetch(base + "users/" + name + "/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(a),
    });
  try {
    await start();
    let a = {
      id: "device-one",
      type: "review",
      payload: { id: "mother", rate: "good" },
    };
    assert.equal((await post("Alex", a)).status, 200);
    await post("Alex", a);
    await Promise.all([
      post("Alex", {
        ...a,
        id: "device-two",
        payload: { id: "father", rate: "easy" },
      }),
      post("Andrew", { ...a, id: "andrew-one" }),
    ]);
    assert.equal((await get("users/Alex")).version, 2);
    assert.equal((await get("users/Andrew")).version, 1);
    const scoreboard = await get("scoreboard");
    assert.equal(scoreboard[0].studied, 2);
    assert.equal(scoreboard[1].studied, 1);
    assert.equal(
      (await post("Alex", { id: "conflict", type: "reset", baseVersion: 0 }))
        .status,
      409,
    );
    assert.equal((await fetch(base + "users/Someone")).status, 404);
    await stop();
    await start();
    assert.equal((await get("users/Alex")).progress.cards.father.reviews, 1);
    assert.equal((await get("users/Andrew")).progress.cards.mother.reviews, 1);
  } finally {
    if (child?.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
