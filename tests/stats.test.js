import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayOf, refHost } from "../server/stats.js";

const PORT = 18788;
const base = `http://127.0.0.1:${PORT}/api`;
let server, dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "qurantype-stats-"));
  await writeFile(join(dataDir, "password"), "sama macam galtype\n");
  server = spawn(process.execPath, ["server/sync.js"], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, PENTADBIR_PASSWORD_FILE: join(dataDir, "password") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve) => server.stdout.once("data", resolve));
});

after(async () => {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
});

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const as = (ip, ua = "Browser") => ({ "x-forwarded-for": ip, "user-agent": ua });

async function signIn() {
  const res = await post("/pentadbir/login", { password: "sama macam galtype" });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  return cookie.split(";")[0];
}

test("days are cut at midnight KL time", () => {
  assert.equal(dayOf(Date.UTC(2026, 9, 30, 15, 59)), "2026-10-30");
  assert.equal(dayOf(Date.UTC(2026, 9, 30, 16, 0)), "2026-10-31");
});

test("referrers keep only the site name", () => {
  assert.equal(refHost("www.facebook.com"), "facebook.com");
  assert.equal(refHost("https://evil.com/?x=1"), null);
  assert.equal(refHost("localhost"), null);
});

test("stats need the password", async () => {
  assert.equal((await fetch(`${base}/pentadbir/stats`)).status, 401);
  assert.equal((await post("/pentadbir/login", { password: "wrong" })).status, 401);
  const forged = `pentadbir=${Date.now() + 1e6}.abc`;
  assert.equal((await fetch(`${base}/pentadbir/stats`, { headers: { cookie: forged } })).status, 401);
});

test("events add up to daily totals, with no addresses saved", async () => {
  await post("/hit", { t: "visit", new: true, device: "phone", lang: "ms", ref: "m.facebook.com" }, as("1.1.1.1"));
  await post("/hit", { t: "visit", new: false, device: "phone", lang: "ms", ref: null }, as("1.1.1.1"));
  await post("/hit", { t: "prefs", tr: "ms.basmeih", rc: "ar.alafasy", audio: true }, as("1.1.1.1"));
  await post("/hit", { t: "prefs", tr: "ms.basmeih", rc: "ar.alafasy", audio: true }, as("1.1.1.1"));
  await post("/hit", { t: "ayah", s: 1, w: 7, ms: 20000 }, as("1.1.1.1"));
  await post("/hit", { t: "ayah", s: 1, w: 5, ms: 15000 }, as("1.1.1.1"));
  await post("/hit", { t: "surah", s: 1, wpm: 40, acc: 96 }, as("1.1.1.1"));
  await post("/hit", { t: "visit", new: false, device: "computer", lang: "en", ref: "google.com" }, as("2.2.2.2"));
  await post("/hit", { t: "prefs", tr: "en.sahih", rc: "ar.husary", audio: false }, as("2.2.2.2"));
  await post("/hit", { t: "ayah", s: 999, w: 5 }, as("2.2.2.2")); // dropped
  await post("/hit", { t: "nonsense" }, as("2.2.2.2")); // dropped
  await post("/hit", { t: "ping" }, as("4.4.4.4")); // dropped, and not a visitor

  const res = await fetch(`${base}/pentadbir/stats`, { headers: { cookie: await signIn() } });
  assert.equal(res.status, 200);
  const { today: t, days, totals } = await res.json();
  assert.equal(t.visits, 3);
  assert.equal(t.visitors, 2);
  assert.equal(t.newVisitors, 1);
  assert.equal(t.typists, 1);
  assert.equal(t.ayat, 2);
  assert.equal(t.words, 12);
  assert.equal(t.typingMs, 35000);
  assert.equal(t.surahs, 1);
  assert.deepEqual(t.translation, { "ms.basmeih": 1, "en.sahih": 1 });
  assert.equal(t.audioOff, 1);
  assert.deepEqual(t.device, { phone: 1, computer: 1 });
  assert.deepEqual(t.ref, { "m.facebook.com": 1, "google.com": 1 });
  assert.deepEqual(t.surahTyped, { 1: 2 });
  assert.equal(days.length, 30);
  assert.equal(days.at(-1).day, t.day);
  assert.equal(totals.ayat, 2);

  const files = await readdir(join(dataDir, "stats"));
  const saved = await readFile(join(dataDir, "stats", files[0]), "utf8");
  assert.ok(!saved.includes("1.1.1.1") && !saved.includes("Browser"));
});

test("new sync codes are counted", async () => {
  const cookie = await signIn();
  const before = (await (await fetch(`${base}/pentadbir/stats`, { headers: { cookie } })).json()).today.syncCreated;
  await post("/sync", { state: { surah: 1 } }, as("3.3.3.3"));
  const after = await (await fetch(`${base}/pentadbir/stats`, { headers: { cookie } })).json();
  assert.equal(after.today.syncCreated, before + 1);
  assert.ok(after.sync.total >= 1 && after.sync.active7 >= 1);
});
