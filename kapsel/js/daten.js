// Beispieldaten und eine kleine Simulation, damit der Prototyp lebt:
// Sessions arbeiten, stellen Fragen, die CI läuft, PRs werden fertig.
// Ob claude.ai/code den Live-Status und die Skills an eine fremde App
// herausgibt, ist noch nicht geprüft; bis dahin kommt alles von hier.

import { lesen, schreiben } from './speicher.js';

let zaehler = 0;
const neueId = () => 'e' + ++zaehler;
const minuten = (n) => Date.now() - n * 60_000;

const tool = (name, kurz, aus, ok = true) => ({ typ: 'tool', id: neueId(), name, kurz, aus, ok });
const claude = (text) => ({ typ: 'claude', id: neueId(), text });
const nutzer = (text) => ({ typ: 'nutzer', id: neueId(), text });
const frage = (text, optionen) => ({ typ: 'frage', id: neueId(), text, optionen, antwort: null });

function startSessions() {
  return [
    {
      id: 's1',
      titel: 'Dark Mode für die Einstellungen',
      repo: 'leesyashin/rezepte-app',
      branch: 'claude/dark-mode-einstellungen',
      status: 'arbeitet',
      fertig: false,
      geaendert: minuten(2),
      pr: null,
      verlauf: [
        nutzer('Die Einstellungsseite soll dem System-Theme folgen, hell und dunkel.'),
        claude('Ich sehe mir zuerst an, wie die Farben definiert sind.'),
        tool('Grep', 'color: #', '14 Treffer in 6 Dateien'),
        tool('Read', 'src/settings/Settings.css', '212 Zeilen gelesen'),
        claude('Die Farben sind fest verdrahtet. Ich ziehe sie in CSS-Variablen um und ergänze `prefers-color-scheme`.'),
        tool('Edit', 'src/settings/Settings.css', '+38 −21'),
      ],
      plan: [
        tool('Edit', 'src/theme/tokens.css', '+24 −0'),
        tool('Bash', 'npm test -- settings', '42 passed, 0 failed'),
        { aktion: 'frage', eintrag: frage('Soll der Schalter „Hell / Dunkel / System“ nur in die Einstellungen oder auch in die App-Leiste?', ['Nur Einstellungen', 'Auch in die App-Leiste']) },
        tool('Edit', 'src/settings/ThemeSwitch.tsx', '+51 −3'),
        tool('Bash', 'npm run build', 'Build in 8,4 s'),
        { aktion: 'fertig', eintrag: claude('Fertig: Die Einstellungen folgen jetzt dem System-Theme, mit Schalter für Hell, Dunkel und System. Tests und Build sind grün.') },
      ],
    },
    {
      id: 's2',
      titel: 'Flaky Test in checkout.spec',
      repo: 'leesyashin/shop',
      branch: 'claude/flaky-checkout',
      status: 'frage',
      fertig: false,
      geaendert: minuten(6),
      pr: null,
      verlauf: [
        nutzer('checkout.spec.ts schlägt in der CI ab und zu fehl. Finde raus warum.'),
        tool('Bash', 'npx vitest run checkout --repeat 20', '3 von 20 Läufen rot'),
        tool('Read', 'tests/checkout.spec.ts', '96 Zeilen gelesen'),
        tool('Grep', 'setTimeout', '2 Treffer'),
        claude('Der Test wartet auf einen echten Timer von 2 s, die CI braucht manchmal länger. Es gibt zwei saubere Wege.'),
        frage('Wie soll ich den Test reparieren?', ['Fake-Timer einsetzen (empfohlen)', 'Timeout auf 10 s erhöhen', 'Erst mal so lassen']),
      ],
      plan: [
        tool('Edit', 'tests/checkout.spec.ts', '+9 −4'),
        tool('Bash', 'npx vitest run checkout --repeat 50', '50 von 50 Läufen grün'),
        { aktion: 'fertig', eintrag: claude('Repariert: 50 von 50 Läufen sind grün. Bereit für einen PR.') },
      ],
    },
    {
      id: 's3',
      titel: 'README auf Deutsch',
      repo: 'leesyashin/else-live-',
      branch: 'claude/readme-deutsch',
      status: 'pr',
      fertig: true,
      geaendert: minuten(14),
      pr: { nummer: 42, titel: 'README auf Deutsch übersetzen', ci: 'gruen', fertig: 4, gesamt: 4, zustand: 'offen', schritt: 0 },
      verlauf: [
        nutzer('Übersetz die README ins Deutsche, Fachbegriffe bleiben.'),
        tool('Read', 'README.md', '180 Zeilen gelesen'),
        tool('Write', 'README.md', '+176 −180'),
        tool('Bash', 'git push -u origin claude/readme-deutsch', 'Branch gepusht'),
        tool('create_pull_request', '#42 README auf Deutsch übersetzen', 'PR #42 erstellt'),
        claude('PR #42 ist offen und die CI ist grün. Du kannst mergen.'),
      ],
      plan: [],
    },
    {
      id: 's4',
      titel: 'Bilder lazy laden',
      repo: 'leesyashin/rezepte-app',
      branch: 'claude/lazy-images',
      status: 'arbeitet',
      fertig: true,
      geaendert: minuten(4),
      pr: { nummer: 43, titel: 'Bilder erst beim Scrollen laden', ci: 'laeuft', fertig: 2, gesamt: 5, zustand: 'offen', schritt: 0 },
      verlauf: [
        nutzer('Die Rezeptliste lädt alle Bilder sofort. Mach das lazy.'),
        tool('Grep', '<img', '23 Treffer in 9 Dateien'),
        tool('Edit', 'src/components/RecipeCard.tsx', '+6 −2'),
        tool('Bash', 'npm test', '118 passed'),
        tool('create_pull_request', '#43 Bilder erst beim Scrollen laden', 'PR #43 erstellt'),
        claude('PR #43 ist offen. Ich warte auf die CI.'),
      ],
      plan: [],
    },
    {
      id: 's5',
      titel: 'Abhängigkeiten aktualisieren',
      repo: 'leesyashin/shop',
      branch: 'claude/deps-oktober',
      status: 'ruhig',
      fertig: true,
      geaendert: minuten(31),
      pr: null,
      verlauf: [
        nutzer('Bring die Abhängigkeiten auf den neuesten Stand, keine Major-Sprünge.'),
        tool('Bash', 'npm outdated', '11 Pakete veraltet'),
        tool('Bash', 'npm update', '11 Pakete aktualisiert'),
        tool('Bash', 'npm test', '204 passed'),
        claude('Alle 11 Pakete sind aktualisiert, die Tests laufen. Soll ich einen PR erstellen?'),
      ],
      plan: [],
    },
  ];
}

// Skills mit Nutzungszähler; die häufigsten stehen vorn in der Leiste.
const SKILLS = { review: 14, commit: 11, test: 8, 'code-review': 6, simplify: 5, 'security-review': 3, init: 2, loop: 1 };

export function skills() {
  const zaehlung = { ...SKILLS, ...lesen('kapsel.skills', {}) };
  return Object.entries(zaehlung)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, anzahl]) => ({ name, anzahl }));
}

export function skillGenutzt(name) {
  const zaehlung = { ...SKILLS, ...lesen('kapsel.skills', {}) };
  zaehlung[name] = (zaehlung[name] ?? 0) + 1;
  schreiben('kapsel.skills', zaehlung);
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

export class Demo {
  constructor() {
    this.sessions = startSessions();
    this.archiv = [];
    this.naechsterPR = 44;
    this.hoerer = new Set();
    this.takt = null;
    this.runde = 0;
  }

  on(fn) {
    this.hoerer.add(fn);
  }

  sende(ereignis) {
    for (const fn of this.hoerer) fn(ereignis);
  }

  geaendert(s) {
    if (s) s.geaendert = Date.now();
    this.sende({ art: 'aenderung', sid: s?.id });
  }

  // Status-Wechsel, die die Insel, ein Banner und Haptik auslösen.
  melde(s, status, titel, text) {
    const vorher = s.status;
    s.status = status;
    this.geaendert(s);
    this.sende({ art: 'status', sid: s.id, von: vorher, nach: status, titel, text });
  }

  finde(id) {
    return this.sessions.find((s) => s.id === id) ?? this.archiv.find((s) => s.id === id);
  }

  start() {
    if (this.takt) return;
    this.takt = setInterval(() => this.schritt(), 3800);
  }

  stop() {
    clearInterval(this.takt);
    this.takt = null;
  }

  schritt() {
    this.runde++;
    // CI-Läufe zählen hoch.
    for (const s of this.sessions) {
      const pr = s.pr;
      if (!pr || pr.ci !== 'laeuft' || this.runde % 2) continue;
      pr.fertig = Math.min(pr.gesamt, pr.fertig + 1);
      if (pr.fertig < pr.gesamt) {
        this.geaendert(s);
        continue;
      }
      pr.ci = 'gruen';
      s.verlauf.push(claude(`Die CI für PR #${pr.nummer} ist grün (${pr.gesamt}/${pr.gesamt}). Bereit zum Mergen.`));
      this.melde(s, 'pr', 'PR fertig', `#${pr.nummer} ${s.titel} · CI grün`);
    }
    // Eine arbeitende Session macht einen Schritt (der Reihe nach, damit es ruhig bleibt).
    const aktiv = this.sessions.filter((s) => s.status === 'arbeitet' && s.plan.length);
    if (!aktiv.length) return;
    const s = aktiv[this.runde % aktiv.length];
    const naechster = s.plan.shift();
    if (naechster.aktion === 'frage') {
      s.verlauf.push(naechster.eintrag);
      this.melde(s, 'frage', 'Frage wartet', s.titel);
    } else if (naechster.aktion === 'fertig') {
      s.verlauf.push(naechster.eintrag);
      s.fertig = true;
      this.melde(s, 'ruhig', 'Fertig', `${s.titel} · bereit für einen PR`);
    } else if (naechster.aktion === 'pr') {
      const nummer = this.naechsterPR++;
      s.pr = { nummer, titel: s.titel, ci: 'laeuft', fertig: 0, gesamt: 4, zustand: 'offen', schritt: 0 };
      s.verlauf.push(tool('create_pull_request', `#${nummer} ${s.titel}`, `PR #${nummer} erstellt`));
      s.verlauf.push(claude(`PR #${nummer} ist offen. Ich warte auf die CI.`));
      this.melde(s, 'arbeitet', 'PR erstellt', `#${nummer} ${s.titel} · CI läuft`);
    } else {
      s.verlauf.push(naechster);
      this.geaendert(s);
    }
  }

  antworten(sid, eintragId, index) {
    const s = this.finde(sid);
    const f = s?.verlauf.find((e) => e.id === eintragId);
    if (!f || f.antwort != null) return;
    f.antwort = index;
    s.verlauf.push(nutzer(f.optionen[index]));
    if (s.plan.length === 0) s.plan.push(claude('Alles klar, so mache ich es.'), { aktion: 'fertig', eintrag: claude('Erledigt.') });
    this.melde(s, 'arbeitet', 'Antwort gesendet', s.titel);
  }

  senden(sid, text) {
    const s = this.finde(sid);
    if (!s) return;
    s.verlauf.push(nutzer(text));
    const skill = text.match(/^\/([\w-]+)/)?.[1];
    if (skill) {
      s.plan.unshift(tool('Skill', skill, `Skill /${skill} geladen`), tool('Read', 'git diff', '4 Dateien, +127 −43'));
    } else {
      s.plan.unshift(tool('Read', 'src/', 'Kontext gelesen'));
    }
    s.plan.unshift(claude(skill ? `Ich führe /${skill} aus.` : 'Verstanden, ich kümmere mich darum.'));
    if (!s.plan.some((p) => p.aktion === 'fertig' || p.aktion === 'frage')) {
      s.plan.push({ aktion: 'fertig', eintrag: claude('Erledigt. Sag Bescheid, wenn ich einen PR erstellen soll.') });
    }
    s.status = 'arbeitet';
    this.geaendert(s);
  }

  prErstellen(sid) {
    const s = this.finde(sid);
    if (!s || s.pr) return;
    s.verlauf.push(nutzer('Erstell einen PR.'));
    s.plan.unshift(
      claude('Ich erstelle den PR.'),
      tool('Bash', `git push -u origin ${s.branch}`, 'Branch gepusht'),
      { aktion: 'pr' },
    );
    this.melde(s, 'arbeitet', 'Claude erstellt den PR', s.titel);
  }

  // Squash-Merge, Branch löschen, Session archivieren; jeder Schritt sichtbar.
  async mergen(sid) {
    const s = this.finde(sid);
    if (!s?.pr || s.pr.ci !== 'gruen' || s.pr.zustand !== 'offen') return;
    const pr = s.pr;
    pr.zustand = 'mergt';
    for (const schritt of [1, 2, 3]) {
      await warte(schritt === 1 ? 900 : 650);
      pr.schritt = schritt;
      this.geaendert(s);
    }
    await warte(500);
    pr.zustand = 'gemergt';
    s.verlauf.push(tool('merge_pull_request', `#${pr.nummer} squash`, `PR #${pr.nummer} gemergt`));
    s.verlauf.push(tool('delete_branch', s.branch, 'Branch gelöscht'));
    s.status = 'archiviert';
    this.sessions = this.sessions.filter((x) => x !== s);
    this.archiv.unshift(s);
    this.sende({ art: 'status', sid: s.id, von: 'pr', nach: 'archiviert', titel: 'Gemergt', text: `#${pr.nummer} · Branch gelöscht · Session archiviert` });
    this.geaendert(s);
  }
}
