import { TRANSLATIONS, RECITERS, TOTAL_AYAHS, getSurah, getSurahList } from "./api.js";
import { buildPlan, matches, filledUpTo, isForgivable } from "./typing.js";
import { FRAMES, frameBox } from "./frame.js";
import { trackVisit, trackPrefs, trackAyah, trackSurah, trackKhatam } from "./stats.js";
import { dayKey, addTime, addAyah, addSurah, monthsToShow, monthGrid, rangeLines } from "./history.js";
import { savedCode, rememberCode, showCode, parseCode, linkFor, codeFromLink, createCode, fetchCode, pushState } from "./sync.js";

const $ = (id) => document.getElementById(id);
const el = {
  page: $("page"),
  surahButton: $("surah-button"),
  surahName: $("surah-name"),
  timerButton: $("timer-button"),
  timer: $("timer"),
  play: $("play-button"),
  volume: $("volume"),
  volumeButton: $("volume-button"),
  volumePanel: $("volume-panel"),
  volumeMute: $("volume-mute"),
  volumeSlider: $("volume-slider"),
  volumeValue: $("volume-value"),
  settingsButton: $("settings-button"),
  current: $("current"),
  basmalah: $("basmalah"),
  arabic: $("arabic"),
  typing: $("typing"),
  translation: $("translation"),
  caret: $("caret"),
  catcher: $("catcher"),
  score: $("score"),
  scoreArabic: $("score-arabic"),
  scoreTitle: $("score-title"),
  scoreWords: $("score-words"),
  scoreWpm: $("score-wpm"),
  scoreAccuracy: $("score-accuracy"),
  scoreTime: $("score-time"),
  scoreSpan: $("score-span"),
  scoreNote: $("score-note"),
  scoreNext: $("score-next"),
  hint: $("hint"),
  status: $("status"),
  trail: $("trail"),
  progressFill: $("progress-fill"),
  surahProgressFill: $("surah-progress-fill"),
  surahProgressLabel: $("surah-progress-label"),
  progressLabel: $("progress-label"),
  welcome: $("welcome"),
  welcomeChoices: $("welcome-choices"),
  settings: $("settings"),
  setTranslation: $("set-translation"),
  setReciter: $("set-reciter"),
  setAutoplay: $("set-autoplay"),
  setAutoContinue: $("set-auto-continue"),
  setSkipBrackets: $("set-skip-brackets"),
  setTheme: $("set-theme"),
  setFrame: $("set-frame"),
  stats: $("stats"),
  statTime: $("stat-time"),
  statLifetime: $("stat-lifetime"),
  statsHistory: $("stats-history"),
  pausePanel: $("pause-panel"),
  khatamList: $("khatam-list"),
  statAyat: $("stat-ayat"),
  statSurahs: $("stat-surahs"),
  statNote: $("stat-note"),
  surahTimes: $("surah-times"),
  resetButton: $("reset-button"),
  jump: $("jump"),
  khatamButton: $("khatam-button"),
  khatamNext: $("khatam-next"),
  surahIndex: $("surah-index"),
  jumpSurah: $("jump-surah"),
  jumpAyah: $("jump-ayah"),
  syncOff: $("sync-off"),
  syncOn: $("sync-on"),
  syncCreate: $("sync-create"),
  syncInput: $("sync-input"),
  syncUse: $("sync-use"),
  syncCode: $("sync-code"),
  syncStatus: $("sync-status"),
  syncCopy: $("sync-copy"),
  syncLink: $("sync-link"),
  syncStop: $("sync-stop"),
};

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// ---- Saved state ---------------------------------------------------------

const STORE_KEY = "qurantype:v1";
const DEFAULTS = {
  translation: null,
  reciter: RECITERS[0].id,
  autoplay: true,
  autoContinue: false,
  skipBrackets: false,
  theme: "auto",
  frame: "cartouche",
  surah: 1,
  ayah: 1,
  pos: 0,
  // Which ayat have been typed: surah number -> "0101…", one digit per ayah.
  typed: {},
  // Typing time in milliseconds, overall and per surah.
  typingMs: 0,
  surahMs: {},
  startedOn: null, // date of the first keystroke of this khatam (local date for new khatams)
  khatamDays: 0, // days with typing in this khatam, counted only when dayCountFrom === startedOn
  dayCountFrom: null, // first day khatamDays covers; older progress started before the count existed
  lastTypedDay: null,
  khatamMs: null, // total time when the last untyped ayah was typed
  // Kept through "Start a new khatam": all typing ever, and each finished khatam.
  lifetimeMs: null, // null until filled in from typingMs for progress saved before this existed
  khatams: [], // [{ ms, startedOn, finishedOn, days? }], oldest first
  days: {}, // typing per local day, see js/history.js
  // The surah being typed right now, for its score page.
  run: null, // { surah, chars, misses, words, ms }
  results: {}, // surah number -> { words, wpm, accuracy, ms } from its last finish
  continueHints: 0, // times the "Enter or Space" hint has been shown
  savedAt: 0, // when anything above last changed, so the newest copy wins when syncing
};

function loadState() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

// Progress saved before lifetime time existed starts its lifetime clock at
// this khatam's time, and keeps a khatam it already finished.
function fillLifetime(s) {
  if (s.lifetimeMs == null) {
    s.lifetimeMs = s.typingMs;
    if (s.khatamMs != null && !s.khatams.length) s.khatams = [{ ms: s.khatamMs, startedOn: s.startedOn, finishedOn: null }];
  }
}

const state = loadState();
fillLifetime(state);
// savedAt only moves when something really changed, so just opening the page
// on a device never makes its copy look newer than the other device's.
const withoutStamp = () => JSON.stringify({ ...state, savedAt: 0 });
let lastSaved = withoutStamp();
function saveNow() {
  const now = withoutStamp();
  if (now !== lastSaved) {
    lastSaved = now;
    state.savedAt = Date.now();
    schedulePush();
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage blocked: the page still works, it just won't resume.
  }
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
addEventListener("pagehide", () => {
  saveNow();
  if (pushTimer) pushNow({ keepalive: true });
});

// ---- Typed ayat -------------------------------------------------------------

const countOnes = (s = "") => s.split("1").length - 1;
const typedInSurah = (n) => countOnes(state.typed[n]);
const typedTotal = () => Object.values(state.typed).reduce((sum, s) => sum + countOnes(s), 0);
const isSurahDone = (n, total) => typedInSurah(n) === total;
const isTyped = (n, ayahNumber) => state.typed[n]?.[ayahNumber - 1] === "1";

function markTyped() {
  const row = state.typed[surah.number] ?? "0".repeat(surah.ayahs.length);
  const i = ayah.numberInSurah - 1;
  state.typed[surah.number] = row.slice(0, i) + "1" + row.slice(i + 1);
}

// The first ayah not typed yet, going through the Quran in order.
async function nextUntyped() {
  const list = await getSurahList();
  for (const s of list) {
    const row = state.typed[s.number];
    if (!row) return { surah: s.number, ayah: 1 };
    const i = row.indexOf("0");
    if (i !== -1) return { surah: s.number, ayah: i + 1 };
  }
  return null;
}

// ---- Typing time ------------------------------------------------------------

// The clock runs while keys are being pressed and stops counting once a
// pause passes PAUSE_MS, so a tab left open doesn't add time.
const PAUSE_MS = 5000;
let lastKeyAt = 0;

function countTime() {
  const now = performance.now();
  if (lastKeyAt) {
    const delta = Math.min(now - lastKeyAt, PAUSE_MS);
    state.typingMs += delta;
    state.lifetimeMs += delta;
    addTime(state.days, delta);
    state.surahMs[surah.number] = (state.surahMs[surah.number] || 0) + delta;
    if (state.run) state.run.ms += delta;
  }
  if (state.run?.days) {
    if (state.run.days.at(-1) !== today) state.run.days.push(today);
  }
  const today = dayKey();
  if (!state.startedOn) state.startedOn = state.dayCountFrom = today;
  if (state.lastTypedDay !== today) {
    state.lastTypedDay = today;
    state.khatamDays++;
  }
  lastKeyAt = now;
  notePaused();
}

const liveExtra = () => (lastKeyAt ? Math.min(performance.now() - lastKeyAt, PAUSE_MS) : 0);
const liveTypingMs = () => state.typingMs + liveExtra();
const liveLifetimeMs = () => state.lifetimeMs + liveExtra();

function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatLong(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

const updateTimer = () => (el.timer.textContent = formatClock(liveTypingMs()));
setInterval(updateTimer, 1000);

// ---- Current ayah ---------------------------------------------------------

let surah = null; // the loaded surah
let ayah = null; // the ayah being typed
let plan = null; // typing plan for its translation
let typingMsAtLoad = 0; // typing time when this ayah was loaded, for the stats
let spans = [];
let missed = false;
let busy = false; // between ayat: keys are held and replayed once the next one shows
let waiting = false; // ayah typed, waiting for Enter or Space
let scoring = false; // a surah's score page is showing
let heldKeys = [];
let loadToken = 0;

const arabicDigits = new Intl.NumberFormat("ar-EG", { useGrouping: false });

async function loadAyah(surahNumber, ayahNumber, pos = 0) {
  const token = ++loadToken;
  busy = true;
  waiting = false;
  if (scoring) hideScore();
  const slow = setTimeout(() => showStatus("Loading…"), 300);
  try {
    const next = await getSurah(surahNumber, state.translation, state.reciter);
    if (token !== loadToken) return;
    clearTimeout(slow);
    hideStatus();

    const index = Math.min(Math.max(ayahNumber, 1), next.ayahs.length) - 1;
    await fadeOut();
    if (token !== loadToken) return;

    if (surah && surah.number !== next.number) clearTrail();
    surah = next;
    ayah = next.ayahs[index];
    plan = buildPlan(ayah.translation, { skipBrackets: state.skipBrackets });
    missed = false;
    state.surah = surah.number;
    state.ayah = ayah.numberInSurah;
    state.pos = Math.min(pos, plan.stream.length);
    typingMsAtLoad = state.typingMs;
    if (state.run?.surah !== surah.number) {
      state.run = { surah: surah.number, chars: 0, misses: 0, words: 0, ms: 0, days: [] }; // days: local dates typed on
    }
    save();
    keepTrailSteady(() => {
      render();
      fadeIn();
    });
    showNewAyah();

    busy = false;
    // Reopened on an ayah that was typed but not yet continued from.
    if (state.pos >= plan.stream.length) waitForContinue();
    const keys = heldKeys;
    heldKeys = [];
    keys.forEach(handleKey);

    if (index >= next.ayahs.length - 3 && surah.number < 114) {
      getSurah(surah.number + 1, state.translation, state.reciter).catch(() => {});
    }
  } catch (err) {
    if (token !== loadToken) return;
    clearTimeout(slow);
    heldKeys = [];
    showStatus("Couldn't load this surah. Check your connection.", () =>
      loadAyah(surahNumber, ayahNumber, pos),
    );
  }
}

// Swap the ayah out and the new one in. After a finished ayah has moved
// down into the trail the current block is already hidden, so nothing
// needs to fade.
function fadeOut() {
  if (!el.arabic.textContent || el.current.classList.contains("moved")) return Promise.resolve();
  el.current.classList.add("leaving");
  return new Promise((resolve) => setTimeout(resolve, 260));
}
function fadeIn() {
  el.current.hidden = false;
  el.current.classList.remove("moved");
  el.current.classList.add("leaving");
  requestAnimationFrame(() => requestAnimationFrame(() => el.current.classList.remove("leaving")));
}

function render() {
  el.surahName.textContent = `${surah.number} · ${surah.englishName}`;
  el.basmalah.hidden = !(ayah.numberInSurah === 1 && surah.number !== 1 && surah.number !== 9);
  el.current.classList.remove("finished");

  el.arabic.textContent = ayah.arabic + " ";
  const mark = document.createElement("span");
  mark.className = "ayah-mark";
  mark.textContent = arabicDigits.format(ayah.numberInSurah);
  el.arabic.append(mark);

  el.translation.lang = state.translation.split(".")[0];
  const frag = document.createDocumentFragment();
  spans = plan.text.map((ch, i) => {
    const span = document.createElement("span");
    span.className = plan.auto[i] ? "c auto" : "c";
    span.textContent = ch;
    frag.append(span);
    return span;
  });
  el.translation.replaceChildren(frag);

  updateTyping();
  updateProgress();
  updatePlayButton();
}

function updateTyping() {
  const filled = filledUpTo(plan, state.pos);
  const cur = plan.stream[state.pos]?.index ?? -1;
  for (let i = 0; i < spans.length; i++) {
    const cl = spans[i].classList;
    cl.toggle("done", i < filled);
    cl.toggle("miss", i === cur && missed);
  }
  placeCaret(spans[cur]);
}

// The caret glides under the next letter to type.
let caretSpan = null; // where the caret is heading (it glides, so its own box lags)
function placeCaret(span) {
  el.caret.classList.toggle("miss", missed);
  if (!span) {
    el.caret.hidden = true;
    return;
  }
  el.caret.hidden = false;
  caretSpan = span;
  const top = span.offsetTop + span.offsetHeight - 6;
  el.caret.style.width = `${Math.max(span.offsetWidth, 6)}px`;
  el.caret.style.transform = `translate(${span.offsetLeft}px, ${top}px)`;
  followCaret(span);
}

// Open each new ayah at the top of the page. Only when the Arabic is so long
// that the caret would start off screen, scroll down just far enough to see it.
function showNewAyah() {
  let target = 0;
  if (!el.caret.hidden && caretSpan) {
    const limit = innerHeight - 90; // the footer is hidden while typing
    const caretBottom = caretSpan.getBoundingClientRect().bottom + scrollY;
    if (caretBottom > limit) target = caretBottom - limit;
  }
  if (Math.abs(scrollY - target) < 2) return;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
}

// On long ayat, keep the line being typed in view: once it gets near the
// bottom of the screen, scroll so it sits a little above the middle.
function followCaret(span) {
  if (state.pos === 0) return; // a new ayah opens at its top, not at the caret
  const rect = span.getBoundingClientRect();
  const low = rect.bottom > innerHeight - Math.max(140, innerHeight * 0.28);
  const high = rect.top < document.querySelector(".bar").offsetHeight + 8;
  if (!low && !high) return;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollBy({ top: rect.top - innerHeight * 0.45, behavior: smooth ? "smooth" : "auto" });
}
addEventListener("resize", () => plan && updateTyping());
document.fonts?.ready.then(() => plan && updateTyping());

// The bar follows the surah; the label adds where that sits in the Quran.
function updateProgress() {
  const total = surah.ayahs.length;
  const within = plan.stream.length ? state.pos / plan.stream.length : 0;
  const surahWidth = `${(((ayah.numberInSurah - 1 + within) / total) * 100).toFixed(2)}%`;
  el.progressFill.style.width = surahWidth;
  el.surahProgressFill.style.width = surahWidth;
  el.surahProgressLabel.textContent = `Ayah ${ayah.numberInSurah} of ${total}`;
  const left = total - ayah.numberInSurah + (state.pos >= plan.stream.length ? 0 : 1);
  const pct = (typedTotal() / TOTAL_AYAHS) * 100;
  const percent = pct === 0 ? "0" : pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.floor(pct);
  el.progressLabel.textContent =
    `${surah.englishName} · Ayah ${ayah.numberInSurah} of ${total} · ` +
    (left ? `${left} left` : "surah done") +
    ` · Juz ${ayah.juz} · ${percent}% of the Quran typed`;
}

// ---- Typing ---------------------------------------------------------------

const isContinueKey = (ch) => ch === " " || ch === "\n";

function handleKey(ch) {
  if (busy) {
    heldKeys.push(ch);
    return;
  }
  if (scoring) {
    if (isContinueKey(ch)) leaveScore();
    return;
  }
  if (!plan) return;
  if (waiting) {
    if (isContinueKey(ch)) {
      countTime();
      moveOn();
    } else if (!isForgivable(ch)) {
      nudgeContinue();
    }
    return;
  }
  countTime();
  startRecitation();
  enterFocus();

  const expected = plan.stream[state.pos];
  if (expected && matches(expected.ch, ch)) {
    state.pos++;
    state.run.chars++;
    missed = false;
  } else if (expected && !isForgivable(ch)) {
    if (!missed) state.run.misses++;
    missed = true;
  }

  el.hint.classList.add("gone");
  updateTyping();
  save();
  if (state.pos >= plan.stream.length) finishAyah();
  else updateProgress();
}

function finishAyah() {
  markTyped();
  addAyah(state.days, surah.number, ayah.numberInSurah);
  const words = plan.stream.reduce((n, s) => n + (s.ch === " " ? 1 : 0), 1);
  state.run.words += words;
  trackAyah(surah.number, words, state.typingMs - typingMsAtLoad);
  if (typedTotal() === TOTAL_AYAHS && state.khatamMs == null) {
    state.khatamMs = state.typingMs;
    const finished = { ms: state.khatamMs, startedOn: state.startedOn, finishedOn: dayKey() };
    if (state.dayCountFrom === state.startedOn) finished.days = state.khatamDays;
    state.khatams = [...state.khatams, finished];
    trackKhatam();
  }
  save();
  updateProgress();
  el.current.classList.add("finished");
  if (state.autoContinue) {
    busy = true;
    setTimeout(moveOn, 700);
  } else {
    waitForContinue();
  }
}

// A small ↵ key sits at the end of the typed ayah; Enter, Space or a tap
// on it carries on.
function waitForContinue() {
  waiting = true;
  el.current.classList.add("finished");
  const key = document.createElement("button");
  key.type = "button";
  key.className = "enter-key";
  // Two keycaps: Enter, and a space bar that blinks like a caret, so it reads
  // as "either of these".
  key.innerHTML = '<span class="keycap">↵</span><span class="keycap keycap-space"><span class="space-mark"></span></span>';
  key.title = "Press Enter or Space to continue";
  key.setAttribute("aria-label", "Continue (Enter or Space)");
  key.addEventListener("click", (e) => {
    e.stopPropagation();
    if (waiting) moveOn();
    focusTyping();
  });
  el.translation.append(" ", key);
  if (state.continueHints < 3) {
    state.continueHints++;
    el.hint.textContent = "Press Enter or Space to go on.";
    el.hint.classList.remove("gone");
  }
}

function nudgeContinue() {
  const key = el.translation.querySelector(".enter-key");
  if (!key) return;
  key.classList.remove("nudge");
  void key.offsetWidth;
  key.classList.add("nudge");
}

function moveOn() {
  waiting = false;
  busy = true;
  el.hint.classList.add("gone");
  el.translation.querySelector(".enter-key")?.remove();
  const lastInSurah = ayah.numberInSurah === surah.ayahs.length;
  moveIntoTrail().then(() => (lastInSurah ? showScore() : loadAyah(surah.number, ayah.numberInSurah + 1)));
}

// ---- Surah score page ---------------------------------------------------------

// "Typed on 5 days, from 1 January to 31 January 2026." Days counted are the
// ones with typing in this surah, not every day in between.
function spanText(days) {
  if (!days.length) return "";
  const today = dayKey();
  const short = (k) => new Date(k + "T12:00").toLocaleDateString(undefined, { day: "numeric", month: "long" });
  if (days.length === 1) return days[0] === today ? "Started and finished today." : `Typed in one day, ${dateText(days[0])}.`;
  const sameYear = days[0].slice(0, 4) === days.at(-1).slice(0, 4);
  const from = sameYear ? short(days[0]) : dateText(days[0]);
  return `Typed on ${days.length} days, from ${from} to ${dateText(days.at(-1))}.`;
}

function showScore() {
  const run = state.run;
  const minutes = run.ms / 60000;
  const wpm = minutes > 0 ? Math.round(run.chars / 5 / minutes) : 0;
  const accuracy = run.chars + run.misses ? Math.round((run.chars / (run.chars + run.misses)) * 100) : 100;
  const days = run.days ?? [];
  state.results[surah.number] = { words: run.words, wpm, accuracy, ms: run.ms, ...(days.length && { from: days[0], to: days.at(-1), days: days.length }) };
  trackSurah(surah.number, wpm, accuracy);
  addSurah(state.days);
  state.run = null;
  save();

  el.scoreArabic.textContent = surah.name;
  el.scoreTitle.textContent = `${surah.englishName} complete`;
  el.scoreWords.textContent = run.words.toLocaleString();
  el.scoreWpm.textContent = wpm;
  el.scoreAccuracy.textContent = `${accuracy}%`;
  el.scoreTime.textContent = formatClock(run.ms);
  el.scoreSpan.textContent = spanText(days);
  el.scoreSpan.hidden = !days.length;
  const done = typedTotal() === TOTAL_AYAHS;
  el.scoreNote.hidden = !done;
  if (done) el.scoreNote.textContent = `Alhamdulillah, you have typed the whole Quran in ${formatLong(state.khatamMs ?? state.typingMs)}. ${khatamSpan(state.khatams.at(-1))}`;
  el.scoreNext.textContent = surah.number < 114 ? "Continue" : "Back to the start";
  el.scoreNext.dataset.next = surah.number < 114 ? surah.number + 1 : 1;
  el.scoreNext.insertAdjacentHTML("beforeend", ' <kbd>↵</kbd>');

  keepTrailSteady(() => {
    el.current.hidden = true;
    el.score.hidden = false;
  });
  el.score.classList.add("arriving");
  requestAnimationFrame(() => requestAnimationFrame(() => el.score.classList.remove("arriving")));
  el.progressFill.style.width = el.surahProgressFill.style.width = "100%";
  scoring = true;
  busy = false;
  heldKeys = [];
}

function hideScore() {
  scoring = false;
  el.score.hidden = true;
}

function leaveScore() {
  const next = Number(el.scoreNext.dataset.next);
  clearTrail();
  loadAyah(next, 1);
}
el.scoreNext.addEventListener("click", () => {
  leaveScore();
  focusTyping();
});

// ---- Finished ayat trail ------------------------------------------------------

// Finished ayat of the current surah collect below the one being typed,
// newest first. The finished ayah glides down into its place there before
// the next appears.
const TRAIL_LENGTH = 20;

function makeTrailItem() {
  const item = document.createElement("li");
  item.className = "trail-item";
  const ref = document.createElement("p");
  ref.className = "trail-ref";
  ref.textContent = `${surah.englishName} ${surah.number}:${ayah.numberInSurah}`;
  const arabic = el.arabic.cloneNode(true);
  arabic.removeAttribute("id");
  arabic.className = "trail-arabic";
  const text = document.createElement("p");
  text.className = "trail-text";
  text.lang = el.translation.lang;
  text.textContent = plan.text.join("");
  item.append(ref, arabic, text);
  return item;
}

const EASE = "cubic-bezier(.5, 0, .2, 1)";

// When something above the trail changes height, slide the trail to its new
// place instead of letting it jump.
function keepTrailSteady(change) {
  const before = el.trail.getBoundingClientRect().top;
  change();
  const shift = before - el.trail.getBoundingClientRect().top;
  if (shift && !reducedMotion.matches && el.trail.children.length) {
    el.trail.animate([{ transform: `translateY(${shift}px)` }, { transform: "none" }], { duration: 450, easing: EASE });
  }
}

function moveIntoTrail() {
  const item = makeTrailItem();
  item.classList.add("landing");
  // The earlier ayat slide down together, as one block, to make room.
  const older = [...el.trail.children];
  const oldTop = older[0]?.getBoundingClientRect().top;
  el.trail.prepend(item);
  while (el.trail.children.length > TRAIL_LENGTH) el.trail.lastElementChild.remove();
  if (older.length && !reducedMotion.matches) {
    const shift = older[0].getBoundingClientRect().top - oldTop;
    for (const li of older) {
      if (!li.isConnected) continue;
      li.animate([{ transform: `translateY(${-shift}px)` }, { transform: "none" }], { duration: 620, easing: EASE });
    }
  }

  const done = () => {
    el.current.classList.add("moved");
    item.classList.remove("landing");
  };
  if (reducedMotion.matches || !el.current.animate) {
    done();
    return Promise.resolve();
  }

  // The finished ayah flies down while its text reflows into the trail's
  // narrower, smaller layout: a copy of the old layout shrinks toward the
  // trail and fades out as the new layout grows out of it and fades in, so
  // the change of line breaks happens mid-flight.
  const from = el.current.getBoundingClientRect();
  const ghost = el.current.cloneNode(true);
  ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  ghost.querySelectorAll(".caret, .catcher").forEach((n) => n.remove());
  ghost.removeAttribute("id");
  ghost.classList.add("ghost");
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
  });
  document.body.append(ghost);
  el.current.classList.add("moved");
  item.classList.remove("landing");

  const timing = { duration: 700, easing: EASE, fill: "both" };
  const out = [{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0, offset: 0.75 }, { opacity: 0 }];
  const into = [{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }];
  const animations = [];
  const pairs = [
    [ghost.querySelector(".arabic"), item.querySelector(".trail-arabic")],
    [ghost.querySelector(".translation"), item.querySelector(".trail-text")],
  ];
  for (const [old, now] of pairs) {
    const a = old.getBoundingClientRect();
    const b = now.getBoundingClientRect();
    const scale = parseFloat(getComputedStyle(now).fontSize) / parseFloat(getComputedStyle(old).fontSize);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top - a.top;
    old.style.transformOrigin = now.style.transformOrigin = "top center";
    animations.push(
      old.animate(
        [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
        timing,
      ),
      old.animate(out, timing),
      now.animate(
        [{ transform: `translate(${-dx}px, ${-dy}px) scale(${1 / scale})` }, { transform: "none" }],
        timing,
      ),
      now.animate(into, timing),
    );
  }
  animations.push(
    item.animate([{ borderTopColor: "transparent" }, { borderTopColor: "transparent", offset: 0.4 }, {}], timing),
  );
  ghost.querySelectorAll(".basmalah").forEach((n) => animations.push(n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" })));
  animations.push(item.querySelector(".trail-ref").animate(into, timing));

  return Promise.all(animations.map((anim) => anim.finished)).then(() => {
    animations.forEach((anim) => anim.cancel());
    ghost.remove();
    done();
  });
}

const clearTrail = () => el.trail.replaceChildren();

// ---- Keyboard and focus ---------------------------------------------------------

el.catcher.addEventListener("input", (e) => {
  if (e.isComposing) return;
  for (const ch of el.catcher.value) handleKey(ch);
  el.catcher.value = "";
});
el.catcher.addEventListener("compositionend", () => {
  for (const ch of el.catcher.value) handleKey(ch);
  el.catcher.value = "";
});
el.catcher.addEventListener("keydown", (e) => {
  // Tab replays the recitation of the ayah from the start. Shift+Tab still
  // moves focus out, so keyboard users are not trapped.
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    if (ayah) playAyah();
    return;
  }
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (waiting || scoring) handleKey("\n");
});

const focusTyping = () => {
  if (!document.querySelector("dialog[open]")) el.catcher.focus({ preventScroll: true });
};
el.page.addEventListener("click", (e) => {
  if (!e.target.closest("button")) focusTyping();
});
el.catcher.addEventListener("focus", () => el.typing.classList.remove("blurred"));
el.catcher.addEventListener("blur", () => el.typing.classList.add("blurred"));

// Typing anywhere on the page goes to the ayah.
document.addEventListener("keydown", (e) => {
  if (document.activeElement === el.catcher || document.querySelector("dialog[open]")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const onControl = document.activeElement?.closest("button, select, input, summary");
  if ((e.key === "Enter" || e.key === " ") && onControl) return;
  if (e.key === "Enter" && (waiting || scoring)) {
    e.preventDefault();
    handleKey("\n");
    return;
  }
  if (e.key.length !== 1) return;
  focusTyping();
});

// Focus mode: the header and footer fade while typing and come back when
// the mouse moves or the screen is touched outside the text.
const enterFocus = () => document.body.classList.add("focus");

// ---- Debug: autotype --------------------------------------------------------

// Types the ayah by itself at 200 words per minute (a word being five
// characters), presses Enter at the end of each ayah and carries on, so long
// stretches can be tested quickly. It counts toward typing time and progress.
const AUTOTYPE_MS = 60000 / (200 * 5);
let autotype = null;
let autotypeWait = 0;
function autotypeStep() {
  if (busy || !plan) return;
  if (waiting || scoring) {
    // Pause a moment on a finished ayah or score page, as a person would.
    if (++autotypeWait < (scoring ? 30 : 8)) return;
    autotypeWait = 0;
    handleKey("\n");
    return;
  }
  const next = plan.stream[state.pos];
  if (next) handleKey(next.ch);
}
// Only shown when the page is opened with ?debug in its address.
if (new URLSearchParams(location.search).has("debug")) $("debug-button").hidden = false;
$("debug-button").addEventListener("click", () => {
  if (autotype) {
    clearInterval(autotype);
    autotype = null;
  } else {
    autotype = setInterval(autotypeStep, AUTOTYPE_MS);
  }
  $("debug-button").classList.toggle("on", !!autotype);
  $("debug-button").setAttribute("aria-pressed", String(!!autotype));
  focusTyping();
});
let lastPointer = null;
addEventListener("pointermove", (e) => {
  if (lastPointer && Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y) > 8) {
    document.body.classList.remove("focus");
  }
  lastPointer = { x: e.clientX, y: e.clientY };
});
addEventListener("pointerdown", () => document.body.classList.remove("focus"));

// ---- Recitation -----------------------------------------------------------

const audio = new Audio();
audio.preload = "none";
let audioFor = null; // global number of the ayah the audio belongs to

function startRecitation() {
  if (!state.autoplay || audioFor === ayah.number) return;
  playAyah();
}

function playAyah() {
  audioFor = ayah.number;
  if (audio.src !== ayah.audio) audio.src = ayah.audio;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

el.play.addEventListener("click", () => {
  if (!ayah) return;
  if (audioFor === ayah.number && !audio.paused) audio.pause();
  else if (audioFor === ayah.number && audio.src && !audio.ended) audio.play().catch(() => {});
  else playAyah();
  focusTyping();
});

function updatePlayButton() {
  const playing = !audio.paused && !audio.ended && !audio.error && audioFor === ayah?.number;
  el.play.classList.toggle("playing", playing);
  el.play.setAttribute("aria-label", playing ? "Pause recitation" : "Play recitation");
  el.play.title = "Play recitation (Tab replays it while typing)";
}
["play", "pause", "ended", "emptied", "error"].forEach((ev) => audio.addEventListener(ev, updatePlayButton));

// ---- Volume -----------------------------------------------------------------

// Kept apart from the synced progress: how loud the recitation plays belongs
// to this device (speakers, earphones), not to the reader.
const VOLUME_KEY = "qurantype:volume";
const sound = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) || "{}");
    return {
      volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 1,
      muted: saved.muted === true,
    };
  } catch {
    return { volume: 1, muted: false };
  }
})();

function applySound() {
  audio.volume = sound.volume;
  audio.muted = sound.muted;
  const silent = sound.muted || sound.volume === 0;
  const pct = Math.round(sound.volume * 100);
  el.volume.classList.toggle("silent", silent);
  el.volume.classList.toggle("low", !silent && sound.volume < 0.5);
  el.volumeSlider.value = pct;
  el.volumeSlider.style.setProperty("--fill", `${sound.muted ? 0 : pct}%`);
  el.volumeSlider.classList.toggle("muted", sound.muted);
  el.volumeValue.textContent = sound.muted ? "Muted" : `${pct}%`;
  el.volumeMute.textContent = sound.muted ? "Unmute" : "Mute";
  el.volumeMute.setAttribute("aria-pressed", String(sound.muted));
  el.volumeButton.setAttribute("aria-label", sound.muted ? "Recitation volume (muted)" : `Recitation volume (${pct}%)`);
  el.volumeButton.title = sound.muted ? "Recitation muted" : `Recitation volume ${pct}%`;
}
function saveSound() {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(sound));
  } catch {
    // Storage blocked: the setting lasts until the page closes.
  }
}

function openVolume(open) {
  el.volumePanel.hidden = !open;
  el.volumeButton.setAttribute("aria-expanded", String(open));
  el.volume.classList.toggle("open", open);
}
el.volumeButton.addEventListener("click", () => {
  const open = el.volumePanel.hidden;
  openVolume(open);
  if (open) el.volumeSlider.focus({ preventScroll: true });
  else focusTyping();
});
el.volumeMute.addEventListener("click", () => {
  sound.muted = !sound.muted;
  // Unmuting at zero would still be silent, so bring it back to half.
  if (!sound.muted && sound.volume === 0) sound.volume = 0.5;
  applySound();
  saveSound();
});
el.volumeSlider.addEventListener("input", () => {
  sound.volume = Number(el.volumeSlider.value) / 100;
  // Moving the slider means they want to hear it.
  if (sound.volume > 0) sound.muted = false;
  applySound();
  saveSound();
});
// The panel closes on a click elsewhere, on Escape, or when typing resumes.
addEventListener("pointerdown", (e) => {
  if (!el.volumePanel.hidden && !el.volume.contains(e.target)) openVolume(false);
});
el.volume.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    openVolume(false);
    focusTyping();
  }
});
el.catcher.addEventListener("focus", () => openVolume(false));
applySound();

// ---- Status line ------------------------------------------------------------

function showStatus(text, retry) {
  el.status.hidden = false;
  el.status.textContent = text;
  if (retry) {
    const btn = document.createElement("button");
    btn.className = "button button-quiet";
    btn.type = "button";
    btn.textContent = "Try again";
    btn.addEventListener("click", retry);
    el.status.append(btn);
  }
}
const hideStatus = () => (el.status.hidden = true);

// ---- Today and history ---------------------------------------------------------

// Once the typing clock pauses, the side panel (on screens wide enough to
// have room beside the ayah) shows today's typing, a calendar of past days
// and the sync code. It is built only when a pause starts, so typing itself
// pays nothing for it.
let pauseTimer;
function notePaused() {
  document.body.classList.remove("paused");
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(showPaused, PAUSE_MS);
}
function showPaused() {
  if (matchMedia("(min-width: 1240px)").matches) renderHistory(el.pausePanel);
  document.body.classList.add("paused");
}

let surahNames = [];
getSurahList().then((list) => (surahNames = list.map((s) => s.englishName))).catch(() => {});

function renderHistory(box) {
  const today = dayKey();
  const detail = document.createElement("div");
  detail.className = "history-detail";
  detail.setAttribute("aria-live", "polite");
  const months = document.createElement("div");
  months.className = "history-months";
  months.append(...monthsToShow(state.days, today).map((m) => monthGrid(m, state.days, today)));

  let pinned = null; // a day tapped, which stays shown until tapped again
  const show = (key) => {
    const day = state.days[key];
    const title = document.createElement("h3");
    title.className = "history-title";
    title.textContent = key === today ? "Today" : dateText(key);
    const stats = document.createElement("div");
    stats.className = "history-stats";
    for (const [value, label] of [
      [formatClock(key === today ? (day?.ms ?? 0) + liveExtra() : day?.ms ?? 0), "typing"],
      [day?.ayat ?? 0, "ayat"],
      [day?.surahs ?? 0, day?.surahs === 1 ? "surah" : "surahs"],
    ]) {
      const s = document.createElement("span");
      s.innerHTML = `<b></b><small></small>`;
      s.firstChild.textContent = value;
      s.lastChild.textContent = label;
      stats.append(s);
    }
    const ranges = document.createElement("ul");
    ranges.className = "history-ranges";
    const lines = rangeLines(day, surahNames);
    ranges.append(...lines.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
    if (!lines.length) ranges.append(Object.assign(document.createElement("li"), { className: "history-none", textContent: key === today ? "No ayat typed yet today." : "No ayat typed this day." }));
    detail.replaceChildren(title, stats, ranges);
    for (const c of months.querySelectorAll(".cal-day.on")) c.classList.remove("on");
    months.querySelector(`[data-day="${key}"]`)?.classList.add("on");
  };
  months.addEventListener("pointerover", (e) => {
    const cell = e.target.closest(".cal-day:not(:disabled)");
    if (cell && e.pointerType === "mouse") show(cell.dataset.day);
  });
  months.addEventListener("pointerleave", () => show(pinned ?? today));
  months.addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-day:not(:disabled)");
    if (!cell) return;
    pinned = pinned === cell.dataset.day ? null : cell.dataset.day;
    show(pinned ?? today);
  });
  months.addEventListener("focusin", (e) => e.target.matches(".cal-day") && show(e.target.dataset.day));

  const sync = document.createElement("p");
  sync.className = "history-sync";
  sync.textContent = syncCode ? `Sync code: ${showCode(syncCode)}` : "No sync code yet. Get one in Settings to carry on from another device.";

  box.replaceChildren(detail, months, sync);
  show(today);
}

// ---- My progress --------------------------------------------------------------

const longDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
// A "2026-11-09" date as written, read as that day on this device rather than UTC midnight.
const dateText = (key) => longDate(key + "T12:00");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "You started on 1 January 2026 and finished on 31 March 2026, typing on 45 days."
function khatamSpan(k) {
  if (!k?.startedOn) return "";
  const days = k.days ? `, typing on ${plural(k.days, "day")}` : "";
  return k.finishedOn
    ? `You started on ${dateText(k.startedOn)} and finished on ${dateText(k.finishedOn)}${days}.`
    : `You started on ${dateText(k.startedOn)}.`;
}

el.timerButton.addEventListener("click", async () => {
  el.statTime.textContent = formatClock(liveTypingMs());
  el.statLifetime.textContent = formatClock(liveLifetimeMs());
  el.statAyat.textContent = typedTotal().toLocaleString();
  el.statSurahs.textContent = "–";
  el.statNote.textContent = state.khatamMs
    ? `You typed the whole Quran in ${formatLong(state.khatamMs)}. ${khatamSpan(state.khatams.at(-1))}`
    : state.startedOn
      ? `You started this khatam on ${dateText(state.startedOn)}${state.dayCountFrom === state.startedOn ? ` and have typed on ${plural(state.khatamDays, "day")} so far` : ""}. The clock pauses after ${PAUSE_MS / 1000} seconds without typing.`
      : "The clock starts with your first keystroke and pauses when you stop typing.";
  el.resetButton.textContent = "Start a new khatam";
  el.resetButton.dataset.armed = "";
  el.surahTimes.replaceChildren();
  renderHistory(el.statsHistory);
  el.khatamList.replaceChildren(
    ...state.khatams.map((k, i) => {
      const li = document.createElement("li");
      li.textContent = `Khatam ${i + 1}: ${formatLong(k.ms)}. ${khatamSpan(k)}`;
      return li;
    }),
  );
  // One finished khatam that is still the current one is already in the note above.
  el.khatamList.hidden = !state.khatams.length || (state.khatams.length === 1 && state.khatamMs != null);
  el.stats.showModal();

  let list = [];
  try {
    list = await getSurahList();
  } catch {
    // Names are a nicety; numbers alone still read fine.
  }
  el.statSurahs.textContent = list.length
    ? list.filter((s) => isSurahDone(s.number, s.numberOfAyahs)).length
    : "–";
  const timed = Object.keys(state.surahMs).map(Number).sort((a, b) => a - b);
  const rows = timed.map((n) => {
    const row = document.createElement("div");
    row.className = "surah-time";
    const name = document.createElement("span");
    name.textContent = `${n}. ${list[n - 1]?.englishName ?? "Surah " + n}`;
    const time = document.createElement("span");
    time.className = "surah-time-value";
    const result = state.results[n];
    time.textContent = formatClock(state.surahMs[n]) + (result ? ` · ${result.wpm} wpm · ${result.accuracy}%` : "") + (result?.days > 1 ? ` · ${result.days} days` : "");
    if (list[n - 1] && isSurahDone(n, list[n - 1].numberOfAyahs)) {
      const tick = document.createElement("span");
      tick.className = "surah-done";
      tick.textContent = "finished";
      name.append(" ", tick);
    }
    row.append(name, time);
    return row;
  });
  el.surahTimes.replaceChildren(...rows);
});

el.resetButton.addEventListener("click", () => {
  if (!el.resetButton.dataset.armed) {
    el.resetButton.dataset.armed = "1";
    el.resetButton.textContent = "Tap again to clear this khatam and start at Al-Fatihah (lifetime time is kept)";
    return;
  }
  Object.assign(state, {
    surah: 1,
    ayah: 1,
    pos: 0,
    typed: {},
    typingMs: 0,
    surahMs: {},
    startedOn: null,
    khatamDays: 0,
    dayCountFrom: null,
    lastTypedDay: null,
    khatamMs: null,
    run: null,
    results: {},
  });
  lastKeyAt = 0;
  saveNow();
  updateTimer();
  clearTrail();
  el.stats.close();
  loadAyah(1, 1, 0);
});

// ---- Settings ---------------------------------------------------------------

function applyTheme() {
  if (state.theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

function fillSelect(select, items, label) {
  select.replaceChildren(
    ...items.map((item) => new Option(label(item), item.id)),
  );
}

fillSelect(el.setTranslation, TRANSLATIONS, (t) => `${t.label} (${t.by})`);
fillSelect(el.setReciter, RECITERS, (r) => r.label);
fillSelect(el.setFrame, Object.entries(FRAMES).map(([id, frame]) => ({ id, label: frame.label })), (fr) => fr.label);

el.settingsButton.addEventListener("click", () => {
  el.setTranslation.value = state.translation;
  el.setReciter.value = state.reciter;
  el.setAutoplay.checked = state.autoplay;
  el.setAutoContinue.checked = state.autoContinue;
  el.setSkipBrackets.checked = state.skipBrackets;
  el.setTheme.value = state.theme;
  el.setFrame.value = state.frame;
  renderSync();
  el.settings.showModal();
});

el.setTranslation.addEventListener("change", () => {
  state.translation = el.setTranslation.value;
  clearTrail();
  save();
  loadAyah(state.surah, state.ayah, 0);
});
el.setReciter.addEventListener("change", () => {
  state.reciter = el.setReciter.value;
  audioFor = null;
  save();
  loadAyah(state.surah, state.ayah, state.pos);
});
el.setAutoplay.addEventListener("change", () => {
  state.autoplay = el.setAutoplay.checked;
  save();
});
el.setAutoContinue.addEventListener("change", () => {
  state.autoContinue = el.setAutoContinue.checked;
  save();
});
el.setSkipBrackets.addEventListener("change", () => {
  state.skipBrackets = el.setSkipBrackets.checked;
  save();
  loadAyah(state.surah, state.ayah, 0);
});
el.setFrame.addEventListener("change", () => {
  state.frame = el.setFrame.value;
  setFrame(state.frame);
  save();
});
el.setTheme.addEventListener("change", () => {
  state.theme = el.setTheme.value;
  applyTheme();
  save();
});

// ---- Sync code ------------------------------------------------------------------

let syncCode = savedCode();
let pushTimer = null;
let syncedAt = 0;
let started = false; // begin() has run and an ayah is on screen

function schedulePush() {
  if (!syncCode) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 2000);
}

async function pushNow({ keepalive = false } = {}) {
  clearTimeout(pushTimer);
  pushTimer = null;
  if (!syncCode) return;
  try {
    const result = await pushState(syncCode, state, { keepalive });
    if (result.newer) useRemote(result.newer);
    else if (result.gone) stopSync("This sync code no longer exists on the server.");
    else syncedAt = Date.now();
  } catch {
    // Offline: try again with the next change, or when the page comes back into view.
    syncedAt = 0;
  }
  renderSync();
}

// Takes the progress saved under the code and carries on from its place.
function useRemote(remote) {
  if (!remote?.state?.translation) return;
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, DEFAULTS, remote.state, { savedAt: remote.savedAt });
  fillLifetime(state);
  lastSaved = withoutStamp();
  lastKeyAt = 0;
  saveNow();
  syncedAt = Date.now();
  applyTheme();
  setFrame(state.frame);
  clearTrail();
  updateTimer();
  if (el.welcome.open) el.welcome.close(state.translation);
  else if (started) loadAyah(state.surah, state.ayah, state.pos);
}

// Picks up changes made on the other device, or sends ours if they're newer.
async function pull(timeout) {
  if (!syncCode) return;
  try {
    const remote = await fetchCode(syncCode, timeout);
    if (!remote) return stopSync("This sync code no longer exists on the server.");
    if (remote.savedAt > state.savedAt) useRemote(remote);
    else if (remote.savedAt < state.savedAt) await pushNow();
    else syncedAt = Date.now();
  } catch {
    syncedAt = 0;
  }
  renderSync();
}

function stopSync(message) {
  syncCode = null;
  rememberCode(null);
  clearTimeout(pushTimer);
  pushTimer = null;
  renderSync();
  if (message) showStatus(message);
}

function renderSync(note) {
  el.syncOff.hidden = !!syncCode;
  el.syncOn.hidden = !syncCode;
  if (!syncCode) return;
  el.syncCode.textContent = showCode(syncCode);
  el.syncStatus.textContent = note
    ?? (syncedAt ? "Synced. Enter these words on your other device to carry on there." : "Not synced yet. It will try again when you're online.");
}

// Switches this device to a code from another device.
async function joinCode(code) {
  const remote = await fetchCode(code);
  if (!remote) throw new Error("No progress is saved under those words. Check the spelling?");
  if (code !== syncCode && typedTotal() > 0 && remote.savedAt < state.savedAt
      && !confirm("This device has its own progress. Replace it with the progress saved under this code?")) {
    return false;
  }
  syncCode = code;
  rememberCode(code);
  useRemote(remote);
  renderSync();
  return true;
}

el.syncCreate.addEventListener("click", async () => {
  el.syncCreate.disabled = true;
  try {
    saveNow();
    const { code } = await createCode(state);
    syncCode = code;
    rememberCode(code);
    syncedAt = Date.now();
    renderSync();
  } catch (err) {
    renderSync();
    alert(err.message);
  } finally {
    el.syncCreate.disabled = false;
  }
});

async function useTypedCode() {
  const code = parseCode(el.syncInput.value);
  if (!code) {
    alert("A sync code is three words, like \"quiet white seal\".");
    return;
  }
  el.syncUse.disabled = true;
  try {
    if (await joinCode(code)) el.syncInput.value = "";
  } catch (err) {
    alert(err.message);
  } finally {
    el.syncUse.disabled = false;
  }
}
el.syncUse.addEventListener("click", useTypedCode);
el.syncInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  useTypedCode();
});

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    renderSync(done);
  } catch {
    prompt("Copy this:", text);
  }
}
el.syncCopy.addEventListener("click", () => copy(showCode(syncCode), "Copied the words."));
el.syncLink.addEventListener("click", () => copy(linkFor(syncCode), "Copied a link. Opening it on another device carries on there."));
el.syncStop.addEventListener("click", () => {
  if (confirm("Stop syncing on this device? Your progress stays here, and the code still works on your other devices.")) stopSync();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pull();
});

// ---- Surah index ------------------------------------------------------------

function goTo(surahNumber, ayahNumber) {
  el.jump.close();
  clearTrail();
  loadAyah(surahNumber, ayahNumber, 0);
}

el.surahButton.addEventListener("click", async () => {
  el.jump.showModal();
  let list;
  try {
    list = await getSurahList();
  } catch {
    el.jump.close();
    showStatus("Couldn't load the list of surahs.");
    return;
  }

  const next = await nextUntyped();
  el.khatamButton.disabled = !next;
  el.khatamNext.textContent = next
    ? `${list[next.surah - 1].englishName}, ayah ${next.ayah}`
    : "Every ayah is typed. Alhamdulillah.";
  el.khatamButton.onclick = () => next && goTo(next.surah, next.ayah);

  el.surahIndex.replaceChildren(
    ...list.map((s) => {
      const typed = typedInSurah(s.number);
      const done = typed === s.numberOfAyahs;
      const row = document.createElement("button");
      row.type = "button";
      row.setAttribute("role", "listitem");
      row.className = "surah-row" + (done ? " done" : "") + (s.number === state.surah ? " here" : "");
      const num = document.createElement("span");
      num.className = "surah-row-num";
      num.textContent = s.number;
      const name = document.createElement("span");
      name.className = "surah-row-name";
      name.textContent = s.englishName;
      const meta = document.createElement("span");
      meta.className = "surah-row-meta";
      meta.textContent = done ? "finished" : typed ? `${typed} / ${s.numberOfAyahs}` : `${s.numberOfAyahs} ayat`;
      const bar = document.createElement("span");
      bar.className = "surah-row-bar";
      bar.style.setProperty("--done", `${(typed / s.numberOfAyahs) * 100}%`);
      row.append(num, name, meta, bar);
      // Open at the first ayah not typed yet, or the start if it is finished.
      row.addEventListener("click", () => {
        const i = state.typed[s.number]?.indexOf("0") ?? 0;
        goTo(s.number, done || i < 0 ? 1 : i + 1);
      });
      return row;
    }),
  );
  el.surahIndex.querySelector(".here")?.scrollIntoView({ block: "center" });

  if (el.jumpSurah.options.length !== list.length) {
    el.jumpSurah.replaceChildren(
      ...list.map((s) => new Option(`${s.number}. ${s.englishName}`, s.number)),
    );
  }
  el.jumpSurah.value = state.surah;
  el.jumpAyah.value = state.ayah;
  el.jumpAyah.max = list[state.surah - 1].numberOfAyahs;
});

el.jumpSurah.addEventListener("change", async () => {
  const list = await getSurahList();
  el.jumpAyah.value = 1;
  el.jumpAyah.max = list[el.jumpSurah.value - 1].numberOfAyahs;
});

el.jump.addEventListener("close", () => {
  if (el.jump.returnValue === "go") {
    const max = Number(el.jumpAyah.max) || 1;
    const ayahNumber = Math.min(Math.max(Number(el.jumpAyah.value) || 1, 1), max);
    clearTrail();
    loadAyah(Number(el.jumpSurah.value), ayahNumber, 0);
  }
  el.jump.returnValue = "";
  focusTyping();
});
el.settings.addEventListener("close", focusTyping);
el.stats.addEventListener("close", focusTyping);

// ---- Start ------------------------------------------------------------------

function showWelcome() {
  el.welcomeChoices.replaceChildren(
    ...TRANSLATIONS.map((t) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.value = t.id;
      btn.innerHTML = "<strong></strong><span></span>";
      btn.querySelector("strong").textContent = t.label;
      btn.querySelector("span").textContent = t.by;
      return btn;
    }),
  );
  // The reader has to pick one before starting.
  el.welcome.addEventListener("cancel", (e) => e.preventDefault());
  el.welcome.addEventListener("close", () => {
    state.translation = el.welcome.returnValue || TRANSLATIONS[0].id;
    save();
    begin();
  }, { once: true });
  el.welcome.showModal();
}

function begin() {
  started = true;
  showPaused();
  trackPrefs(state);
  if (state.pos > 0 || state.surah > 1 || state.ayah > 1) {
    el.hint.textContent = "Welcome back. Carry on typing from where you stopped.";
  }
  updateTimer();
  loadAyah(state.surah, state.ayah, state.pos);
  focusTyping();
}

applyTheme();
const setFrame = frameBox($("stage"), $("illumination"), state.frame);

async function start() {
  trackVisit();
  // Opened from a sync link, or synced before: pick up the latest progress first.
  const linked = codeFromLink();
  try {
    if (linked && linked !== syncCode) await joinCode(linked);
    else if (syncCode) await pull(4000);
  } catch (err) {
    showStatus(err.message);
  }
  if (state.translation && TRANSLATIONS.some((t) => t.id === state.translation)) {
    begin();
  } else showWelcome();
}
start();
