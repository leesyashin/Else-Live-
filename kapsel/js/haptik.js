// Haptik im Browser. Android kennt navigator.vibrate. iOS kennt es nicht,
// löst aber seit iOS 18 beim Umschalten eines <input type="checkbox" switch>
// die System-Haptik aus. Dafür liegt ein unsichtbarer Schalter im Dokument.
// Safari erlaubt das zuverlässig nur in einer Nutzer-Geste; Meldungen aus dem
// Hintergrund bleiben auf dem iPhone darum manchmal still.

let schalter = null;
export let aktiv = true;

export function haptikAktiv(an) {
  aktiv = an;
}

function iosSchalter() {
  if (schalter) return schalter;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10px;top:-10px';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.append(input);
  document.body.append(label);
  schalter = label;
  return label;
}

function tick() {
  iosSchalter().click();
}

// art: 'leicht' (Tippen), 'meldung' (Statuswechsel), 'erfolg' (Merge), 'warnung'
export function haptik(art = 'leicht') {
  if (!aktiv) return;
  const muster = { leicht: 8, meldung: [12, 60, 12], erfolg: [10, 50, 10, 50, 20], warnung: [30, 80, 30] }[art] ?? 8;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(muster);
    return;
  }
  const anzahl = Array.isArray(muster) ? Math.ceil(muster.length / 2) : 1;
  for (let i = 0; i < anzahl; i++) setTimeout(tick, i * 90);
}
