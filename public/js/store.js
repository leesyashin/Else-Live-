// Globaler Client-Zustand: der letzte Stand vom Server plus ein paar Abfragen.

const TOKEN_KEY = 'else-live.token';

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* privater Modus o. Ä. – dann eben ohne Merken */
  }
}

export const store = {
  token: readStorage(TOKEN_KEY),
  meta: null,
  state: null,
  connection: 'offline',
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

export function setToken(token) {
  store.token = token;
  writeStorage(TOKEN_KEY, token);
}

export function setState(next) {
  const current = store.state;
  if (current && next.boot === current.boot && next.rev < current.rev) return;
  store.state = next;
  emit();
}

export function setOnline(online) {
  if (!store.state) return;
  store.state.online = online;
  emit();
}

export function setConnection(status) {
  if (store.connection === status) return;
  store.connection = status;
  emit();
}

/** Kleine Geräte-Vorlieben (letzter Tabak, Filter …). */
export const prefs = {
  get(key, fallback) {
    try {
      const value = readStorage(`else-live.${key}`);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    writeStorage(`else-live.${key}`, JSON.stringify(value));
  },
};

// ---------------------------------------------------------------------------
// Abfragen

const S = () => store.state;

export const me = () => S()?.me ?? null;
export const settings = () => S()?.settings ?? {};
export const members = () => S()?.members ?? [];
export const member = (id) => members().find((m) => m.id === id) ?? null;
export const strain = (id) => S()?.strains.find((s) => s.id === id) ?? null;
export const joint = (id) => S()?.joints.find((j) => j.id === id) ?? null;
export const requestById = (id) => S()?.requests.find((r) => r.id === id) ?? null;
export const isOnline = (id) => Boolean(S()?.online?.includes(id));
export const onlineCount = () => S()?.online?.length ?? 0;

const byName = (a, b) => a.name.localeCompare(b.name, 'de');
const newestFirst = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

export const activeStrains = () => (S()?.strains ?? []).filter((s) => !s.archived).sort(byName);
export const archivedStrains = () => (S()?.strains ?? []).filter((s) => s.archived).sort(byName);
export const stockTotal = () => activeStrains().reduce((sum, s) => sum + s.grams, 0);

export function stockLevel(s) {
  if (s.grams <= 0.0005) return 'empty';
  if (s.grams <= (settings().lowStockGrams ?? 2)) return 'low';
  return 'ok';
}

export const jointsNewest = () => [...(S()?.joints ?? [])].sort(newestFirst);
export const activeJoints = () => jointsNewest().filter((j) => j.status !== 'done');

export function jointThcMg(j) {
  return j.components.reduce((sum, c) => sum + c.grams * (strain(c.strainId)?.thc ?? 0) * 10, 0);
}

export const jointStrainNames = (j) => j.components.map((c) => strain(c.strainId)?.name ?? 'Unbekannt').join(' + ');

/** Kosten eines Joints in Euro – null, wenn für keine Sorte ein Preis hinterlegt ist. */
export function jointCost(j) {
  let known = false;
  let sum = 0;
  for (const c of j.components) {
    const price = strain(c.strainId)?.pricePerGram;
    if (price == null) continue;
    known = true;
    sum += c.grams * price;
  }
  return known ? sum : null;
}

/** Wert des aktuellen Bestands (nur Sorten mit Preis). */
export const stockValue = () =>
  activeStrains().reduce((sum, s) => (s.pricePerGram == null ? sum : sum + s.grams * s.pricePerGram), 0);

export const requestsNewest = () => [...(S()?.requests ?? [])].sort(newestFirst);

const isOpen = (r) => r.status === 'open' || r.status === 'accepted';

/** Offene Anfragen, die ich erfüllen könnte: direkt an mich oder an alle. */
export function incomingRequests() {
  const myId = me()?.id;
  return requestsNewest().filter((r) => isOpen(r) && r.fromId !== myId && (r.toId === myId || r.toId === null));
}

export const outgoingRequests = () => requestsNewest().filter((r) => isOpen(r) && r.fromId === me()?.id);
export const closedRequests = () => requestsNewest().filter((r) => !isOpen(r));

/** Mein Zug gerade? Dann ist das der brennende Joint. */
export function jointWithMyTurn() {
  const myId = me()?.id;
  return activeJoints().find(
    (j) => j.status === 'lit' && j.rotation.some((r) => r.position === j.turn && r.memberId === myId),
  );
}
