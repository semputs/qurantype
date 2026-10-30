import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADJECTIVES, COLOURS, NOUNS } from "../js/words.js";

const PORT = 18787;
const base = `http://127.0.0.1:${PORT}/api/sync`;
let server, dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "qurantype-sync-"));
  server = spawn(process.execPath, ["server/sync.js"], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve) => server.stdout.once("data", resolve));
});

after(async () => {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
});

const call = async (method, path = "", body) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};

test("word lists have no repeats", () => {
  for (const list of [ADJECTIVES, COLOURS, NOUNS]) assert.equal(new Set(list).size, list.length);
});

test("a new code is three words and returns what was saved", async () => {
  const created = await call("POST", "", { state: { surah: 2, savedAt: 1000 } });
  assert.equal(created.status, 201);
  const [a, c, n] = created.data.code.split("-");
  assert.ok(ADJECTIVES.includes(a) && COLOURS.includes(c) && NOUNS.includes(n));
  const got = await call("GET", `/${created.data.code}`);
  assert.deepEqual(got.data, { state: { surah: 2, savedAt: 1000 }, savedAt: 1000 });
});

test("the newest save wins", async () => {
  const { data } = await call("POST", "", { state: { surah: 1, savedAt: 1000 } });
  const path = `/${data.code}`;
  assert.equal((await call("PUT", path, { state: { surah: 3 }, savedAt: 2000 })).status, 200);
  const stale = await call("PUT", path, { state: { surah: 1 }, savedAt: 1500 });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.state.surah, 3);
  assert.equal((await call("GET", path)).data.state.surah, 3);
});

test("unknown and malformed codes are not found", async () => {
  assert.equal((await call("GET", `/${ADJECTIVES[0]}-${COLOURS[0]}-${NOUNS[0]}`)).status, 404);
  assert.equal((await call("GET", "/not-a-code")).status, 404);
  assert.equal((await call("PUT", "/../../etc/passwd", { state: {} })).status, 404);
});
