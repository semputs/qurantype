// Pure typing logic: turns a translation into the stream of characters the
// reader actually has to type, and checks keystrokes against it.
// No DOM here, so it can be tested with `node --test`.

// Brackets whose contents can be filled in automatically, e.g. Sahih
// International's "[all] praise" or Basmeih's "(Muhammad)".
const BRACKETS = { "[": "]", "(": ")", "{": "}" };

// Anything that is not a letter, a digit or whitespace is filled in for the
// reader: punctuation, quotes, apostrophes, hyphens, dashes.
const isAutoChar = (ch) => !/[\p{L}\p{N}\s]/u.test(ch);
const isSpace = (ch) => /\s/u.test(ch);

// Footnote markers some translations carry, like "Allah1" or "¹".
export function cleanTranslation(text) {
  return text
    .replace(/[¹²³⁰-⁹]+/g, "")
    .replace(/(?<=\p{L})\d+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Case- and accent-insensitive comparison key for one character.
export function foldChar(ch) {
  return ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Build the typing plan for a piece of text. With `skipBrackets`, words
 * inside brackets are filled in too; otherwise only the brackets are.
 * Returns { text, auto, stream } where
 *  - text:   the cleaned display text
 *  - auto:   boolean per character of text, true if it is filled in for you
 *  - stream: [{ ch, index }] the characters to type, each pointing at its
 *            position in text. Runs of whitespace (and whitespace around
 *            auto-filled parts) collapse to a single space.
 */
export function buildPlan(raw, { skipBrackets = false } = {}) {
  const text = cleanTranslation(raw);
  const chars = Array.from(text);
  const auto = new Array(chars.length).fill(false);

  // Mark bracketed groups (including nested ones) as auto.
  const stack = [];
  for (let i = 0; skipBrackets && i < chars.length; i++) {
    const ch = chars[i];
    if (BRACKETS[ch]) stack.push(BRACKETS[ch]);
    if (stack.length) auto[i] = true;
    if (stack.length && ch === stack[stack.length - 1]) stack.pop();
  }
  for (let i = 0; i < chars.length; i++) {
    if (isAutoChar(chars[i])) auto[i] = true;
  }

  const stream = [];
  for (let i = 0; i < chars.length; i++) {
    if (auto[i]) continue;
    const ch = chars[i];
    if (isSpace(ch)) {
      const last = stream[stream.length - 1];
      if (!last || last.ch === " ") continue;
      stream.push({ ch: " ", index: i });
    } else {
      stream.push({ ch, index: i });
    }
  }
  while (stream.length && stream[stream.length - 1].ch === " ") stream.pop();

  return { text: chars, auto, stream };
}

/** Does the typed key match the expected stream character? */
export function matches(expected, typed) {
  if (expected === " ") return isSpace(typed);
  return foldChar(expected) === foldChar(typed);
}

/**
 * Index in plan.text up to which everything counts as filled in, given
 * that `pos` stream characters have been typed. Auto characters that sit
 * before the next character to type are shown as filled.
 */
export function filledUpTo(plan, pos) {
  if (pos >= plan.stream.length) return plan.text.length;
  return plan.stream[pos].index;
}

/**
 * Keys that never count as a mistake: spaces and punctuation typed where a
 * letter is expected (e.g. "Qur'an" or "Allah," typed out in full).
 */
export const isForgivable = (typed) => isSpace(typed) || isAutoChar(typed);
