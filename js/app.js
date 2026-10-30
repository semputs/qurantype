import { TRANSLATIONS, RECITERS, TOTAL_AYAHS, getSurah, getSurahList } from "./api.js";
import { buildPlan, matches, filledUpTo, isForgivable } from "./typing.js";

const $ = (id) => document.getElementById(id);
const el = {
  page: $("page"),
  surahButton: $("surah-button"),
  surahName: $("surah-name"),
  timerButton: $("timer-button"),
  timer: $("timer"),
  play: $("play-button"),
  settingsButton: $("settings-button"),
  current: $("current"),
  basmalah: $("basmalah"),
  arabic: $("arabic"),
  typing: $("typing"),
  translation: $("translation"),
  caret: $("caret"),
  catcher: $("catcher"),
  continueButton: $("continue"),
  hint: $("hint"),
  status: $("status"),
  trail: $("trail"),
  progressFill: $("progress-fill"),
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
  stats: $("stats"),
  statTime: $("stat-time"),
  statAyat: $("stat-ayat"),
  statSurahs: $("stat-surahs"),
  statNote: $("stat-note"),
  surahTimes: $("surah-times"),
  resetButton: $("reset-button"),
  jump: $("jump"),
  jumpSurah: $("jump-surah"),
  jumpAyah: $("jump-ayah"),
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
  surah: 1,
  ayah: 1,
  pos: 0,
  // Typing time, in milliseconds
  typingMs: 0,
  surahMs: {}, // surah number -> time spent typing it
  surahsDone: [], // surah numbers typed to the last ayah
  ayatTyped: 0,
  startedOn: null, // ISO date of the first keystroke of this khatam
  khatamMs: null, // total time when the last ayah of the Quran was finished
};

function loadState() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

const state = loadState();
function saveNow() {
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
addEventListener("pagehide", saveNow);

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
    state.surahMs[surah.number] = (state.surahMs[surah.number] || 0) + delta;
  }
  if (!state.startedOn) state.startedOn = new Date().toISOString().slice(0, 10);
  lastKeyAt = now;
}

function liveTypingMs() {
  if (!lastKeyAt) return state.typingMs;
  return state.typingMs + Math.min(performance.now() - lastKeyAt, PAUSE_MS);
}

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
let spans = [];
let missed = false;
let busy = false; // between ayat: keys are held and replayed once the next one shows
let waiting = false; // ayah typed, waiting for Enter
let heldKeys = [];
let loadToken = 0;

const arabicDigits = new Intl.NumberFormat("ar-EG", { useGrouping: false });

async function loadAyah(surahNumber, ayahNumber, pos = 0) {
  const token = ++loadToken;
  busy = true;
  waiting = false;
  el.continueButton.hidden = true;
  const slow = setTimeout(() => showStatus("Loading…"), 300);
  try {
    const next = await getSurah(surahNumber, state.translation, state.reciter);
    if (token !== loadToken) return;
    clearTimeout(slow);
    hideStatus();

    const index = Math.min(Math.max(ayahNumber, 1), next.ayahs.length) - 1;
    await fadeOut();
    if (token !== loadToken) return;

    surah = next;
    ayah = next.ayahs[index];
    plan = buildPlan(ayah.translation, { skipBrackets: state.skipBrackets });
    missed = false;
    state.surah = surah.number;
    state.ayah = ayah.numberInSurah;
    state.pos = Math.min(pos, plan.stream.length);
    save();
    render();
    fadeIn();

    busy = false;
    if (state.pos >= plan.stream.length) {
      // Reopened on an ayah that was typed but not yet continued from.
      showFinished();
      waiting = true;
      el.continueButton.hidden = false;
    }
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
function placeCaret(span) {
  el.caret.classList.toggle("miss", missed);
  if (!span) {
    el.caret.hidden = true;
    return;
  }
  el.caret.hidden = false;
  const top = span.offsetTop + span.offsetHeight - 6;
  el.caret.style.width = `${Math.max(span.offsetWidth, 6)}px`;
  el.caret.style.transform = `translate(${span.offsetLeft}px, ${top}px)`;
}
addEventListener("resize", () => plan && updateTyping());
document.fonts?.ready.then(() => plan && updateTyping());

function updateProgress() {
  const within = plan.stream.length ? state.pos / plan.stream.length : 0;
  const fraction = (ayah.number - 1 + within) / TOTAL_AYAHS;
  el.progressFill.style.width = `${(fraction * 100).toFixed(3)}%`;
  const pct = fraction * 100;
  const percent = pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.floor(pct);
  el.progressLabel.textContent =
    `${surah.englishName} · Ayah ${ayah.numberInSurah} of ${surah.ayahs.length}` +
    ` · Juz ${ayah.juz} · ${percent}% of the Quran`;
}

// ---- Typing ---------------------------------------------------------------

function handleKey(ch) {
  if (busy) {
    heldKeys.push(ch);
    return;
  }
  if (!plan) return;
  if (waiting) {
    // Letters typed after the end wait for Enter; nudge the reader.
    if (!isForgivable(ch)) nudgeContinue();
    return;
  }
  countTime();
  startRecitation();
  enterFocus();

  const expected = plan.stream[state.pos];
  if (expected && matches(expected.ch, ch)) {
    state.pos++;
    missed = false;
  } else if (expected && !isForgivable(ch)) {
    missed = true;
  }

  el.hint.classList.add("gone");
  updateTyping();
  updateProgress();
  save();
  if (state.pos >= plan.stream.length) finishAyah();
}

function finishAyah() {
  state.ayatTyped++;
  if (ayah.numberInSurah === surah.ayahs.length && !state.surahsDone.includes(surah.number)) {
    state.surahsDone.push(surah.number);
  }
  if (ayah.number === TOTAL_AYAHS) state.khatamMs = state.typingMs;
  save();
  showFinished();
  if (state.autoContinue) {
    busy = true;
    setTimeout(moveOn, 700);
  } else {
    waiting = true;
    el.continueButton.hidden = false;
  }
}

// The ayah number fills with gold.
const showFinished = () => el.current.classList.add("finished");

function nudgeContinue() {
  el.continueButton.classList.remove("nudge");
  void el.continueButton.offsetWidth;
  el.continueButton.classList.add("nudge");
}

function moveOn() {
  if (ayah.number === TOTAL_AYAHS) {
    waiting = true;
    showStatus(`Alhamdulillah, you have typed the whole Quran in ${formatLong(state.khatamMs ?? state.typingMs)}.`);
    return;
  }
  waiting = false;
  busy = true;
  el.continueButton.hidden = true;
  moveIntoTrail().then(nextAyah);
}

function nextAyah() {
  if (ayah.numberInSurah < surah.ayahs.length) loadAyah(surah.number, ayah.numberInSurah + 1);
  else loadAyah(surah.number + 1, 1);
}

// ---- Finished ayat trail ------------------------------------------------------

// Finished ayat collect below the one being typed, newest first. The
// finished ayah glides down into its place there before the next appears.
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

function moveIntoTrail() {
  const item = makeTrailItem();
  item.classList.add("landing");
  el.trail.prepend(item);
  while (el.trail.children.length > TRAIL_LENGTH) el.trail.lastElementChild.remove();

  const from = el.current.getBoundingClientRect();
  const to = item.getBoundingClientRect();
  const done = () => {
    el.current.classList.add("moved");
    item.classList.remove("landing");
  };
  if (reducedMotion.matches || !el.current.animate) {
    done();
    return Promise.resolve();
  }

  // A copy of the finished ayah flies down and shrinks into the trail.
  const ghost = el.current.cloneNode(true);
  ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  ghost.removeAttribute("id");
  ghost.classList.add("ghost");
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
  });
  document.body.append(ghost);
  el.current.classList.add("moved");

  const scale = Math.min(1, Math.max(0.45, to.height / from.height));
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top - from.top;
  const flight = ghost.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.55 },
    ],
    { duration: 620, easing: "cubic-bezier(.5, 0, .2, 1)", fill: "forwards" },
  );
  return flight.finished.then(() => {
    item.classList.remove("landing");
    const fade = ghost.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
    return fade.finished.then(() => {
      ghost.remove();
      done();
    });
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
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (!waiting) return;
  countTime();
  moveOn();
});
el.continueButton.addEventListener("click", () => {
  if (waiting) moveOn();
  focusTyping();
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
  const onControl = document.activeElement?.closest("button, select, input");
  if (e.key === "Enter" && waiting && !onControl) {
    e.preventDefault();
    moveOn();
    return;
  }
  if (e.key.length !== 1) return;
  if (onControl && e.key === " ") return;
  focusTyping();
});

// Focus mode: the header and footer fade while typing and come back when
// the mouse moves or the screen is touched outside the text.
const enterFocus = () => document.body.classList.add("focus");
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
  audio.src = ayah.audio;
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
}
["play", "pause", "ended", "emptied", "error"].forEach((ev) => audio.addEventListener(ev, updatePlayButton));

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

// ---- My progress --------------------------------------------------------------

el.timerButton.addEventListener("click", async () => {
  el.statTime.textContent = formatClock(liveTypingMs());
  el.statAyat.textContent = state.ayatTyped.toLocaleString();
  el.statSurahs.textContent = state.surahsDone.length;
  el.statNote.textContent = state.khatamMs
    ? `You typed the whole Quran in ${formatLong(state.khatamMs)}.`
    : state.startedOn
      ? `Counting since ${new Date(state.startedOn).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}. The clock pauses after ${PAUSE_MS / 1000} seconds without typing.`
      : "The clock starts with your first keystroke and pauses when you stop typing.";
  el.resetButton.textContent = "Start a new khatam";
  el.resetButton.dataset.armed = "";
  el.surahTimes.replaceChildren();
  el.stats.showModal();

  const typed = Object.keys(state.surahMs).map(Number).sort((a, b) => a - b);
  if (!typed.length) return;
  let names = [];
  try {
    names = await getSurahList();
  } catch {
    // Names are a nicety; numbers alone still read fine.
  }
  const rows = typed.map((n) => {
    const row = document.createElement("div");
    row.className = "surah-time";
    const name = document.createElement("span");
    name.textContent = `${n}. ${names[n - 1]?.englishName ?? "Surah " + n}`;
    const time = document.createElement("span");
    time.className = "surah-time-value";
    time.textContent = formatClock(state.surahMs[n]);
    if (state.surahsDone.includes(n)) {
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
    el.resetButton.textContent = "Tap again to clear your time and start at Al-Fatihah";
    return;
  }
  Object.assign(state, {
    surah: 1,
    ayah: 1,
    pos: 0,
    typingMs: 0,
    surahMs: {},
    surahsDone: [],
    ayatTyped: 0,
    startedOn: null,
    khatamMs: null,
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

el.settingsButton.addEventListener("click", () => {
  el.setTranslation.value = state.translation;
  el.setReciter.value = state.reciter;
  el.setAutoplay.checked = state.autoplay;
  el.setAutoContinue.checked = state.autoContinue;
  el.setSkipBrackets.checked = state.skipBrackets;
  el.setTheme.value = state.theme;
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
el.setTheme.addEventListener("change", () => {
  state.theme = el.setTheme.value;
  applyTheme();
  save();
});

// ---- Go to surah ------------------------------------------------------------

el.surahButton.addEventListener("click", async () => {
  el.jump.showModal();
  try {
    const list = await getSurahList();
    if (el.jumpSurah.options.length !== list.length) {
      el.jumpSurah.replaceChildren(
        ...list.map((s) => new Option(`${s.number}. ${s.englishName} (${s.englishNameTranslation})`, s.number)),
      );
    }
    el.jumpSurah.value = state.surah;
    el.jumpAyah.value = state.ayah;
    el.jumpAyah.max = list[state.surah - 1].numberOfAyahs;
  } catch {
    el.jump.close();
    showStatus("Couldn't load the list of surahs.");
  }
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
  if (state.pos > 0 || state.surah > 1 || state.ayah > 1) {
    el.hint.textContent = "Welcome back. Carry on typing from where you stopped.";
  }
  updateTimer();
  loadAyah(state.surah, state.ayah, state.pos);
  focusTyping();
}

applyTheme();
if (state.translation && TRANSLATIONS.some((t) => t.id === state.translation)) begin();
else showWelcome();
