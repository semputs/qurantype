import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, matches, filledUpTo, cleanTranslation } from "../js/typing.js";

const streamText = (plan) => plan.stream.map((s) => s.ch).join("");

test("words inside brackets are typed, brackets and punctuation fill in", () => {
  const plan = buildPlan("[All] praise is [due] to Allah, Lord of the worlds -");
  assert.equal(streamText(plan), "All praise is due to Allah Lord of the worlds");
});

test("with skipBrackets, square-bracket words fill in for you", () => {
  const plan = buildPlan("[All] praise is [due] to Allah, Lord of the worlds -", { skipBrackets: true });
  assert.equal(streamText(plan), "praise is to Allah Lord of the worlds");
});

test("with skipBrackets, parentheses are filled in too", () => {
  const plan = buildPlan("Dengan nama Allah, Yang Maha Pemurah, lagi Maha Mengasihani (Muhammad).", { skipBrackets: true });
  assert.equal(streamText(plan), "Dengan nama Allah Yang Maha Pemurah lagi Maha Mengasihani");
});

test("nested brackets stay auto until the outer one closes", () => {
  const plan = buildPlan("say [to them (O Muhammad)] peace", { skipBrackets: true });
  assert.equal(streamText(plan), "say peace");
});

test("apostrophes and hyphens do not need typing", () => {
  const plan = buildPlan("Qur'an well-known");
  assert.equal(streamText(plan), "Quran wellknown");
});

test("footnote numbers are removed but real numbers stay", () => {
  assert.equal(cleanTranslation("Allah1 is One²"), "Allah is One");
  assert.equal(streamText(buildPlan("forty nights or 40 nights")), "forty nights or 40 nights");
});

test("matching ignores case and accents", () => {
  assert.ok(matches("D", "d"));
  assert.ok(matches("ā", "a"));
  assert.ok(!matches("a", "b"));
  assert.ok(matches(" ", " "));
  assert.ok(!matches(" ", "a"));
});

test("filledUpTo covers auto text before the next character to type", () => {
  const plan = buildPlan("[All] praise", { skipBrackets: true });
  // Nothing typed yet: "[All] " is filled, the cursor sits on "p".
  assert.equal(plan.text.slice(0, filledUpTo(plan, 0)).join(""), "[All] ");
  assert.equal(filledUpTo(plan, plan.stream.length), plan.text.length);
  // Typing the bracketed word: the opening bracket fills in, cursor on "A".
  const typed = buildPlan("[All] praise");
  assert.equal(typed.text.slice(0, filledUpTo(typed, 0)).join(""), "[");
});

test("punctuation and spaces typed out of place are forgiven", async () => {
  const { isForgivable } = await import("../js/typing.js");
  assert.ok(isForgivable("'"));
  assert.ok(isForgivable(","));
  assert.ok(isForgivable(" "));
  assert.ok(!isForgivable("x"));
});
