// The /pentadbir stats page: signs in, then draws what server/stats.js reports.

import { TRANSLATIONS, RECITERS, getSurahList } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const API = "/api/pentadbir";

const TRANSLATION_NAMES = Object.fromEntries(TRANSLATIONS.map((t) => [t.id, `${t.label} (${t.by})`]));
const RECITER_NAMES = Object.fromEntries(RECITERS.map((r) => [r.id, r.label]));
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageName = (code) => {
  try {
    return `${languageNames.of(code)} (${code})`;
  } catch {
    return code;
  }
};
const DEVICE_NAMES = { phone: "Phone", tablet: "Tablet", computer: "Computer" };
let surahNames = {};
let shown = null; // the last report drawn, redrawn once surah names arrive
getSurahList()
  .then((list) => {
    surahNames = Object.fromEntries(list.map((s) => [s.number, s.englishName]));
    if (shown) draw(shown);
  })
  .catch(() => {});

const fmt = (n) => Math.round(n).toLocaleString("en-MY");
function hours(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)} h`;
}
const mytTime = (ms) =>
  new Date(ms).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
const shortDay = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-MY", { timeZone: "UTC", day: "numeric", month: "short" });

function tile(label, value, sub) {
  const div = document.createElement("div");
  div.className = "tile";
  div.innerHTML = '<div class="value"></div><div class="label"></div>';
  div.querySelector(".value").textContent = value;
  div.querySelector(".label").textContent = label;
  if (sub) {
    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = sub;
    div.append(s);
  }
  return div;
}

const averages = (d) =>
  d.scores ? { wpm: fmt(d.wpmSum / d.scores), accuracy: `${Math.round(d.accuracySum / d.scores)}%` } : { wpm: "–", accuracy: "–" };

// One bar per day, with a hover tooltip.
function barChart(title, days, value, show) {
  const box = document.createElement("div");
  box.className = "chart";
  const values = days.map(value);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  box.innerHTML = '<h3></h3><div class="peak"></div>';
  box.querySelector("h3").textContent = title;
  box.querySelector(".peak").textContent = `${show(total)} in 30 days · busiest day ${show(Math.max(...values))}`;

  const W = 300, H = 120, gap = 2;
  const step = W / days.length;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${title}: ${days.map((d, i) => `${d.day} ${show(values[i])}`).join(", ")}`);
  for (const f of [0.5, 1]) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("class", "grid");
    line.setAttribute("x1", 0);
    line.setAttribute("x2", W);
    line.setAttribute("y1", H - H * f);
    line.setAttribute("y2", H - H * f);
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(line);
  }
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  days.forEach((d, i) => {
    const h = values[i] ? Math.max((values[i] / max) * H, 2) : 0;
    const hit = document.createElementNS(ns, "rect");
    hit.setAttribute("class", "hit");
    hit.setAttribute("x", i * step);
    hit.setAttribute("y", 0);
    hit.setAttribute("width", step);
    hit.setAttribute("height", H);
    const bar = document.createElementNS(ns, "rect");
    bar.setAttribute("class", "bar");
    bar.setAttribute("x", i * step + gap / 2);
    bar.setAttribute("y", H - h);
    bar.setAttribute("width", step - gap);
    bar.setAttribute("height", h);
    bar.setAttribute("rx", Math.min(2, h / 2));
    hit.addEventListener("pointerenter", () => {
      tip.textContent = `${shortDay(d.day)}: ${show(values[i])}`;
      const r = svg.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      tip.style.left = `${r.left - b.left + ((i + 0.5) * step * r.width) / W}px`;
      tip.style.top = `${r.top - b.top + r.height * (1 - h / H) - 6}px`;
      tip.hidden = false;
    });
    hit.addEventListener("pointerleave", () => (tip.hidden = true));
    svg.append(hit, bar);
  });
  const axis = document.createElement("div");
  axis.className = "axis";
  axis.innerHTML = "<span></span><span></span>";
  axis.children[0].textContent = shortDay(days[0].day);
  axis.children[1].textContent = "Today";
  box.append(svg, axis, tip);
  return box;
}

// A ranked list with a thin meter per row.
function split(title, counts, name, limit = 8) {
  const box = document.createElement("div");
  box.className = "split";
  box.innerHTML = "<h3></h3>";
  box.querySelector("h3").textContent = title;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, n]) => sum + n, 0);
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing yet";
    box.append(p);
    return box;
  }
  const list = document.createElement("ol");
  for (const [key, n] of rows.slice(0, limit)) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="k"></span><span class="n"></span><span class="meter"><span></span></span>';
    li.querySelector(".k").textContent = name(key);
    li.querySelector(".n").textContent = `${fmt(n)} · ${Math.round((n / total) * 100)}%`;
    li.querySelector(".meter span").style.width = `${(n / rows[0][1]) * 100}%`;
    list.append(li);
  }
  if (rows.length > limit) {
    const rest = rows.slice(limit).reduce((sum, [, n]) => sum + n, 0);
    const li = document.createElement("li");
    li.innerHTML = '<span class="k"></span><span class="n"></span>';
    li.querySelector(".k").textContent = `${rows.length - limit} more`;
    li.querySelector(".n").textContent = fmt(rest);
    list.append(li);
  }
  box.append(list);
  return box;
}

function sumDays(days) {
  const out = {};
  for (const d of days) {
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === "number") out[k] = (out[k] || 0) + v;
      else if (v && typeof v === "object") {
        out[k] ??= {};
        for (const [key, n] of Object.entries(v)) out[k][key] = (out[k][key] || 0) + n;
      }
    }
  }
  return out;
}

const surahName = (n) => (surahNames[n] ? `${n}. ${surahNames[n]}` : `Surah ${n}`);

function draw(data) {
  shown = data;
  const { today: t, days, totals, sync } = data;
  $("updated").textContent = `Updated ${mytTime(data.generatedAt)} (KL time)`;
  $("today-date").textContent = shortDay(t.day);
  const ta = averages(t);
  $("today").replaceChildren(
    tile("Visitors", fmt(t.visitors), `${fmt(t.newVisitors)} new · ${fmt(t.visits)} page visits`),
    tile("Typed today", fmt(t.typists), "visitors who typed an ayah"),
    tile("Ayat typed", fmt(t.ayat), `${fmt(t.words)} words`),
    tile("Typing time", hours(t.typingMs)),
    tile("Surahs finished", fmt(t.surahs), t.scores ? `${ta.wpm} wpm · ${ta.accuracy} accuracy` : null),
    tile("Sync codes made", fmt(t.syncCreated)),
  );

  $("charts").replaceChildren(
    barChart("Visitors", days, (d) => d.visitors, fmt),
    barChart("Visitors who typed", days, (d) => d.typists, fmt),
    barChart("Ayat typed", days, (d) => d.ayat, fmt),
    barChart("Typing time", days, (d) => d.typingMs, hours),
  );

  const a = averages(totals);
  $("since").textContent = `since ${shortDay(totals.since)}`;
  $("totals").replaceChildren(
    tile("Visitor-days", fmt(totals.visitors), `${fmt(totals.newVisitors)} first visits`),
    tile("Ayat typed", fmt(totals.ayat), `${fmt(totals.words)} words`),
    tile("Typing time", hours(totals.typingMs)),
    tile("Surahs finished", fmt(totals.surahs)),
    tile("Khatams", fmt(totals.khatams)),
    tile("Average speed", a.wpm === "–" ? a.wpm : `${a.wpm} wpm`, `${a.accuracy} accuracy`),
    tile("Sync codes", fmt(sync.total), `${fmt(sync.active7)} used this week · ${fmt(sync.active30)} this month`),
  );

  const m = sumDays(days);
  const prefsTotal = Object.values(m.translation || {}).reduce((s, n) => s + n, 0);
  const audioOff = prefsTotal ? `${Math.round(((m.audioOff || 0) / prefsTotal) * 100)}% have recitation off` : "";
  const reciters = split("Reciter", m.reciter || {}, (k) => RECITER_NAMES[k] || k);
  if (audioOff) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = audioOff;
    reciters.append(p);
  }
  $("splits").replaceChildren(
    split("Translation", m.translation || {}, (k) => TRANSLATION_NAMES[k] || k),
    reciters,
    split("Device", m.device || {}, (k) => DEVICE_NAMES[k] || k),
    split("Browser language", m.lang || {}, languageName),
    split("Came from", m.ref || {}, (k) => k, 10),
    split("Most typed surahs (ayat)", m.surahTyped || {}, surahName, 10),
    split("Most finished surahs", m.surahFinished || {}, surahName, 10),
  );
}

async function load() {
  const res = await fetch(`${API}/stats`, { cache: "no-store" });
  if (res.status === 401) {
    $("report").hidden = true;
    $("login").hidden = false;
    $("password").focus();
    return;
  }
  if (!res.ok) throw new Error(`Couldn't load the stats (${res.status}).`);
  const data = await res.json();
  $("login").hidden = true;
  $("report").hidden = false;
  draw(data);
}

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: $("password").value }),
  });
  if (res.ok) {
    $("password").value = "";
    return load();
  }
  $("login-error").textContent = res.status === 429 ? "Too many tries. Wait a while and try again." : "Wrong password.";
});

$("logout").addEventListener("click", async () => {
  await fetch(`${API}/logout`, { method: "POST" });
  load();
});
$("refresh").addEventListener("click", () => load().catch((err) => alert(err.message)));

load().catch((err) => {
  $("login").hidden = false;
  $("login-error").textContent = err.message;
});
