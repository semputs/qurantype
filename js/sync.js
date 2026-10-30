// Sync codes: three words ("quiet white seal") that carry your progress to
// another device, through the small server in server/sync.js.

import { ADJECTIVES, COLOURS, NOUNS } from "./words.js";

const API = "/api/sync";
const CODE_KEY = "qurantype:sync";
const LISTS = [ADJECTIVES, COLOURS, NOUNS];

export function savedCode() {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

export function rememberCode(code) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    // Storage blocked: syncing still works until the page is closed.
  }
}

// "quiet-white-seal" -> "quiet white seal"
export const showCode = (code) => code.replaceAll("-", " ");

// Whatever was typed or pasted ("Quiet White  Seal", "quiet-white-seal") -> "quiet-white-seal",
// or null when it isn't three words from the lists.
export function parseCode(text) {
  const words = String(text).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length !== 3 || !words.every((w, i) => LISTS[i].includes(w))) return null;
  return words.join("-");
}

export const linkFor = (code) => `${location.origin}${location.pathname}#sync=${code}`;

// A code passed in the address (#sync=quiet-white-seal), removed from the address once read.
export function codeFromLink() {
  const match = location.hash.match(/^#sync=([a-z-]+)$/i);
  if (!match) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return parseCode(match[1]);
}

async function call(method, path, body, options = {}) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function failed(status) {
  if (status === 429) return new Error("Too many tries. Please wait a while and try again.");
  return new Error("Couldn't reach the sync server.");
}

// Makes a new code holding this state. Returns { code, savedAt }.
export async function createCode(state) {
  const { status, data } = await call("POST", "", { state });
  if (status !== 201) throw failed(status);
  return data;
}

// The progress saved under a code, { state, savedAt }, or null when there is no such code.
export async function fetchCode(code, timeout = 8000) {
  const { status, data } = await call("GET", `/${code}`, null, { signal: AbortSignal.timeout(timeout) });
  if (status === 404) return null;
  if (status !== 200) throw failed(status);
  return data;
}

// Saves state under a code. Returns { newer } when the server already holds a newer
// copy (from the other device), which should be used instead.
export async function pushState(code, state, { keepalive = false } = {}) {
  const { status, data } = await call("PUT", `/${code}`, { state, savedAt: state.savedAt }, { keepalive });
  if (status === 409) return { newer: data };
  if (status === 404) return { gone: true };
  if (status !== 200) throw failed(status);
  return {};
}
