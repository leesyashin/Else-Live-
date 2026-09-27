// Kleines Template-System: html`…` escaped alle eingesetzten Werte automatisch.
// Nur was mit raw() oder html`…` erzeugt wurde, wird unverändert übernommen.

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHtml(String(value));

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

// false/null/undefined → nichts (für `${bedingung && …}`), true → "true" (für data-Attribute).
function toHtml(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value === true) return 'true';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export const when = (condition, render) => (condition ? render() : '');

// ---------------------------------------------------------------------------
// Formatierung (deutsch)

const nf2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export const fmtNum = (n) => nf2.format(n ?? 0);
export const fmtG = (n) => `${nf2.format(n ?? 0)} g`;
export const fmtPct = (n) => (n === null || n === undefined ? '–' : `${nf1.format(n)} %`);
export const fmtInt = (n) => nf0.format(n ?? 0);

/** Menge THC in mg: Gramm × THC-% × 10. */
export const thcMg = (grams, thc) => (thc ? grams * thc * 10 : 0);

export function parseNum(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Wert für ein Eingabefeld: 0.5 → „0,5“. */
export const inputNum = (n) => (n === null || n === undefined || Number.isNaN(n) ? '' : nf2.format(n).replace(/\./g, ''));

const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });

export function relTime(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return 'gerade eben';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
  return fmtDate(iso);
}

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dayLabel(iso) {
  const day = startOfDay(new Date(iso)).getTime();
  const today = startOfDay().getTime();
  if (day === today) return 'Heute';
  if (day === today - 86400000) return 'Gestern';
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Hallo';
  if (h < 22) return 'Guten Abend';
  return 'Gute Nacht';
}
