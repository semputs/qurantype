import { TRANSLATIONS, RECITERS, TOTAL_AYAHS, getSurah, getSurahList } from "./api.js";
import { buildPlan, matches, filledUpTo, isForgivable } from "./typing.js";

const $ = (id) => document.getElementById(id);
const el = {
  page: $("page"),
  surahButton: $("surah-button"),
  surahName: $("surah-name"),
  play: $("play-button"),
  settingsButton: $("settings-button"),
  basmalah: $("basmalah"),
  arabic: $("arabic"),
  typing: $("typing"),
  translation: $("translation"),
  catcher: $("catcher"),
  hint: $("hint"),
  status: $("status"),
  progressFill: $("progress-fill"),
  progressLabel: $("progress-label"),
  welcome: $("welcome"),
  welcomeChoices: $("welcome-choices"),
  settings: $("settings"),
  setTranslation: $("set-translation"),
  setReciter: $("set-reciter"),
  setAutoplay: $("set-autoplay"),
  setTheme: $("set-theme"),
  jump: $("jump"),
  jumpSurah: $("jump-surah"),
  jumpAyah: $("jump-ayah"),
};

// ---- Saved state ---------------------------------------------------------

const STORE_KEY = "qurantype:v1";
const DEFAULTS = {
  translation: null,
  reciter: RECITERS[0].id,
  autoplay: true,
  theme: "auto",
  surah: 1,
  ayah: 1,
  pos: 0,
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

// ---- Current ayah ---------------------------------------------------------

let surah = null; // the loaded surah
let ayah = null; // the ayah being typed
let plan = null; // typing plan for its translation
let spans = [];
let missed = false;
let busy = false; // between ayat: keys are held and replayed once the next one shows
let heldKeys = [];
let loadToken = 0;

const arabicDigits = new Intl.NumberFormat("ar-EG", { useGrouping: false });

async function loadAyah(surahNumber, ayahNumber, pos = 0) {
  const token = ++loadToken;
  busy = true;
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
    plan = buildPlan(ayah.translation);
    missed = false;
    state.surah = surah.number;
    state.ayah = ayah.numberInSurah;
    state.pos = Math.min(pos, plan.stream.length);
    save();
    render();
    fadeIn();

    busy = false;
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

// Fade the old ayah out and the new one in.
const fading = () => [el.arabic, el.translation, el.basmalah];
function fadeOut() {
  if (!el.arabic.textContent) return Promise.resolve();
  fading().forEach((p) => p.classList.add("leaving"));
  return new Promise((resolve) => setTimeout(resolve, 280));
}
function fadeIn() {
  requestAnimationFrame(() => fading().forEach((p) => p.classList.remove("leaving")));
}

function render() {
  el.surahName.textContent = `${surah.number} · ${surah.englishName}`;
  el.basmalah.hidden = !(ayah.numberInSurah === 1 && surah.number !== 1 && surah.number !== 9);

  el.arabic.textContent = ayah.arabic + " ";
  const mark = document.createElement("span");
  mark.className = "ayah-mark";
  mark.textContent = arabicDigits.format(ayah.numberInSurah);
  el.arabic.append(mark);

  el.translation.classList.remove("complete");
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
    cl.toggle("cur", i === cur);
    cl.toggle("miss", i === cur && missed);
  }
}

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
  startRecitation();

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
  if (state.pos >= plan.stream.length) complete();
}

function complete() {
  busy = true;
  el.translation.classList.add("complete");
  setTimeout(nextAyah, 450);
}

function nextAyah() {
  if (ayah.numberInSurah < surah.ayahs.length) {
    loadAyah(surah.number, ayah.numberInSurah + 1);
  } else if (surah.number < 114) {
    loadAyah(surah.number + 1, 1);
  } else {
    showStatus("Alhamdulillah, you have typed the whole Quran.");
  }
}

el.catcher.addEventListener("input", (e) => {
  if (e.isComposing) return;
  for (const ch of el.catcher.value) handleKey(ch);
  el.catcher.value = "";
});
el.catcher.addEventListener("compositionend", () => {
  for (const ch of el.catcher.value) handleKey(ch);
  el.catcher.value = "";
});

const focusTyping = () => {
  if (!document.querySelector("dialog[open]")) el.catcher.focus({ preventScroll: true });
};
el.page.addEventListener("click", focusTyping);
el.catcher.addEventListener("focus", () => el.typing.classList.remove("blurred"));
el.catcher.addEventListener("blur", () => el.typing.classList.add("blurred"));

// Typing anywhere on the page goes to the ayah.
document.addEventListener("keydown", (e) => {
  if (document.activeElement === el.catcher || document.querySelector("dialog[open]")) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  if (document.activeElement?.closest("button, select, input")) {
    if (e.key === " " || e.key === "Enter") return;
  }
  focusTyping();
});

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
  el.setTheme.value = state.theme;
  el.settings.showModal();
});

el.setTranslation.addEventListener("change", () => {
  state.translation = el.setTranslation.value;
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
    loadAyah(Number(el.jumpSurah.value), ayahNumber, 0);
  }
  focusTyping();
});
el.settings.addEventListener("close", focusTyping);

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
  loadAyah(state.surah, state.ayah, state.pos);
  focusTyping();
}

applyTheme();
if (state.translation && TRANSLATIONS.some((t) => t.id === state.translation)) begin();
else showWelcome();
