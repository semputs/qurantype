// Quran text, translations and recitation from Al Quran Cloud
// (https://alquran.cloud). Free, no key needed; credit required.

const API = "https://api.alquran.cloud/v1";

export const TRANSLATIONS = [
  { id: "ms.basmeih", label: "Bahasa Melayu", by: "Abdullah Muhammad Basmeih" },
  { id: "en.sahih", label: "English", by: "Saheeh International" },
  { id: "id.indonesian", label: "Bahasa Indonesia", by: "Kementerian Agama RI" },
];

export const RECITERS = [
  { id: "ar.alafasy", label: "Mishary Rashid Alafasy" },
  { id: "ar.abdurrahmaansudais", label: "Abdurrahmaan As-Sudais" },
  { id: "ar.husary", label: "Mahmoud Khalil Al-Husary" },
  { id: "ar.minshawi", label: "Mohamed Siddiq Al-Minshawi" },
  { id: "ar.mahermuaiqly", label: "Maher Al Muaiqly" },
];

export const TOTAL_AYAHS = 6236;

const ARABIC_EDITION = "quran-uthmani";

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const body = await res.json();
  if (body.code !== 200) throw new Error(body.data || "Unexpected response");
  return body.data;
}

let surahListPromise;
/** The 114 surahs: [{ number, name, englishName, englishNameTranslation, numberOfAyahs }] */
export function getSurahList() {
  surahListPromise ??= getJSON(`${API}/surah`).catch((err) => {
    surahListPromise = undefined;
    throw err;
  });
  return surahListPromise;
}

// Surah 1 counts the basmalah as its first ayah and surah 9 has none. For
// every other surah the Uthmani text of ayah 1 starts with the basmalah,
// which we show as a heading instead of as part of the ayah.
const BASMALAH_WORDS = 4;
const strip = (s) => s.normalize("NFD").replace(/[ً-ٰٟۖ-ۭـ]/g, "");
function splitBasmalah(surah, ayah, text) {
  if (surah === 1 || surah === 9 || ayah !== 1) return text;
  const words = text.replace(/^﻿/, "").split(" ");
  if (!strip(words[0]).startsWith("بسم")) return text;
  return words.slice(BASMALAH_WORDS).join(" ");
}

const surahCache = new Map();
/**
 * One surah with the Arabic text, the chosen translation and audio URLs.
 * Returns { number, name, englishName, ayahs: [{ number, numberInSurah,
 * juz, arabic, translation, audio }] }.
 */
export function getSurah(number, translation, reciter) {
  const key = `${number}|${translation}|${reciter}`;
  if (!surahCache.has(key)) {
    const editions = [ARABIC_EDITION, translation, reciter].join(",");
    const promise = getJSON(`${API}/surah/${number}/editions/${editions}`).then(
      ([ar, tr, audio]) => ({
        number: ar.number,
        name: ar.name,
        englishName: ar.englishName,
        englishNameTranslation: ar.englishNameTranslation,
        ayahs: ar.ayahs.map((a, i) => ({
          number: a.number,
          numberInSurah: a.numberInSurah,
          juz: a.juz,
          arabic: splitBasmalah(ar.number, a.numberInSurah, a.text),
          translation: tr.ayahs[i].text,
          audio: audio.ayahs[i].audio,
        })),
      }),
    );
    promise.catch(() => surahCache.delete(key));
    surahCache.set(key, promise);
  }
  return surahCache.get(key);
}
