import { Demo, skills, skillGenutzt } from './daten.js';
import { Glas } from './glas.js';
import { haptik, haptikAktiv } from './haptik.js';
import { GitHub, titelAusBranch } from './github.js';
import { lesen, schreiben } from './speicher.js';

// ---------- Zustand ----------

const einst = {
  glas: true,
  neigung: false,
  haptik: true,
  live: false,
  token: '',
  repos: '',
  ...lesen('kapsel.einstellungen', {}),
};
const speichereEinst = () => schreiben('kapsel.einstellungen', einst);

const demo = new Demo();
const glas = new Glas(document.getElementById('glas'));
const z = {
  route: { seite: 'sessions' },
  inselOffen: false,
  offeneDetails: new Set(),
  entwurf: lesen('kapsel.entwurf', {}),
  haeltGerade: false,
  archivOffen: false,
};
const live = { laden: false, fehler: null, prs: [], branches: [], zuletzt: 0, ich: null };

const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
const ansicht = $('#ansicht');

const STATUS = {
  arbeitet: { name: 'Arbeitet', farbe: 'blau' },
  frage: { name: 'Frage wartet', farbe: 'orange' },
  pr: { name: 'PR fertig', farbe: 'gruen' },
  ruhig: { name: 'Bereit', farbe: 'grau' },
  archiviert: { name: 'Archiviert', farbe: 'grau' },
};

function h(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// `code` und **fett** in Claude-Texten.
function textMitCode(text) {
  return h(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

function vor(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'jetzt';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

function zaehle() {
  const n = { arbeitet: 0, frage: 0, pr: 0, ruhig: 0 };
  for (const s of demo.sessions) n[s.status] = (n[s.status] ?? 0) + 1;
  return n;
}

function gesamtStatus() {
  const n = zaehle();
  if (n.frage) return 'frage';
  if (n.arbeitet) return 'arbeitet';
  if (n.pr) return 'pr';
  return 'ruhig';
}

// ---------- Symbole ----------

const ICON = {
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><g transform="rotate(-38 16 16)"><rect x="2.5" y="10.25" width="27" height="11.5" rx="5.75" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="23.5" cy="16" r="2.7" fill="currentColor"/></g></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  zweig: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="5.5" r="2.2"/><circle cx="7" cy="18.5" r="2.2"/><circle cx="17" cy="8" r="2.2"/><path d="M7 7.7v8.6M17 10.2c0 4-10 3-10 6"/></g></svg>',
  sessions: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h11A3.5 3.5 0 0 1 23 6.5v8a3.5 3.5 0 0 1-3.5 3.5H12l-5 4.5V18h0A2 2 0 0 1 5 16z" fill="currentColor"/></svg>',
  prs: '<svg viewBox="0 0 28 28" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="8" cy="6.5" r="2.6"/><circle cx="8" cy="21.5" r="2.6"/><circle cx="20" cy="21.5" r="2.6"/><path d="M8 9.1v9.8M20 18.9V11a3.5 3.5 0 0 0-3.5-3.5H13"/><path d="m15.5 4.8-2.7 2.7 2.7 2.7"/></g></svg>',
  einstellungen: '<svg viewBox="0 0 28 28" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12.2 2.5h3.6l.6 3a8.6 8.6 0 0 1 2.2 1.3l2.9-1 1.8 3.1-2.3 2a8.7 8.7 0 0 1 0 2.6l2.3 2-1.8 3.1-2.9-1a8.6 8.6 0 0 1-2.2 1.3l-.6 3h-3.6l-.6-3a8.6 8.6 0 0 1-2.2-1.3l-2.9 1-1.8-3.1 2.3-2a8.7 8.7 0 0 1 0-2.6l-2.3-2L5.6 5.8l2.9 1a8.6 8.6 0 0 1 2.2-1.3zM14 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8"/></svg>',
  zurueck: '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  senden: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  haken: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  kreuz: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  frage: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M8 12v.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  pr: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="4.5" cy="3.5" r="1.6"/><circle cx="4.5" cy="12.5" r="1.6"/><circle cx="11.5" cy="12.5" r="1.6"/><path d="M4.5 5.1v5.8M11.5 10.9V6.5a2 2 0 0 0-2-2H7.5"/></g></svg>',
  aktualisieren: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function statusSymbol(status) {
  if (status === 'arbeitet') return '<span class="symbol arbeitet"><span class="ring"></span></span>';
  if (status === 'frage') return `<span class="symbol frage">${ICON.frage}</span>`;
  if (status === 'pr') return `<span class="symbol pr">${ICON.pr}</span>`;
  if (status === 'archiviert') return `<span class="symbol archiviert">${ICON.haken}</span>`;
  return '<span class="symbol ruhig"></span>';
}

// ---------- Insel (Dynamic Island) ----------

const insel = $('#insel');
let inselMeldung = null;
let inselMeldungTimer = null;

function renderInsel() {
  const n = zaehle();
  let inhalt;
  if (inselMeldung) {
    insel.dataset.zustand = inselMeldung.status;
    inhalt = `<div class="insel-meldung">${statusSymbol(inselMeldung.status)}<div><b>${h(inselMeldung.titel)}</b><span>${h(inselMeldung.text)}</span></div></div>`;
  } else if (z.inselOffen) {
    insel.dataset.zustand = gesamtStatus();
    const gruppen = ['frage', 'arbeitet', 'pr']
      .map((st) => {
        const liste = demo.sessions.filter((s) => s.status === st);
        if (!liste.length) return '';
        return `<div class="insel-gruppe"><div class="insel-ueber">${STATUS[st].name}</div>${liste
          .map((s) => `<button class="insel-zeile" data-aktion="oeffnen" data-sid="${s.id}">${statusSymbol(st)}<span>${h(s.titel)}</span><small>${s.pr ? '#' + s.pr.nummer : vor(s.geaendert)}</small></button>`)
          .join('')}</div>`;
      })
      .join('');
    inhalt = `<div class="insel-offen">${gruppen || '<div class="insel-leer">Keine aktive Session</div>'}</div>`;
  } else {
    const haupt = gesamtStatus();
    insel.dataset.zustand = haupt;
    const text = {
      frage: n.frage > 1 ? `${n.frage} Fragen warten` : 'Frage wartet',
      arbeitet: n.arbeitet > 1 ? `${n.arbeitet} arbeiten` : 'Arbeitet',
      pr: n.pr > 1 ? `${n.pr} PRs fertig` : 'PR fertig',
      ruhig: 'Alles ruhig',
    }[haupt];
    const nebenbei = ['frage', 'arbeitet', 'pr']
      .filter((st) => st !== haupt && n[st])
      .map((st) => `<span class="zahl ${STATUS[st].farbe}" title="${STATUS[st].name}">${n[st]}</span>`)
      .join('');
    inhalt = `<div class="insel-kompakt">${statusSymbol(haupt)}<span class="insel-text">${text}</span>${nebenbei ? `<span class="insel-zahlen">${nebenbei}</span>` : ''}</div>`;
  }
  insel.setAttribute('aria-expanded', String(z.inselOffen));
  const innen = $('.insel-innen', insel);
  if (innen.innerHTML !== inhalt) {
    innen.innerHTML = inhalt;
    inselGroesse();
  }
}

function inselGroesse() {
  const innen = $('.insel-innen', insel);
  const kind = innen.firstElementChild;
  if (!kind) return;
  // Kompakt so breit wie der Inhalt; dafür erst ohne feste Breite messen.
  innen.style.width = 'max-content';
  const breit = z.inselOffen || inselMeldung ? Math.min(innerWidth - 24, 380) : Math.max(126, Math.min(innerWidth - 120, kind.offsetWidth));
  innen.style.width = breit + 'px';
  insel.style.width = breit + 'px';
  insel.style.height = Math.max(37, kind.scrollHeight) + 'px';
}

function inselMelden(meldung) {
  inselMeldung = meldung;
  clearTimeout(inselMeldungTimer);
  renderInsel();
  insel.classList.remove('stoss');
  void insel.offsetWidth;
  insel.classList.add('stoss');
  inselMeldungTimer = setTimeout(() => {
    inselMeldung = null;
    renderInsel();
  }, 2600);
}

function inselUmschalten() {
  haptik('leicht');
  inselMeldung = null;
  z.inselOffen = !z.inselOffen;
  renderInsel();
}

insel.addEventListener('click', (e) => {
  e.stopPropagation();
  const zeile = e.target.closest('[data-aktion="oeffnen"]');
  if (!zeile) return inselUmschalten();
  z.inselOffen = false;
  renderInsel();
  gehe(`#/session/${zeile.dataset.sid}`);
});
insel.addEventListener('keydown', (e) => {
  if (e.target === insel && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    inselUmschalten();
  }
});

document.addEventListener('click', (e) => {
  if (z.inselOffen && !insel.contains(e.target)) {
    z.inselOffen = false;
    renderInsel();
  }
});

// ---------- Banner ----------

const banner = $('#banner');
let bannerTimer = null;

function zeigeBanner({ status, titel, text, sid }) {
  banner.dataset.zustand = status;
  banner.dataset.sid = sid ?? '';
  banner.innerHTML = `${statusSymbol(status)}<div><b>${h(titel)}</b><span>${h(text)}</span></div><small>jetzt</small>`;
  banner.hidden = false;
  banner.classList.remove('weg');
  requestAnimationFrame(() => banner.classList.add('da'));
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(bannerWeg, 4200);
}

function bannerWeg() {
  banner.classList.remove('da');
  banner.classList.add('weg');
  setTimeout(() => {
    if (banner.classList.contains('weg')) banner.hidden = true;
  }, 350);
}

banner.addEventListener('click', () => {
  const sid = banner.dataset.sid;
  bannerWeg();
  if (sid) gehe(sid.startsWith('live:') ? '#/prs' : `#/session/${sid}`);
});

// Nach oben wischen schließt das Banner.
let bannerStartY = null;
banner.addEventListener('touchstart', (e) => (bannerStartY = e.touches[0].clientY), { passive: true });
banner.addEventListener('touchend', (e) => {
  if (bannerStartY != null && bannerStartY - e.changedTouches[0].clientY > 20) bannerWeg();
  bannerStartY = null;
});

// Eine Statusänderung: Insel, Banner, Haptik.
function benachrichtigen(e) {
  const status = e.nach === 'archiviert' ? 'pr' : e.nach;
  inselMelden({ status, titel: e.titel, text: e.text });
  const hierSchon = z.route.seite === 'session' && z.route.sid === e.sid;
  if (!hierSchon) zeigeBanner({ status, titel: e.titel, text: e.text, sid: e.sid });
  haptik(e.nach === 'frage' ? 'warnung' : e.nach === 'archiviert' || e.nach === 'pr' ? 'erfolg' : 'meldung');
}

// ---------- Navigation ----------

function leseRoute() {
  const teile = location.hash.replace(/^#\/?/, '').split('/');
  if (teile[0] === 'session' && demo.finde(teile[1])) return { seite: 'session', sid: teile[1] };
  if (teile[0] === 'prs') return { seite: 'prs' };
  if (teile[0] === 'einstellungen') return { seite: 'einstellungen' };
  return { seite: 'sessions' };
}

function gehe(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

addEventListener('hashchange', () => {
  const vorher = z.route;
  z.route = leseRoute();
  z.inselOffen = false;
  renderAlles(true, vorher);
});

function renderTabs() {
  const n = zaehle();
  const tab = z.route.seite === 'session' ? 'sessions' : z.route.seite;
  const livePRs = einst.live ? live.prs.filter((p) => p.ci === 'gruen' && p.zustand === 'offen').length : 0;
  const badge = { sessions: n.frage, prs: einst.live ? livePRs : n.pr, einstellungen: 0 };
  const namen = { sessions: 'Sessions', prs: 'PRs', einstellungen: 'Einstellungen' };
  $('#tabs').innerHTML = Object.keys(namen)
    .map(
      (t) => `<a href="#/${t}" class="tab${t === tab ? ' aktiv' : ''}"${t === tab ? ' aria-current="page"' : ''}>${ICON[t]}${badge[t] ? `<span class="badge">${badge[t]}</span>` : ''}<span>${namen[t]}</span></a>`,
    )
    .join('');
  document.body.classList.toggle('ohne-tabs', z.route.seite === 'session');
}

// ---------- Seiten ----------

function seitenKopf(titel, rechts = '') {
  return `<header class="navleiste"></header><div class="titelzeile"><h1 class="grosstitel"><span class="marke">${ICON.logo}</span>${h(titel)}</h1>${rechts}</div>`;
}

// Leerer Zustand: blasses Zeichen in der Mitte, Titel, Satz, optional ein Knopf.
function leer(titel, text = '', knopf = '') {
  return `<div class="leer-zustand"><span class="leer-zeichen">${ICON.logo}</span><b>${h(titel)}</b>${text ? `<p>${h(text)}</p>` : ''}${knopf}</div>`;
}

function sessionZeile(s) {
  const letzte = [...s.verlauf].reverse().find((e) => e.typ === 'claude' || e.typ === 'frage');
  const vorschau = s.status === 'frage' ? s.verlauf.findLast((e) => e.typ === 'frage')?.text : letzte?.text;
  const pr = s.pr ? `<span class="pr-marke ${s.pr.ci}">#${s.pr.nummer}${s.pr.ci === 'laeuft' ? ` · ${s.pr.fertig}/${s.pr.gesamt}` : ''}</span>` : '';
  return `<a class="zeile" href="#/session/${s.id}">${statusSymbol(s.status)}<div class="zeile-text"><div class="zeile-kopf"><b>${h(s.titel)}</b><small>${vor(s.geaendert)}</small></div><div class="zeile-meta">${h(s.repo.split('/')[1])} · ${h(s.branch.replace(/^claude\//, ''))} ${pr}</div><div class="zeile-vorschau">${textMitCode(vorschau ?? '')}</div></div></a>`;
}

function seiteSessions() {
  const gruppen = [
    ['frage', 'Frage wartet'],
    ['arbeitet', 'Arbeitet'],
    ['pr', 'PR fertig'],
    ['ruhig', 'Bereit'],
  ];
  let html = seitenKopf('Kapsel', '<span class="hinweis-chip">Beispieldaten</span>');
  for (const [st, name] of gruppen) {
    const liste = demo.sessions.filter((s) => s.status === st);
    if (!liste.length) continue;
    html += `<section class="gruppe"><h2>${name}</h2><div class="liste">${liste.map(sessionZeile).join('')}</div></section>`;
  }
  if (!demo.sessions.length) html += leer('Keine aktiven Sessions', 'Neue Cloud-Sessions erscheinen hier, sobald sie laufen.');
  if (demo.archiv.length) {
    html += `<section class="gruppe"><button class="h2-knopf" data-aktion="archiv" aria-expanded="${z.archivOffen}">Archiviert · ${demo.archiv.length}</button>${
      z.archivOffen ? `<div class="liste">${demo.archiv.map(sessionZeile).join('')}</div>` : ''
    }</section>`;
  }
  return html;
}

function halteText(klasse) {
  return `<span class="halten-text${klasse}"${klasse ? ' aria-hidden="true"' : ''}><b>Halten zum Mergen</b><small>Squash · Branch löschen · Session archivieren</small></span>`;
}

// PR-Karte; quelle 'demo' (Session) oder 'live' (GitHub).
function prKarte(pr, { sid, quelle = 'demo', repo, fertig = true } = {}) {
  const schluessel = quelle === 'live' ? `live:${repo}#${pr.nummer}` : sid;
  if (!pr) {
    return `<div class="karte prkarte"><div class="pr-zeile"><span class="pr-icon">${ICON.pr}</span><div><b>Noch kein PR</b><small>${fertig ? 'Claude ist fertig und kann den PR erstellen.' : 'Claude arbeitet noch; der PR kann trotzdem schon erstellt werden.'}</small></div></div><button class="knopf voll" data-aktion="pr-erstellen" data-sid="${sid}">PR erstellen</button></div>`;
  }
  const ci = {
    laeuft: `<span class="ci laeuft"><span class="ring"></span>CI läuft · ${pr.fertig}/${pr.gesamt}</span>`,
    gruen: `<span class="ci gruen">${ICON.haken}CI grün${pr.gesamt ? ` · ${pr.gesamt}/${pr.gesamt}` : ''}</span>`,
    rot: `<span class="ci rot">${ICON.kreuz}CI rot${pr.rot?.length ? ' · ' + h(pr.rot.slice(0, 2).join(', ')) : ''}</span>`,
    keine: '<span class="ci keine">Keine CI eingerichtet</span>',
  }[pr.ci];
  let unten;
  if (pr.zustand === 'mergt' || pr.zustand === 'gemergt') {
    const schritte = ['Squash-Merge', 'Branch gelöscht', quelle === 'live' ? 'Session-Archiv folgt (Schnittstelle in Prüfung)' : 'Session archiviert'];
    unten = `<ol class="schritte">${schritte
      .map((t, i) => {
        const fertigt = pr.schritt > i;
        const aktuell = pr.schritt === i && pr.zustand === 'mergt';
        return `<li class="${fertigt ? 'fertig' : aktuell ? 'aktuell' : ''}">${fertigt ? ICON.haken : aktuell ? '<span class="ring"></span>' : '<span class="punkt"></span>'}${t}</li>`;
      })
      .join('')}</ol>`;
  } else if (pr.konflikt) {
    unten = '<div class="pr-hinweis rot">Merge-Konflikt. Claude muss den Branch erst aktualisieren.</div>';
  } else if (pr.ci === 'gruen' || pr.ci === 'keine') {
    unten = `<button class="halten" data-halten="${h(schluessel)}" aria-label="Gedrückt halten zum Mergen mit Squash"><span class="fuellung"></span>${halteText('')}${halteText(' ueber')}</button>`;
  } else if (pr.ci === 'rot') {
    unten = '<div class="pr-hinweis rot">Die CI ist rot. Claude repariert, dann geht es weiter.</div>';
  } else {
    unten = '<div class="pr-hinweis">Mergen geht, sobald die CI grün ist.</div>';
  }
  const link = quelle === 'live' && pr.url ? `<a class="pr-link" href="${h(pr.url)}" target="_blank" rel="noopener">GitHub</a>` : '';
  return `<div class="karte prkarte" data-ci="${pr.ci}"><div class="pr-zeile"><span class="pr-icon">${ICON.pr}</span><div><b>#${pr.nummer} ${h(pr.titel)}</b><small>${ci}</small></div>${link}</div>${unten}</div>`;
}

function verlaufHtml(s) {
  const teile = [];
  let werkzeuge = [];
  const werkzeugGruppe = () => {
    if (!werkzeuge.length) return;
    const liste = werkzeuge;
    werkzeuge = [];
    const zeile = (t) =>
      `<details class="werkzeug" data-id="${t.id}"${z.offeneDetails.has(t.id) ? ' open' : ''}><summary><span class="w-punkt ${t.ok ? '' : 'rot'}"></span><b>${h(t.name)}</b><code>${h(t.kurz)}</code></summary><pre>${h(t.aus)}</pre></details>`;
    if (liste.length === 1) {
      teile.push(zeile(liste[0]));
      return;
    }
    const gid = 'g' + liste[0].id;
    const namen = [...new Set(liste.map((t) => t.name))].join(', ');
    teile.push(
      `<details class="werkzeuge" data-id="${gid}"${z.offeneDetails.has(gid) ? ' open' : ''}><summary><span class="w-punkt"></span><b>${liste.length} Tool-Aufrufe</b><span class="w-namen">${h(namen)}</span></summary><div class="w-liste">${liste.map(zeile).join('')}</div></details>`,
    );
  };
  for (const e of s.verlauf) {
    if (e.typ === 'tool') {
      werkzeuge.push(e);
      continue;
    }
    werkzeugGruppe();
    if (e.typ === 'nutzer') teile.push(`<div class="nachricht nutzer"><span class="prompt">&gt;</span>${h(e.text)}</div>`);
    else if (e.typ === 'claude') teile.push(`<div class="nachricht claude"><span class="claude-punkt"></span><div>${textMitCode(e.text)}</div></div>`);
    else if (e.typ === 'frage') {
      const offen = e.antwort == null && s.status === 'frage';
      teile.push(
        `<div class="karte frage-karte${offen ? ' offen' : ''}"><div class="frage-kopf">${statusSymbol('frage')}<b>${h(e.text)}</b></div><div class="optionen">${e.optionen
          .map(
            (o, i) =>
              `<button class="option${e.antwort === i ? ' gewaehlt' : ''}" data-aktion="antwort" data-sid="${s.id}" data-eid="${e.id}" data-i="${i}"${offen ? '' : ' disabled'}>${h(o)}</button>`,
          )
          .join('')}</div></div>`,
      );
    }
  }
  werkzeugGruppe();
  if (s.status === 'arbeitet' && s.plan.length) teile.push('<div class="tippt"><span></span><span></span><span></span></div>');
  return teile.join('');
}

const SKILL_SYMBOL = {
  review: ['#1d6bf3', '<circle cx="12" cy="12" r="3"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/>'],
  commit: ['#16a34a', '<circle cx="12" cy="12" r="4"/><path d="M2 12h6M16 12h6"/>'],
  test: ['#e5484d', '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>'],
  'code-review': ['#8e4ec6', '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>'],
  simplify: ['#e93d82', '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>'],
  'security-review': ['#f76b15', '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z"/>'],
  init: ['#0d9488', '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>'],
  loop: ['#6e56cf', '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>'],
};

function skillLeiste() {
  return skills()
    .map((s) => {
      const [farbe, pfad] = SKILL_SYMBOL[s.name] ?? ['#8a8a8a', '<path d="M5 12h14"/>'];
      return `<button class="skill" data-aktion="skill" data-name="${h(s.name)}"><svg viewBox="0 0 24 24" aria-hidden="true" style="color:${farbe}"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${pfad}</g></svg>${h(s.name)}</button>`;
    })
    .join('');
}

function seiteSession(s) {
  const archiviert = s.status === 'archiviert';
  return `
    <header class="navleiste mit-zurueck">
      <a class="zurueck" href="#/sessions" aria-label="Zurück zu den Sessions">${ICON.zurueck}</a>
    </header>
    <div class="session-kopf">
      <h1>${h(s.titel)}</h1>
      <div class="session-meta"><span id="kopfstatus" class="status-chip ${STATUS[s.status].farbe}">${STATUS[s.status].name}</span><span>${h(s.repo)}</span><span class="mono">${h(s.branch)}</span></div>
    </div>
    <div id="prbereich">${prKarte(s.pr, { sid: s.id, fertig: s.fertig })}</div>
    <div id="verlauf" class="verlauf">${verlaufHtml(s)}</div>
    ${
      archiviert
        ? ''
        : `<div class="eingabe-bereich">
      <div class="skill-leiste" id="skills" role="toolbar" aria-label="Skills, die häufigsten zuerst">${skillLeiste()}</div>
      <form class="eingabe" data-sid="${s.id}">
        <textarea rows="1" placeholder="Frag Claude (Cloud-Session)" aria-label="Nachricht an Claude">${h(z.entwurf[s.id] ?? '')}</textarea>
        <div class="eingabe-zeile">
          <button type="button" class="rund" data-aktion="schraegstrich" aria-label="Skill einfügen">${ICON.plus}</button>
          <span class="pille-klein">${ICON.zweig}${h(s.repo.split('/')[1])}</span>
          <button type="submit" class="senden" aria-label="Senden">${ICON.senden}</button>
        </div>
      </form>
    </div>`
    }`;
}

function aktualisiereSession(s) {
  if (!s) return;
  const chip = $('#kopfstatus');
  if (chip) {
    chip.className = `status-chip ${STATUS[s.status].farbe}`;
    chip.textContent = STATUS[s.status].name;
  }
  if (!z.haeltGerade) {
    const pb = $('#prbereich');
    const neu = prKarte(s.pr, { sid: s.id, fertig: s.fertig });
    if (pb && pb.innerHTML !== neu) pb.innerHTML = neu;
  }
  const v = $('#verlauf');
  if (v) {
    const unten = scrollY + innerHeight >= document.documentElement.scrollHeight - 80;
    const neu = verlaufHtml(s);
    if (v.innerHTML !== neu) {
      v.innerHTML = neu;
      if (unten) scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  }
  if (s.status === 'archiviert') $('.eingabe-bereich')?.remove();
}

function seitePRs() {
  const knopf = einst.live ? `<button class="nav-knopf" data-aktion="live-laden" aria-label="Aktualisieren">${ICON.aktualisieren}</button>` : '<span class="hinweis-chip">Beispieldaten</span>';
  let html = seitenKopf('Pull Requests', knopf);
  if (einst.live) return html + livePRsHtml();
  const mitPR = demo.sessions.filter((s) => s.pr);
  const ohnePR = demo.sessions.filter((s) => !s.pr && s.fertig);
  if (mitPR.length) {
    html += `<section class="gruppe"><h2>Offen</h2>${mitPR
      .map((s) => `<a class="pr-session" href="#/session/${s.id}">${h(s.titel)} <small>${h(s.repo)}</small></a>${prKarte(s.pr, { sid: s.id })}`)
      .join('')}</section>`;
  }
  if (ohnePR.length) {
    html += `<section class="gruppe"><h2>Bereit für einen PR</h2>${ohnePR
      .map((s) => `<a class="pr-session" href="#/session/${s.id}">${h(s.titel)} <small>${h(s.repo)}</small></a>${prKarte(null, { sid: s.id })}`)
      .join('')}</section>`;
  }
  const gemergt = demo.archiv.filter((s) => s.pr?.zustand === 'gemergt');
  if (gemergt.length) {
    html += `<section class="gruppe"><h2>Gemergt</h2><div class="liste">${gemergt
      .map((s) => `<a class="zeile" href="#/session/${s.id}">${statusSymbol('archiviert')}<div class="zeile-text"><div class="zeile-kopf"><b>#${s.pr.nummer} ${h(s.pr.titel)}</b></div><div class="zeile-meta">${h(s.repo)} · Branch gelöscht · archiviert</div></div></a>`)
      .join('')}</div></section>`;
  }
  if (!mitPR.length && !ohnePR.length && !gemergt.length) html += leer('Keine PRs', 'Ist eine Session fertig, erstellt Claude hier den PR.');
  return html;
}

function livePRsHtml() {
  if (!einst.token || !repoListe().length) {
    return leer('Mit GitHub verbinden', 'Trag einen Token und mindestens ein Repo ein, dann stehen hier deine echten PRs.', '<a class="knopf hell" href="#/einstellungen">' + ICON.plus + 'Token eintragen</a>');
  }
  let html = '';
  if (live.fehler) html += `<div class="karte fehler">${h(live.fehler)}</div>`;
  if (live.laden && !live.prs.length) html += '<p class="leer"><span class="ring"></span> Lade von GitHub …</p>';
  if (live.prs.length) {
    html += `<section class="gruppe"><h2>Offen</h2>${live.prs
      .map((p) => `<div class="pr-session">${h(p.repo)} <small class="mono">${h(p.branch)}</small></div>${prKarte(p, { quelle: 'live', repo: p.repo })}`)
      .join('')}</section>`;
  }
  if (live.branches.length) {
    html += `<section class="gruppe"><h2>Claude-Branches ohne PR</h2>${live.branches
      .map(
        (b) =>
          `<div class="karte prkarte"><div class="pr-zeile"><span class="pr-icon">${ICON.pr}</span><div><b>${h(titelAusBranch(b.name))}</b><small class="mono">${h(b.repo)} · ${h(b.name)}</small></div></div><button class="knopf voll" data-aktion="live-pr" data-repo="${h(b.repo)}" data-branch="${h(b.name)}">PR erstellen</button></div>`,
      )
      .join('')}</section>`;
  }
  if (!live.laden && !live.fehler && !live.prs.length && !live.branches.length) html += leer('Alles gemergt', 'Keine offenen PRs und keine Claude-Branches.');
  if (live.zuletzt) html += `<p class="fussnote">Stand ${new Date(live.zuletzt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · aktualisiert alle 30 s</p>`;
  return html;
}

function schalter(name, an, titel, text = '', deaktiviert = false) {
  return `<label class="einstellung"><div><b>${titel}</b>${text ? `<small>${text}</small>` : ''}</div><input type="checkbox" switch class="schalter" data-einst="${name}"${an ? ' checked' : ''}${deaktiviert ? ' disabled' : ''}></label>`;
}

function seiteEinstellungen() {
  const neigungMoeglich = 'DeviceOrientationEvent' in window;
  return `${seitenKopf('Einstellungen')}
    <section class="gruppe"><h2>Darstellung</h2><div class="liste">
      ${schalter('glas', einst.glas, '3D-Hintergrund', 'Schwebende Glasformen, 60 fps, folgen dem Session-Status.')}
      ${schalter('neigung', einst.neigung, 'Auf Neigung reagieren', neigungMoeglich ? 'Nutzt den Bewegungssensor des iPhones.' : 'Dieses Gerät meldet keine Neigung.', !neigungMoeglich || !einst.glas)}
      ${schalter('haptik', einst.haptik, 'Haptik', 'Bei Statuswechseln und beim Mergen.')}
    </div><p class="fussnote">Hell und Dunkel folgen dem System.</p></section>
    <section class="gruppe"><h2>GitHub</h2><div class="liste">
      <label class="feld"><b>Token</b><input type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…" data-feld="token" value="${h(einst.token)}"></label>
      <label class="feld"><b>Repos</b><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="besitzer/repo, besitzer/repo2" data-feld="repos" value="${h(einst.repos)}"></label>
      ${schalter('live', einst.live, 'PR-Tab live von GitHub', 'Echte PRs, CI-Stand, Squash-Merge und Branch löschen.', !einst.token)}
      <button class="zeile-knopf" data-aktion="verbindung">Verbindung prüfen</button>
    </div><p class="fussnote" id="verbindung-ergebnis">Fine-grained Token mit Contents und Pull requests (lesen und schreiben), Checks und Commit statuses (lesen). Er bleibt auf diesem Gerät und geht nur an api.github.com.</p></section>
    <section class="gruppe"><h2>Vorbehalt</h2><div class="karte text">
      <p>Die GitHub-Seite (PR, CI, Merge, Branch löschen) läuft echt, sobald ein Token eingetragen ist.</p>
      <p>Ob eine fremde App den Live-Status der Cloud-Sessions und die Skills von claude.ai/code auslesen und Sessions archivieren darf, ist noch nicht geprüft. Sessions, Fragen und Skills sind darum Beispieldaten.</p>
    </div></section>
    <section class="gruppe"><div class="liste"><button class="zeile-knopf rot" data-aktion="zuruecksetzen">Beispieldaten neu starten</button></div></section>`;
}

let letzteSeite = null;

function renderAnsicht(voll, vorher) {
  const r = z.route;
  const schluessel = r.seite + (r.sid ?? '');
  if (!voll && schluessel === letzteSeite) {
    // Teil-Aktualisierung: Eingaben und Fokus bleiben erhalten.
    if (r.seite === 'session') return aktualisiereSession(demo.finde(r.sid));
    if (r.seite === 'einstellungen' || z.haeltGerade) return;
    ansicht.innerHTML = r.seite === 'prs' ? seitePRs() : seiteSessions();
    return;
  }
  letzteSeite = schluessel;
  ansicht.innerHTML = r.seite === 'session' ? seiteSession(demo.finde(r.sid)) : r.seite === 'prs' ? seitePRs() : r.seite === 'einstellungen' ? seiteEinstellungen() : seiteSessions();
  ansicht.className = 'ansicht ' + (r.seite === 'session' ? 'rein' : vorher?.seite === 'session' ? 'raus' : 'ein');
  if (r.seite === 'session') {
    scrollTo(0, document.documentElement.scrollHeight);
    eingabeHoehe($('.eingabe textarea'));
  } else scrollTo(0, 0);
  beobachteTitel();
}

function renderAlles(voll = false, vorher) {
  renderInsel();
  renderTabs();
  renderAnsicht(voll, vorher);
  glas.setzeStatus(gesamtStatus());
}

// Kleine Navigationsleiste zeigt den Titel, sobald der große Titel wegscrollt.
let titelBeobachter = null;
function beobachteTitel() {
  titelBeobachter?.disconnect();
  const gross = $('.grosstitel, .session-kopf h1');
  const leiste = $('.navleiste');
  if (!gross || !leiste) return;
  titelBeobachter = new IntersectionObserver(([e]) => leiste.classList.toggle('kompakt', !e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' });
  titelBeobachter.observe(gross);
}

// ---------- Aktionen ----------

ansicht.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-aktion]');
  if (!el) return;
  const aktion = el.dataset.aktion;
  if (aktion === 'antwort') {
    haptik('leicht');
    demo.antworten(el.dataset.sid, el.dataset.eid, Number(el.dataset.i));
  } else if (aktion === 'pr-erstellen') {
    haptik('leicht');
    demo.prErstellen(el.dataset.sid);
  } else if (aktion === 'skill') {
    haptik('leicht');
    const feld = $('.eingabe textarea');
    if (!feld) return;
    const rest = feld.value.replace(/^\/[\w-]+\s*/, '');
    feld.value = `/${el.dataset.name} ${rest}`;
    feld.focus();
    feld.setSelectionRange(feld.value.length, feld.value.length);
    entwurfMerken(feld);
  } else if (aktion === 'schraegstrich') {
    const feld = $('.eingabe textarea');
    if (!feld.value.startsWith('/')) feld.value = '/' + feld.value;
    feld.focus();
    entwurfMerken(feld);
  } else if (aktion === 'archiv') {
    z.archivOffen = !z.archivOffen;
    renderAnsicht(false);
  } else if (aktion === 'zuruecksetzen') {
    location.hash = '#/sessions';
    location.reload();
  } else if (aktion === 'verbindung') {
    await verbindungPruefen();
  } else if (aktion === 'live-laden') {
    haptik('leicht');
    await liveLaden();
  } else if (aktion === 'live-pr') {
    await livePRErstellen(el.dataset.repo, el.dataset.branch, el);
  }
});

// Offen/zu der eingeklappten Tool-Aufrufe merken, damit Aktualisierungen sie nicht schließen.
ansicht.addEventListener(
  'toggle',
  (e) => {
    const id = e.target.dataset?.id;
    if (!id) return;
    if (e.target.open) z.offeneDetails.add(id);
    else z.offeneDetails.delete(id);
  },
  true,
);

function entwurfMerken(feld) {
  const sid = feld.closest('form')?.dataset.sid;
  if (!sid) return;
  z.entwurf[sid] = feld.value;
  schreiben('kapsel.entwurf', z.entwurf);
  eingabeHoehe(feld);
}

function eingabeHoehe(feld) {
  if (!feld) return;
  feld.style.height = 'auto';
  feld.style.height = Math.min(feld.scrollHeight, 140) + 'px';
}

ansicht.addEventListener('input', (e) => {
  if (e.target.matches('.eingabe textarea')) entwurfMerken(e.target);
  if (e.target.dataset.feld) {
    einst[e.target.dataset.feld] = e.target.value.trim();
    speichereEinst();
    const liveSchalter = $('[data-einst="live"]');
    if (liveSchalter) liveSchalter.disabled = !einst.token;
  }
});

ansicht.addEventListener('keydown', (e) => {
  if (e.target.matches('.eingabe textarea') && e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});

ansicht.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const feld = $('textarea', form);
  const text = feld.value.trim();
  if (!text) return;
  const skill = text.match(/^\/([\w-]+)/)?.[1];
  if (skill) skillGenutzt(skill);
  haptik('leicht');
  demo.senden(form.dataset.sid, text);
  feld.value = '';
  entwurfMerken(feld);
  const leiste = $('#skills');
  if (leiste && skill) leiste.innerHTML = skillLeiste();
  scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
});

ansicht.addEventListener('change', async (e) => {
  const name = e.target.dataset.einst;
  if (!name) return;
  const an = e.target.checked;
  if (name === 'neigung' && an) {
    const erlaubt = await neigungErlauben();
    if (!erlaubt) {
      e.target.checked = false;
      return;
    }
  }
  einst[name] = an;
  speichereEinst();
  haptik('leicht');
  einstellungenAnwenden();
  if (name === 'glas') {
    const neigung = $('[data-einst="neigung"]');
    if (neigung) neigung.disabled = !an || !('DeviceOrientationEvent' in window);
  }
  if (name === 'live') {
    if (an) liveLaden();
    renderTabs();
  }
});

// ---------- Halten zum Mergen ----------

const HALTEDAUER = 900;
let halten = null;

function halteStart(el, e) {
  if (halten) return;
  e?.preventDefault?.();
  z.haeltGerade = true;
  haptik('leicht');
  halten = { el, start: performance.now(), raf: 0 };
  el.classList.add('haelt');
  const schritt = (jetzt) => {
    if (!halten) return;
    const p = Math.min(1, (jetzt - halten.start) / HALTEDAUER);
    el.style.setProperty('--p', p.toFixed(3));
    if (p >= 1) return halteFertig();
    halten.raf = requestAnimationFrame(schritt);
  };
  halten.raf = requestAnimationFrame(schritt);
}

function halteEnde() {
  if (!halten) return;
  cancelAnimationFrame(halten.raf);
  halten.el.classList.remove('haelt');
  halten.el.style.setProperty('--p', '0');
  halten = null;
  z.haeltGerade = false;
}

function halteFertig() {
  const el = halten.el;
  cancelAnimationFrame(halten.raf);
  halten = null;
  z.haeltGerade = false;
  el.classList.remove('haelt');
  el.classList.add('ausgeloest');
  haptik('erfolg');
  const schluessel = el.dataset.halten;
  if (schluessel.startsWith('live:')) liveMergen(schluessel);
  else demo.mergen(schluessel);
}

ansicht.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-halten]');
  if (!el || e.button > 0) return;
  el.setPointerCapture?.(e.pointerId);
  halteStart(el, e);
});
for (const art of ['pointerup', 'pointercancel', 'lostpointercapture']) ansicht.addEventListener(art, halteEnde);
ansicht.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-halten]')) e.preventDefault();
});
ansicht.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('[data-halten]');
  if (el && (e.key === ' ' || e.key === 'Enter') && !e.repeat) halteStart(el, e);
});
ansicht.addEventListener('keyup', (e) => {
  if (e.target.closest?.('[data-halten]') && (e.key === ' ' || e.key === 'Enter')) halteEnde();
});

// ---------- GitHub live ----------

function repoListe() {
  return einst.repos
    .split(/[\s,]+/)
    .map((r) => r.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''))
    .filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r));
}

async function verbindungPruefen() {
  const ziel = $('#verbindung-ergebnis');
  if (!einst.token) {
    ziel.textContent = 'Kein Token eingetragen.';
    return;
  }
  ziel.textContent = 'Prüfe …';
  try {
    const gh = new GitHub(einst.token);
    const ich = await gh.ich();
    const repos = repoListe();
    const ergebnisse = await Promise.all(repos.map((r) => gh.repo(r).then((d) => `${r} ✓${d.permissions?.push ? '' : ' (nur lesen)'}`, (f) => `${r} ✗ ${f.message}`)));
    ziel.textContent = `Angemeldet als ${ich.login}. ${ergebnisse.join(' · ') || 'Noch kein Repo eingetragen.'}`;
    haptik('erfolg');
  } catch (f) {
    ziel.textContent = `Fehler: ${f.message}`;
    haptik('warnung');
  }
}

async function liveLaden() {
  if (!einst.live || !einst.token || live.laden) return;
  live.laden = true;
  if (z.route.seite === 'prs') renderAnsicht(false);
  const gh = new GitHub(einst.token);
  try {
    const vorher = new Map(live.prs.map((p) => [`${p.repo}#${p.nummer}`, p]));
    const prs = [];
    const branches = [];
    for (const repo of repoListe()) {
      const [offen, alleBranches, info] = await Promise.all([gh.offenePRs(repo), gh.branches(repo), gh.repo(repo)]);
      const heads = new Set(offen.map((p) => p.head.ref));
      for (const b of alleBranches) {
        if (b.name.startsWith('claude/') && !heads.has(b.name)) branches.push({ repo, name: b.name, base: info.default_branch });
      }
      for (const p of offen) {
        const [detail, ci] = await Promise.all([gh.pr(repo, p.number), gh.ci(repo, p.head.sha)]);
        const alt = vorher.get(`${repo}#${p.number}`);
        prs.push({
          repo,
          nummer: p.number,
          titel: p.title,
          branch: p.head.ref,
          sha: p.head.sha,
          url: p.html_url,
          eigenerBranch: p.head.repo?.full_name === repo,
          konflikt: detail.mergeable_state === 'dirty',
          zustand: alt?.zustand === 'mergt' ? 'mergt' : 'offen',
          schritt: alt?.schritt ?? 0,
          ...ci,
        });
        if (alt && alt.ci !== 'gruen' && ci.ci === 'gruen') {
          benachrichtigen({ sid: `live:${repo}#${p.number}`, nach: 'pr', titel: 'PR fertig', text: `#${p.number} ${p.title} · CI grün` });
        } else if (alt && alt.ci !== 'rot' && ci.ci === 'rot') {
          benachrichtigen({ sid: `live:${repo}#${p.number}`, nach: 'frage', titel: 'CI rot', text: `#${p.number} ${p.title}` });
        }
      }
    }
    live.prs = prs;
    live.branches = branches;
    live.fehler = null;
    live.zuletzt = Date.now();
  } catch (f) {
    live.fehler = `GitHub: ${f.message}`;
  } finally {
    live.laden = false;
    renderTabs();
    if (z.route.seite === 'prs') renderAnsicht(false);
  }
}

async function livePRErstellen(repo, branch, knopf) {
  const b = live.branches.find((x) => x.repo === repo && x.name === branch);
  if (!b) return;
  knopf.disabled = true;
  knopf.textContent = 'Erstelle …';
  try {
    const gh = new GitHub(einst.token);
    const pr = await gh.prErstellen(repo, { titel: titelAusBranch(branch), head: branch, base: b.base, text: 'Erstellt aus Kapsel.' });
    haptik('erfolg');
    zeigeBanner({ status: 'arbeitet', titel: 'PR erstellt', text: `#${pr.number} ${pr.title} · CI läuft`, sid: `live:${repo}#${pr.number}` });
    await liveLaden();
  } catch (f) {
    knopf.disabled = false;
    knopf.textContent = 'PR erstellen';
    zeigeBanner({ status: 'frage', titel: 'PR nicht erstellt', text: f.message });
    haptik('warnung');
  }
}

async function liveMergen(schluessel) {
  const [, repo, nummer] = schluessel.match(/^live:(.+)#(\d+)$/) ?? [];
  const pr = live.prs.find((p) => p.repo === repo && p.nummer === Number(nummer));
  if (!pr) return;
  const gh = new GitHub(einst.token);
  pr.zustand = 'mergt';
  pr.schritt = 0;
  renderAnsicht(false);
  try {
    // Stand frisch prüfen: nur der grüne, geprüfte Commit wird gemergt.
    const ci = await gh.ci(repo, pr.sha);
    if (ci.ci !== 'gruen' && ci.ci !== 'keine') throw new Error('Die CI ist nicht mehr grün.');
    await gh.squashMerge(repo, pr.nummer, pr.sha);
    pr.schritt = 1;
    renderAnsicht(false);
    if (pr.eigenerBranch) await gh.branchLoeschen(repo, pr.branch);
    pr.schritt = 2;
    pr.zustand = 'gemergt';
    renderAnsicht(false);
    benachrichtigen({ sid: schluessel, nach: 'archiviert', titel: 'Gemergt', text: `#${pr.nummer} · Branch ${pr.eigenerBranch ? 'gelöscht' : 'liegt im Fork'}` });
    setTimeout(() => {
      live.prs = live.prs.filter((p) => p !== pr);
      renderTabs();
      if (z.route.seite === 'prs') renderAnsicht(false);
    }, 2500);
  } catch (f) {
    pr.zustand = 'offen';
    renderAnsicht(false);
    zeigeBanner({ status: 'frage', titel: 'Merge fehlgeschlagen', text: f.message, sid: schluessel });
    haptik('warnung');
  }
}

setInterval(() => {
  if (einst.live && !document.hidden) liveLaden();
}, 30_000);

// ---------- Neigung ----------

let neigungAktiv = false;

async function neigungErlauben() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    try {
      return (await D.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return !!D;
}

function beiNeigung(e) {
  if (e.beta == null || e.gamma == null) return;
  // Hochkant gehalten liegt beta um 55°; das ist die Ruhelage.
  glas.setzeNeigung(e.gamma / 30, (e.beta - 55) / 30);
}

function beiZeiger(e) {
  if (neigungAktiv || e.pointerType === 'touch') return;
  glas.setzeNeigung((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
}

function einstellungenAnwenden() {
  haptikAktiv(einst.haptik);
  if (einst.glas) {
    if (!glas.starten()) document.documentElement.classList.remove('mit-glas');
  } else glas.stoppen();
  const neigung = einst.glas && einst.neigung;
  if (neigung && !neigungAktiv) addEventListener('deviceorientation', beiNeigung);
  if (!neigung && neigungAktiv) {
    removeEventListener('deviceorientation', beiNeigung);
    glas.setzeNeigung(0, 0);
  }
  neigungAktiv = neigung;
}

addEventListener('pointermove', beiZeiger, { passive: true });

// ---------- Tastatur auf dem iPhone ----------

if (window.visualViewport) {
  const anpassen = () => {
    const vv = visualViewport;
    const unten = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--tastatur', unten + 'px');
  };
  visualViewport.addEventListener('resize', anpassen);
  visualViewport.addEventListener('scroll', anpassen);
}

// ---------- Start ----------

demo.on((e) => {
  if (e.art === 'status') benachrichtigen(e);
  renderInsel();
  renderTabs();
  renderAnsicht(false);
  glas.setzeStatus(gesamtStatus());
});

addEventListener('resize', inselGroesse);
document.addEventListener('visibilitychange', () => (document.hidden ? demo.stop() : demo.start()));

// Zeitangaben ("vor 3 min") frisch halten.
setInterval(() => {
  if (z.route.seite === 'sessions' && !z.haeltGerade) renderAnsicht(false);
}, 30_000);

z.route = leseRoute();
einstellungenAnwenden();
renderAlles(true);
demo.start();
if (einst.live) liveLaden();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
