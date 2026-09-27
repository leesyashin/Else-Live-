// HTTP-Aufrufe und die Live-Verbindung (Server-Sent Events).

import { setConnection, setOnline, setState, store } from './store.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export async function request(method, url, body) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (store.token) headers.authorization = `Bearer ${store.token}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && store.token) onUnauthorized();
    throw new ApiError(res.status, data.error || `Fehler ${res.status}`);
  }
  return data;
}

/** Aktion ausführen – die Antwort enthält immer den neuen Gesamtzustand. */
export async function act(method, url, body) {
  const data = await request(method, url, body);
  if (data.state) setState(data.state);
  return data.result;
}

// Mehrere Änderungs-Events kurz hintereinander → höchstens ein Abruf gleichzeitig.
let inFlight = null;
let again = false;

export function refresh() {
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = request('GET', '/api/state')
    .then(setState)
    .finally(() => {
      inFlight = null;
      if (again) {
        again = false;
        refresh().catch(() => {});
      }
    });
  return inFlight;
}

// ---------------------------------------------------------------------------
// Live

let source = null;
let retryTimer = null;

function isNewer(event) {
  const current = store.state;
  return !current || event.boot !== current.boot || event.rev > current.rev;
}

export function connectLive({ onNotes }) {
  disconnectLive();
  if (!store.token) return;
  setConnection('connecting');

  source = new EventSource(`/api/events?token=${encodeURIComponent(store.token)}`);
  source.addEventListener('open', () => setConnection('live'));
  source.addEventListener('hello', (e) => {
    if (isNewer(JSON.parse(e.data))) refresh().catch(() => {});
  });
  source.addEventListener('change', (e) => {
    const data = JSON.parse(e.data);
    if (isNewer(data)) refresh().catch(() => {});
    if (data.notes?.length) onNotes(data.notes);
  });
  source.addEventListener('presence', (e) => setOnline(JSON.parse(e.data).online));
  source.addEventListener('error', () => {
    setConnection('connecting');
    // Bei einem harten Fehler (z. B. 401) versucht EventSource es nicht erneut.
    if (source?.readyState === EventSource.CLOSED) scheduleRetry(onNotes);
  });
}

function scheduleRetry(onNotes) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    refresh()
      .then(() => connectLive({ onNotes }))
      .catch((err) => {
        if (err.status === 401) return; // Abmeldung übernimmt onUnauthorized
        setConnection('offline');
        scheduleRetry(onNotes);
      });
  }, 5000);
}

export function disconnectLive() {
  clearTimeout(retryTimer);
  source?.close();
  source = null;
  setConnection('offline');
}
