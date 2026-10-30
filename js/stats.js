// Anonymous usage counts for the /pentadbir page: a visit, each ayah typed,
// each surah finished. Nothing that identifies a person is sent, and nothing
// is sent at all with Do Not Track or Global Privacy Control on, or in ?debug.

const URL = "/api/hit";
const off =
  navigator.doNotTrack === "1" ||
  navigator.globalPrivacyControl === true ||
  new URLSearchParams(location.search).has("debug");

// A first visit is one with no saved progress yet. Read before the app saves anything.
let isNew = true;
try {
  isNew = !localStorage.getItem("qurantype:v1");
} catch {
  // Storage blocked: counted as new.
}

function send(event) {
  if (off) return;
  const body = JSON.stringify(event);
  try {
    if (navigator.sendBeacon?.(URL, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

function device() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  if (!coarse) return "computer";
  return Math.min(screen.width, screen.height) < 600 ? "phone" : "tablet";
}

function referrer() {
  try {
    const host = new window.URL(document.referrer).hostname;
    return host === location.hostname ? null : host;
  } catch {
    return null;
  }
}

export const trackVisit = () =>
  send({ t: "visit", new: isNew, device: device(), lang: (navigator.language || "").split("-")[0], ref: referrer() });

// The reader's settings, once they have picked a translation.
export const trackPrefs = (state) => send({ t: "prefs", tr: state.translation, rc: state.reciter, audio: state.autoplay });

export const trackAyah = (surah, words, ms) => send({ t: "ayah", s: surah, w: words, ms: Math.round(ms) });

export const trackSurah = (surah, wpm, accuracy) => send({ t: "surah", s: surah, wpm, acc: accuracy });

export const trackKhatam = () => send({ t: "khatam" });
