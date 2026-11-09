// Daily typing history: how long was typed each day, how many ayat and
// surahs, and which ayat. Kept in state.days, keyed by the device's local date.
//   days["2026-11-09"] = { ms, ayat, surahs, ranges: [[surah, from, to], …] }

const MAX_RANGES = 200; // per day, so a day of jumping around can't grow without end

// "2026-11-09" for the device's own day, not UTC.
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayOf(days, key = dayKey()) {
  return (days[key] ??= { ms: 0, ayat: 0, surahs: 0, ranges: [] });
}

export function addTime(days, ms, key) {
  dayOf(days, key).ms += ms;
}

// One ayah typed. Runs of following ayat in a surah join into one range.
export function addAyah(days, surah, ayah, key) {
  const day = dayOf(days, key);
  day.ayat++;
  const last = day.ranges.at(-1);
  if (last && last[0] === surah && last[2] === ayah - 1) last[2] = ayah;
  else if (day.ranges.length < MAX_RANGES) day.ranges.push([surah, ayah, ayah]);
}

export function addSurah(days, key) {
  dayOf(days, key).surahs++;
}

// ---- Calendar ---------------------------------------------------------------

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// Months to show, newest first: every month with typing, and always this one.
export function monthsToShow(days, today = dayKey()) {
  const months = new Set(Object.keys(days).filter((k) => days[k].ms > 0 || days[k].ayat > 0).map((k) => k.slice(0, 7)));
  months.add(today.slice(0, 7));
  return [...months].sort().reverse();
}

// 0 for no typing, then 1–4 by time typed that day.
export function level(day) {
  if (!day || (!day.ms && !day.ayat)) return 0;
  const minutes = day.ms / 60000;
  if (minutes < 5) return 1;
  if (minutes < 15) return 2;
  if (minutes < 45) return 3;
  return 4;
}

// A month grid as DOM: buttons for each day, marked with data-day and data-level.
export function monthGrid(month, days, today = dayKey()) {
  const [y, m] = month.split("-").map(Number);
  const box = document.createElement("section");
  box.className = "cal-month";
  const title = document.createElement("h3");
  title.textContent = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const grid = document.createElement("div");
  grid.className = "cal-grid";
  for (const w of WEEKDAYS) {
    const h = document.createElement("span");
    h.className = "cal-weekday";
    h.textContent = w;
    grid.append(h);
  }
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  for (let i = 0; i < lead; i++) grid.append(document.createElement("span"));
  const count = new Date(y, m, 0).getDate();
  for (let d = 1; d <= count; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-day";
    cell.textContent = d;
    cell.dataset.day = key;
    cell.dataset.level = level(days[key]);
    if (key === today) cell.classList.add("today");
    if (key > today) cell.disabled = true;
    grid.append(cell);
  }
  box.append(title, grid);
  return box;
}

// "Al-Baqara 2:90–97" lines for a day's ranges.
export function rangeLines(day, names = []) {
  return (day?.ranges ?? []).map(([s, from, to]) => {
    const name = names[s - 1] ?? `Surah ${s}`;
    return `${name} ${s}:${from}${to > from ? `–${to}` : ""}`;
  });
}
