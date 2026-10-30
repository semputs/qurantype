// QuranType sync server: keeps each sync code's progress in a small JSON file
// so it can be picked up on another device. No dependencies, Node 20+.
//
//   POST /api/sync          { state }            -> { code, savedAt }   new code
//   GET  /api/sync/<code>                        -> { state, savedAt }
//   PUT  /api/sync/<code>   { state, savedAt }   -> { savedAt }, or 409 { state, savedAt }
//                                                   when the server copy is newer
//
// Codes are three words ("quiet white seal"), sent as "quiet-white-seal".
// The same server keeps the visitor stats for /pentadbir: see server/stats.js.
// With SERVE_STATIC=1 it also serves the site, which is handy for local testing.

import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADJECTIVES, COLOURS, NOUNS } from "../js/words.js";
import { createStats } from "./stats.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));
const SERVE_STATIC = process.env.SERVE_STATIC === "1";
const MAX_BODY = 512 * 1024;
const stats = createStats({
  dir: resolve(process.env.STATS_DIR || join(DATA_DIR, "stats")),
  syncDir: DATA_DIR,
  passwordFile: resolve(process.env.PENTADBIR_PASSWORD_FILE || join(ROOT, "data", "pentadbir-password")),
  siteHost: process.env.SITE_HOST || "qurantype.semput.com",
});

// Unknown codes and new codes are limited per address, so codes can't be guessed by brute force.
// Wrong pentadbir passwords and stats events are limited the same way.
const LIMITS = { miss: 30, create: 20, login: 10, hit: 3000 }; // per hour
const hits = new Map();
function limited(ip, kind) {
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  hits.set(key, recent);
  return recent.length >= LIMITS[kind];
}
function count(ip, kind) {
  hits.get(`${kind}:${ip}`).push(Date.now());
}
setInterval(() => hits.clear(), 6 * 3600_000).unref();

const LISTS = [ADJECTIVES, COLOURS, NOUNS];
const pick = (list) => list[randomInt(list.length)];
const newCode = () => LISTS.map(pick).join("-");
const isCode = (code) => {
  const parts = code.split("-");
  return parts.length === 3 && parts.every((w, i) => LISTS[i].includes(w));
};

const fileFor = (code) => join(DATA_DIR, `${code}.json`);

async function load(code) {
  try {
    return JSON.parse(await readFile(fileFor(code), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function store(code, record) {
  const file = fileFor(code);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(record));
  await rename(tmp, file);
}

// One write at a time per code, so two devices saving together can't interleave.
const queues = new Map();
function serial(code, task) {
  const run = (queues.get(code) || Promise.resolve()).then(task, task);
  queues.set(code, run.catch(() => {}));
  run.finally(() => queues.get(code) === run && queues.delete(code));
  return run;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req, max = MAX_BODY) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("bad json"), { status: 400 });
  }
}

function validState(body) {
  return body && typeof body.state === "object" && body.state !== null && !Array.isArray(body.state);
}

async function api(req, res, ip, code) {
  if (!code) {
    if (req.method !== "POST") return send(res, 405, { error: "method" });
    if (limited(ip, "create")) return send(res, 429, { error: "slow down" });
    const body = await readJson(req);
    if (!validState(body)) return send(res, 400, { error: "state" });
    let fresh = newCode();
    for (let i = 0; i < 20 && (await load(fresh)); i++) fresh = newCode();
    const record = { state: body.state, savedAt: Number(body.state.savedAt) || Date.now() };
    await store(fresh, record);
    count(ip, "create");
    await stats.syncCreated();
    return send(res, 201, { code: fresh, savedAt: record.savedAt });
  }

  if (!isCode(code)) return send(res, 404, { error: "unknown code" });
  if (req.method === "GET") {
    if (limited(ip, "miss")) return send(res, 429, { error: "slow down" });
    const record = await load(code);
    if (!record) {
      count(ip, "miss");
      return send(res, 404, { error: "unknown code" });
    }
    return send(res, 200, record);
  }
  if (req.method === "PUT") {
    const body = await readJson(req);
    if (!validState(body)) return send(res, 400, { error: "state" });
    const savedAt = Number(body.savedAt) || Date.now();
    return serial(code, async () => {
      const current = await load(code);
      if (!current) return send(res, 404, { error: "unknown code" });
      // Last save wins: an older copy coming in gets the newer one back instead.
      if (current.savedAt > savedAt) return send(res, 409, current);
      await store(code, { state: body.state, savedAt });
      return send(res, 200, { savedAt });
    });
  }
  return send(res, 405, { error: "method" });
}

const SESSION_SECONDS = 30 * 86400;

async function pentadbir(req, res, ip, action) {
  if (action === "login" && req.method === "POST") {
    if (limited(ip, "login")) return send(res, 429, { error: "slow down" });
    const body = await readJson(req, 4096);
    const value = await stats.login(body?.password);
    if (!value) {
      count(ip, "login");
      return send(res, 401, { error: "wrong password" });
    }
    return send(res, 200, { ok: true }, { "set-cookie": stats.cookie(value, SESSION_SECONDS) });
  }
  if (action === "logout" && req.method === "POST") {
    return send(res, 200, { ok: true }, { "set-cookie": stats.cookie("", 0) });
  }
  if (action === "stats" && req.method === "GET") {
    if (!(await stats.signedIn(req.headers.cookie))) return send(res, 401, { error: "sign in" });
    return send(res, 200, await stats.report());
  }
  return send(res, 404, { error: "not found" });
}

// Events from the site. Anything odd is quietly dropped, so the page never waits on it.
async function hit(req, res, ip) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!limited(ip, "hit")) {
    count(ip, "hit");
    const body = await readJson(req, 2048).catch(() => null);
    if (body && typeof body === "object") await stats.hit(body, ip, String(req.headers["user-agent"] || ""));
  }
  res.writeHead(204).end();
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveFile(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\]|\.\.[/\\])+/, "");
  let file = resolve(ROOT, rel || "index.html");
  if (file === join(ROOT, "pentadbir")) file = join(file, "index.html");
  const allowed = [join(ROOT, "index.html"), join(ROOT, "css"), join(ROOT, "js"), join(ROOT, "pentadbir")];
  if (!allowed.some((p) => file === p || file.startsWith(p + "/"))) return send(res, 404, { error: "not found" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    send(res, 404, { error: "not found" });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // Behind nginx or Caddy the real address is the last one in X-Forwarded-For
  // (earlier ones come from the browser and can be made up).
  const ip = (req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress;
  try {
    const match = url.pathname.match(/^\/api\/sync\/?([^/]*)$/);
    if (match) return await api(req, res, ip, decodeURIComponent(match[1]).toLowerCase());
    if (url.pathname === "/api/hit") return await hit(req, res, ip);
    const admin = url.pathname.match(/^\/api\/pentadbir\/([a-z]+)$/);
    if (admin) return await pentadbir(req, res, ip, admin[1]);
    if (SERVE_STATIC && req.method === "GET") return await serveFile(req, res, url.pathname);
    send(res, 404, { error: "not found" });
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : "server" });
  }
});

await mkdir(DATA_DIR, { recursive: true });
await stats.start();
setInterval(() => stats.flush().catch(console.error), 10_000).unref();
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => stats.flush().catch(console.error).finally(() => process.exit(0)));
}
server.listen(PORT, HOST, () => {
  console.log(`QuranType sync on http://${HOST}:${PORT}, saving to ${DATA_DIR}`);
});
