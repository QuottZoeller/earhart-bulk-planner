// Thin localStorage wrapper. Every key the app touches is namespaced under
// "ebp:" so export/import and "clear my data" can enumerate exactly our data
// without disturbing anything else that might share the origin.
const PREFIX = 'ebp:';

export function getItem(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function removeItem(key) {
  localStorage.removeItem(PREFIX + key);
}

export function allKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
  }
  return keys;
}

export function dumpAll() {
  const out = {};
  for (const key of allKeys()) {
    out[key] = getItem(key, null);
  }
  return out;
}

export function restoreAll(obj) {
  for (const [key, value] of Object.entries(obj)) {
    setItem(key, value);
  }
}

export function clearAll() {
  for (const key of allKeys()) {
    removeItem(key);
  }
}
