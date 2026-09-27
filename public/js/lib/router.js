// Hash-Routing (#/bestand, #/joints/<id> …) an einer Stelle, damit es sich
// austauschen lässt (die Demo-Vorschau nutzt eine Variante im Speicher).

export const router = {
  current: () => location.hash,
  go(hash) {
    location.hash = hash;
  },
  /** Adresse ändern, ohne neu zu rendern. */
  replace(hash) {
    history.replaceState(null, '', hash);
  },
  /** Ziel aus einer Benachrichtigung öffnen, z. B. „/#/joints/123“. */
  open(url) {
    const target = new URL(url, location.origin);
    if (target.origin === location.origin) location.hash = target.hash || '#/';
    else location.href = target.href;
  },
  onChange(fn) {
    window.addEventListener('hashchange', fn);
  },
};
