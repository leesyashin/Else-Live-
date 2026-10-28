// Recommended frontend design skills (research of 28.10.2026). Each entry
// counts as installed when a session skill's last name segment is in `matches`.

export type CatalogLink = { label: string; href: string }

export type CatalogEntry = {
  id: string
  matches: readonly string[]
  title: string
  author: string
  summary: string
  rules: readonly string[]
  references: readonly CatalogLink[]
  referenceNote: string
  install: string
  note?: string
}

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'apple-design',
    matches: ['apple-design'],
    title: 'apple-design',
    author: 'Emil Kowalski',
    summary:
      'Überträgt Apples WWDC-Talk „Designing Fluid Interfaces“ ins Web. Passt am besten zu dezent & flüssig.',
    rules: [
      'Feedback schon beim Drücken (pointer-down), nicht erst beim Loslassen',
      'Jede Animation lässt sich unterbrechen',
      'Springs statt fester Dauer: damping 1.0, Bounce nur nach einem Wisch',
      'Die Geschwindigkeit der Geste geht in die Animation über',
      'Rubber-Banding am Rand, durchscheinende Materialien per backdrop-filter',
    ],
    references: [
      {
        label: 'SKILL.md auf GitHub',
        href: 'https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md',
      },
      { label: 'Repo emilkowalski/skills', href: 'https://github.com/emilkowalski/skills' },
    ],
    referenceNote:
      'Keine Bilder: Textregeln mit konkreten Werten (Spring-Tabelle, Easing-Tokens) und Code-Beispielen.',
    install: 'github.com/emilkowalski/skills/tree/main/skills/apple-design',
  },
  {
    id: 'emil-design-eng',
    matches: ['emil-design-eng'],
    title: 'emil-design-eng',
    author: 'Emil Kowalski',
    summary: 'Handwerk für Animationen und Interaktion im Alltag einer UI.',
    rules: [
      'UI-Animationen unter 300 ms, nie ease-in, nie scale(0)',
      'Buttons geben beim Drücken nach (:active mit scale(0.97))',
      'Eigene Easing-Kurven als Tokens, prefers-reduced-motion wird beachtet',
      'Reviews kommen als Vorher/Nachher-Tabelle',
    ],
    references: [
      {
        label: 'SKILL.md auf GitHub',
        href: 'https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md',
      },
      { label: 'Repo emilkowalski/skills', href: 'https://github.com/emilkowalski/skills' },
    ],
    referenceNote: 'Textregeln mit Werten und Code-Beispielen, dazu ein Performance-Cheatsheet im Repo.',
    install: 'github.com/emilkowalski/skills/tree/main/skills/emil-design-eng',
  },
  {
    id: 'frontend-design',
    matches: ['frontend-design'],
    title: 'frontend-design',
    author: 'Anthropic',
    summary: 'Die schlanke offizielle Basis: 71 Zeilen, in fünf Minuten gelesen.',
    rules: [
      'Zuerst ein Plan: 4–6 Hex-Farben, Schriften, ASCII-Wireframe',
      'Den Plan gegen generische Standardlösungen prüfen',
      'Bauen, dann die eigenen Screenshots kritisieren',
      'Fünf typische KI-Looks meiden, z. B. Labels über jeder Überschrift, „→“ an jedem Button',
      'Motion: ein geplanter Moment statt Einblenden auf jeder Sektion',
    ],
    references: [
      {
        label: 'SKILL.md auf GitHub',
        href: 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md',
      },
    ],
    referenceNote: 'Eine einzige Textdatei. Dein Briefing („minimal, Apple-artig“) hat laut Skill Vorrang.',
    install:
      'github.com/anthropics/skills/tree/main/skills/frontend-design',
  },
  {
    id: 'make-interfaces-feel-better',
    matches: ['make-interfaces-feel-better'],
    title: 'make-interfaces-feel-better',
    author: 'Jakub Krehel',
    summary: 'Feinschliff in 19 Detailregeln. Gibt keine Designrichtung vor, macht sie aber sauber.',
    rules: [
      'Konzentrische Radien: außen = innen + Padding',
      'Optische statt geometrischer Ausrichtung',
      'Schatten für Tiefe, Rahmen für Struktur',
      'Gestaffelte Eingänge, dezente Ausgänge, kein transition: all',
      'tabular-nums, große Klickflächen, Zurückhaltung bei Motion',
    ],
    references: [
      {
        label: 'Repo jakubkrehel/make-interfaces-feel-better',
        href: 'https://github.com/jakubkrehel/make-interfaces-feel-better',
      },
    ],
    referenceNote: 'typography.md, surfaces.md, animations.md, icons.md und performance.md neben der SKILL.md.',
    install: 'github.com/jakubkrehel/make-interfaces-feel-better/tree/main/skills/make-interfaces-feel-better',
  },
  {
    id: 'design-taste-frontend',
    matches: ['design-taste-frontend', 'taste-skill'],
    title: 'Taste (v2)',
    author: 'Leonxlnx',
    summary: 'Zehnstufiger Prozess Richtung Award-Website, mit Studie von 247 Websites.',
    rules: [
      'Briefing lesen, 8–12 Fakten sammeln, die nur dieser Kunde hat',
      'Ein Skript schlägt 3 von 20 Designrichtungen vor',
      'Prüfskript öffnet die Seite bei 1440, 768 und 390 px, bis zu drei Kritik-Runden',
      'Verbietet Labels über Überschriften, Verläufe, Schatten auf ruhenden Elementen, Glas',
    ],
    references: [
      { label: 'Repo Leonxlnx/taste-skill', href: 'https://github.com/Leonxlnx/taste-skill' },
      { label: 'tasteskill.dev', href: 'https://tasteskill.dev' },
    ],
    referenceNote:
      'Zum Ansehen: examples/v2/*.webp (Screenshots), references/research.md (die Studie), tells.md, motion.md.',
    install: 'github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill',
    note: 'Schwer: 30–45 Minuten pro Durchlauf. Das Glas-Verbot widerspricht dem Apple-Look, nicht dauerhaft neben apple-design nutzen.',
  },
  {
    id: 'high-end-visual-design',
    matches: ['high-end-visual-design'],
    title: 'high-end-visual-design',
    author: 'Leonxlnx (taste-skill-classics)',
    summary: 'Aus den Taste-Classics: ausdrücklich „Apple-esque / Linear-tier“. Gezielt beim Namen aufrufen.',
    rules: ['Karten mit doppeltem Rahmen', 'Spring-Motion', 'Läuft nur, wenn man ihn beim Namen aufruft'],
    references: [
      { label: 'Repo Leonxlnx/taste-skill-classics', href: 'https://github.com/Leonxlnx/taste-skill-classics' },
    ],
    referenceNote: 'Liegt neben minimalist-ui und der Taste-Version 1 im Classics-Repo.',
    install: 'github.com/Leonxlnx/taste-skill-classics/tree/main/skills/soft-skill',
  },
]

export function catalogFor(name: string): CatalogEntry | undefined {
  const last = name.split(':').at(-1) ?? name

  return CATALOG.find(entry => entry.matches.includes(last))
}
