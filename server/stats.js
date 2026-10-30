// Visitor stats for the /pentadbir page. Privacy first: only daily totals are
// written to disk. No cookies on visitors, no IP addresses or ids are saved.
// Visitors are told apart within one day by a hash of address + browser with
// a random salt that lives only in memory and changes at midnight KL time,
// so nobody can be followed from one day to the next.
//
//   POST /api/hit                 one event from the site (sendBeacon)
//   POST /api/pentadbir/login     { password } -> sets a 30-day cookie
//   POST /api/pentadbir/logout
//   GET  /api/pentadbir/stats     -> { today, days, totals, sync }  (needs the cookie)
//
// The password is read from PENTADBIR_PASSWORD_FILE (plain text, first line).

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TRANSLATIONS, RECITERS } from "../js/api.js";

const DAY_MS = 86400_000;
const MYT_MS = 8 * 3600_000; // Kuala Lumpur, UTC+8, no daylight saving
const COOKIE = "pentadbir";
const SESSION_MS = 30 * DAY_MS;
const MAX_KEYS = 200; // distinct referrers or languages kept per day
const HISTORY_DAYS = 30;

export const dayOf = (ms = Date.now()) => new Date(ms + MYT_MS).toISOString().slice(0, 10);

const blankDay = (day) => ({
  day,
  visits: 0, // page loads
  visitors: 0, // different people (per day)
  newVisitors: 0,
  typists: 0, // visitors who typed at least one ayah
  ayat: 0,
  words: 0,
  typingMs: 0,
  surahs: 0, // surahs finished
  khatams: 0,
  scores: 0, // surah score pages, for the averages below
  wpmSum: 0,
  accuracySum: 0,
  syncCreated: 0,
  audioOff: 0, // visitors with recitation turned off
  surahTyped: {}, // surah number -> ayat typed
  surahFinished: {}, // surah number -> times finished
  translation: {}, // id -> visitors
  reciter: {}, // id -> visitors
  device: {}, // phone / tablet / computer -> visitors
  lang: {}, // browser language -> visitors
  ref: {}, // referring site -> visits
});

const SUMS = ["visits", "visitors", "newVisitors", "typists", "ayat", "words", "typingMs", "surahs", "khatams",
  "scores", "wpmSum", "accuracySum", "syncCreated", "audioOff"];
const MAPS = ["surahTyped", "surahFinished", "translation", "reciter", "device", "lang", "ref"];

function addInto(total, day) {
  for (const k of SUMS) total[k] += day[k] || 0;
  for (const k of MAPS) for (const [key, n] of Object.entries(day[k] || {})) total[k][key] = (total[k][key] || 0) + n;
  return total;
}

const bump = (map, key, n = 1) => {
  if (key in map || Object.keys(map).length < MAX_KEYS) map[key] = (map[key] || 0) + n;
  else map.other = (map.other || 0) + n;
};

const TRANSLATION_IDS = TRANSLATIONS.map((t) => t.id);
const RECITER_IDS = RECITERS.map((r) => r.id);
const DEVICES = ["phone", "tablet", "computer"];
const surahOf = (v) => (Number.isInteger(v) && v >= 1 && v <= 114 ? v : null);
const clampInt = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : null);

// Keeps only the host of a referrer, e.g. "https://m.facebook.com/x?y" -> "m.facebook.com".
export function refHost(value) {
  const host = String(value || "").toLowerCase();
  return /^[a-z0-9.-]{1,80}$/.test(host) && host.includes(".") ? host.replace(/^www\./, "") : null;
}

export function createStats({ dir, syncDir, passwordFile, siteHost }) {
  let today = null; // the day being counted, in memory, written every few seconds
  let salt = null;
  let seen = new Map(); // visitor hash -> { typed } for today only
  let dirty = false;

  const fileFor = (day) => join(dir, `${day}.json`);

  async function readDay(day) {
    try {
      return { ...blankDay(day), ...JSON.parse(await readFile(fileFor(day), "utf8")) };
    } catch (err) {
      if (err.code === "ENOENT") return blankDay(day);
      throw err;
    }
  }

  async function flush() {
    if (!dirty || !today) return;
    dirty = false;
    const tmp = `${fileFor(today.day)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(today));
    await rename(tmp, fileFor(today.day));
  }

  // Switches to a new day at midnight KL time, with a new salt and nobody seen yet.
  async function current() {
    const day = dayOf();
    if (today?.day !== day) {
      await flush();
      today = await readDay(day);
      salt = randomBytes(16);
      seen = new Map();
    }
    return today;
  }

  const visitorOf = (ip, ua) => createHash("sha256").update(salt).update(`${ip}\n${ua}`).digest("base64url").slice(0, 16);

  async function hit(event, ip, ua) {
    const d = await current();
    const id = visitorOf(ip, ua);
    let visitor = seen.get(id);
    const first = !visitor;
    if (first) {
      visitor = { typed: false, prefs: false };
      seen.set(id, visitor);
      d.visitors++;
    }

    switch (event.t) {
      case "visit": {
        d.visits++;
        if (first && event.new === true) d.newVisitors++;
        if (first) {
          if (DEVICES.includes(event.device)) bump(d.device, event.device);
          const lang = String(event.lang || "").toLowerCase();
          if (/^[a-z]{2,3}$/.test(lang)) bump(d.lang, lang);
        }
        const ref = refHost(event.ref);
        if (ref && ref !== siteHost) bump(d.ref, ref);
        break;
      }
      case "prefs": {
        if (visitor.prefs) break;
        visitor.prefs = true;
        if (TRANSLATION_IDS.includes(event.tr)) bump(d.translation, event.tr);
        if (RECITER_IDS.includes(event.rc)) bump(d.reciter, event.rc);
        if (event.audio === false) d.audioOff++;
        break;
      }
      case "ayah": {
        const surah = surahOf(event.s);
        if (!surah) return false;
        if (!visitor.typed) {
          visitor.typed = true;
          d.typists++;
        }
        d.ayat++;
        d.words += clampInt(event.w, 0, 1000) ?? 0;
        d.typingMs += clampInt(event.ms, 0, 30 * 60_000) ?? 0;
        bump(d.surahTyped, String(surah));
        break;
      }
      case "surah": {
        const surah = surahOf(event.s);
        if (!surah) return false;
        d.surahs++;
        bump(d.surahFinished, String(surah));
        const wpm = clampInt(event.wpm, 0, 300);
        const accuracy = clampInt(event.acc, 0, 100);
        if (wpm != null && accuracy != null) {
          d.scores++;
          d.wpmSum += wpm;
          d.accuracySum += accuracy;
        }
        break;
      }
      case "khatam":
        d.khatams++;
        break;
      default:
        return false;
    }
    dirty = true;
    return true;
  }

  async function syncCreated() {
    (await current()).syncCreated++;
    dirty = true;
  }

  // ---- Sign in ----

  async function password() {
    try {
      return (await readFile(passwordFile, "utf8")).split(/\r?\n/)[0];
    } catch {
      return "";
    }
  }

  const sign = (secret, expires) => createHmac("sha256", `pentadbir:${secret}`).update(String(expires)).digest("base64url");
  const same = (a, b) => {
    const x = createHash("sha256").update(a).digest();
    const y = createHash("sha256").update(b).digest();
    return timingSafeEqual(x, y);
  };

  // Returns a cookie value for the right password, or null. Changing the
  // password signs everyone out, since the cookie is signed with it.
  async function login(given) {
    const secret = await password();
    if (!secret || typeof given !== "string" || !same(given, secret)) return null;
    const expires = Date.now() + SESSION_MS;
    return `${expires}.${sign(secret, expires)}`;
  }

  async function signedIn(cookieHeader) {
    const value = String(cookieHeader || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const [expires, mac] = (value || "").split(".");
    const secret = await password();
    if (!secret || !mac || !(Number(expires) > Date.now())) return false;
    return same(mac, sign(secret, expires));
  }

  const cookie = (value, maxAge) =>
    `${COOKIE}=${value}; Path=/api/pentadbir; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

  // ---- Report ----

  async function syncCodes() {
    const now = Date.now();
    const out = { total: 0, active7: 0, active30: 0 };
    let names = [];
    try {
      names = await readdir(syncDir);
    } catch {
      return out;
    }
    for (const name of names) {
      if (!/^[a-z]+-[a-z]+-[a-z]+\.json$/.test(name)) continue;
      out.total++;
      try {
        const age = now - (await stat(join(syncDir, name))).mtimeMs;
        if (age < 7 * DAY_MS) out.active7++;
        if (age < 30 * DAY_MS) out.active30++;
      } catch {
        // Removed while counting.
      }
    }
    return out;
  }

  async function report() {
    const d = await current();
    await flush();
    const files = (await readdir(dir)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    const totals = blankDay(null);
    const byDay = new Map();
    for (const name of files) {
      const day = name.slice(0, 10);
      const record = day === d.day ? d : await readDay(day);
      byDay.set(day, record);
      addInto(totals, record);
    }
    totals.days = files.length;
    totals.since = files[0]?.slice(0, 10) ?? d.day;
    const days = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const day = dayOf(Date.now() - i * DAY_MS);
      days.push(byDay.get(day) || blankDay(day));
    }
    return { today: d, days, totals, sync: await syncCodes(), generatedAt: Date.now() };
  }

  return { hit, syncCreated, login, signedIn, cookie, report, flush, start: () => mkdir(dir, { recursive: true }) };
}
