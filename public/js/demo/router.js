// Demo: Routing im Speicher statt in der Adresszeile (die Vorschau läuft in einem Rahmen).

let hash = '#/';
const listeners = new Set();

export const router = {
  current: () => hash,
  go(next) {
    if (next === hash) return;
    hash = next;
    listeners.forEach((fn) => fn());
  },
  replace(next) {
    hash = next;
  },
  open(url) {
    const i = String(url).indexOf('#');
    router.go(i >= 0 ? url.slice(i) : '#/');
  },
  onChange(fn) {
    listeners.add(fn);
  },
};

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  event.preventDefault();
  router.go(link.getAttribute('href'));
});
