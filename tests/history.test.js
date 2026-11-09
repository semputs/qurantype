import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, addTime, addAyah, addSurah, monthsToShow, level, rangeLines } from "../js/history.js";

test("days use the device's local date", () => {
  assert.equal(dayKey(new Date(2026, 10, 9, 23, 59)), "2026-11-09");
});

test("following ayat join into one range, others start a new one", () => {
  const days = {};
  const k = "2026-11-09";
  for (const a of [90, 91, 92]) addAyah(days, 2, a, k);
  addAyah(days, 2, 5, k);
  addAyah(days, 3, 1, k);
  addTime(days, 60000, k);
  addSurah(days, k);
  assert.deepEqual(days[k], { ms: 60000, ayat: 5, surahs: 1, ranges: [[2, 90, 92], [2, 5, 5], [3, 1, 1]] });
  assert.deepEqual(rangeLines(days[k], ["Al-Fatiha", "Al-Baqara"]), ["Al-Baqara 2:90–92", "Al-Baqara 2:5", "Surah 3 3:1"]);
});

test("calendar shows months with typing, newest first, plus this month", () => {
  const days = { "2026-09-03": { ms: 1, ayat: 0 }, "2026-10-01": { ms: 0, ayat: 0 } };
  assert.deepEqual(monthsToShow(days, "2026-11-09"), ["2026-11", "2026-09"]);
});

test("levels go up with time typed", () => {
  assert.equal(level(undefined), 0);
  assert.equal(level({ ms: 60000, ayat: 1 }), 1);
  assert.equal(level({ ms: 50 * 60000, ayat: 1 }), 4);
});
