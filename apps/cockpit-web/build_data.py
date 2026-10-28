"""Builds the Cockpit page's skill data from this session's skills.

Writes index.json (list, small, embedded in the page) and skills.json
(SKILL.md bodies and reference files, fetched when a card opens).
"""
import json
import os
import re
import sys

OUT = sys.argv[1]
SYNCED_PLUGINS = '/root/.claude/plugins/synced/5537b8ca-6826-4499-982d-2a0b8b0ec2d4_4b54b50d-c702-488b-ad59-2a8857b953f3'
SYNCED_SKILLS = '/root/.claude/skills/synced/5537b8ca-6826-4499-982d-2a0b8b0ec2d4_4b54b50d-c702-488b-ad59-2a8857b953f3'

# name (as run), category, source label, German one-liner, description for skills without a file
SKILLS = [
    # Design
    ('design:accessibility-review', 'Design', 'Plugin design', 'Prüft eine Seite auf Barrierefreiheit (WCAG 2.1 AA): Kontrast, Tastatur, Screenreader.', None),
    ('design:design-critique', 'Design', 'Plugin design', 'Strukturiertes Feedback zu Usability, Hierarchie und Konsistenz eines Designs.', None),
    ('design:design-handoff', 'Design', 'Plugin design', 'Übergabe-Spezifikation für Entwickler: Layout, Tokens, Zustände, Animationen.', None),
    ('design:design-system', 'Design', 'Plugin design', 'Prüft, dokumentiert und erweitert ein Design-System.', None),
    ('design:research-synthesis', 'Design', 'Plugin design', 'Fasst Nutzerforschung zu Themen, Erkenntnissen und Empfehlungen zusammen.', None),
    ('design:user-research', 'Design', 'Plugin design', 'Plant Nutzerforschung: Interviewleitfäden, Usability-Tests, Umfragen.', None),
    ('design:ux-copy', 'Design', 'Plugin design', 'Schreibt und prüft Microcopy: Buttons, Fehlermeldungen, leere Zustände.', None),
    ('artifact-capabilities', 'Design', 'Eingebaut', 'Was eine veröffentlichte Seite zusätzlich kann: Daten, Kommentare, Claude fragen.',
     'Runtime capabilities a published Artifact page can be granted: reading live or connected data, remembering what people do on it, shared state, knowing who is viewing, asking Claude, storing files.'),
    ('artifact-design', 'Design', 'Eingebaut', 'Gestaltungsregeln für veröffentlichte Seiten (Artifacts).',
     'Design guidance and fundamentals for Artifacts. Load before writing any artifact.'),
    ('artifact-diagramming', 'Design', 'Eingebaut', 'Diagramme für Seiten: wann sie helfen und wie sie in beiden Themes lesbar bleiben.',
     'Diagramming know-how for Artifacts: when a picture earns its place, how to draw one that shows the real mechanism, and the inline-SVG mechanics that keep it legible in both themes.'),
    ('anthropic-skills:web-artifacts-builder', 'Design', 'Mit deinem Konto synchronisiert', 'Baut aufwendige HTML-Seiten mit React, Tailwind und shadcn/ui.', None),
    # Code
    ('anthropic-skills:built-in-browser', 'Code', 'Mit deinem Konto synchronisiert', 'Steuert den eingebauten Browser der Claude-Desktop-App.', None),
    ('anthropic-skills:chrome-browser', 'Code', 'Mit deinem Konto synchronisiert', 'Steuert dein echtes Chrome über die Claude-Erweiterung.', None),
    ('claude-api', 'Code', 'Eingebaut', 'Nachschlagewerk zur Claude API: Modelle, Preise, Tools, Caching, Agents.',
     'Reference for the Claude API / Anthropic SDK: model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration.'),
    ('code-review', 'Code', 'Eingebaut', 'Prüft deine Änderungen oder einen PR auf Fehler, wahlweise mit Kommentaren.',
     'Review the current diff, or a PR number/branch/path target, for correctness bugs at a chosen effort level. --comment posts inline PR comments, --fix applies them.'),
    ('fewer-permission-prompts', 'Code', 'Eingebaut', 'Erlaubt häufige, harmlose Befehle dauerhaft: weniger Rückfragen.',
     'Scan your transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist to project .claude/settings.json to reduce permission prompts.'),
    ('init', 'Code', 'Eingebaut', 'Legt eine CLAUDE.md mit der Beschreibung des Projekts an.',
     'Initialize a new CLAUDE.md file with codebase documentation.'),
    ('keybindings-help', 'Code', 'Eingebaut', 'Tastenkürzel von Claude Code anpassen.',
     'Customize keyboard shortcuts, rebind keys, add chord bindings, or modify ~/.claude/keybindings.json.'),
    ('loop', 'Code', 'Eingebaut', 'Wiederholt einen Befehl in einem Intervall, z. B. alle 5 Minuten prüfen.',
     'Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to let the model self-pace.'),
    ('plugin-authoring', 'Code', 'Eingebaut', 'Baut Mods wie dieses Cockpit: Panels, Leisten, Befehle, Hooks.',
     "Make a mod: a change to Claude's own interface or behaviour, such as a panel or pane that stays beside the chat, a band, status line, toast, slash command, or hook on tool calls."),
    ('run', 'Code', 'Eingebaut', 'Startet die App des Projekts, um eine Änderung live zu sehen.',
     "Launch and drive this project's app to see a change working: run, start, or screenshot the app."),
    ('security-review', 'Code', 'Eingebaut', 'Sicherheitsprüfung der offenen Änderungen im Branch.',
     'Complete a security review of the pending changes on the current branch.'),
    ('simplify', 'Code', 'Eingebaut', 'Räumt geänderten Code auf: einfacher, wiederverwendbar, effizienter.',
     'Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes.'),
    ('session-start-hook', 'Code', 'Eingebaut', 'Richtet einen Start-Hook für Cloud-Sessions im Repo ein.', None),
    ('update-config', 'Code', 'Eingebaut', 'Ändert Einstellungen: Berechtigungen, Hooks, Umgebungsvariablen.',
     'Configure the Claude Code harness via settings.json: hooks for automated behaviors, permissions, env vars.'),
    ('workflow-authoring', 'Code', 'Eingebaut', 'Schreibt Workflows, die viele Agenten koordinieren.',
     'Reference for writing a Workflow tool script (script API and gotchas, resume, quality patterns, worked examples).'),
    # Daten
    ('data:analyze', 'Daten', 'Plugin data', 'Beantwortet Datenfragen, von der schnellen Zahl bis zur Analyse.', None),
    ('data:build-dashboard', 'Daten', 'Plugin data', 'Baut ein interaktives HTML-Dashboard mit Diagrammen und Filtern.', None),
    ('data:create-viz', 'Daten', 'Plugin data', 'Erstellt Diagramme in Publikationsqualität mit Python.', None),
    ('data:data-context-extractor', 'Daten', 'Plugin data', 'Baut einen Daten-Skill mit dem Wissen deines Teams über eure Datenbank.', None),
    ('data:data-visualization', 'Daten', 'Plugin data', 'Wählt den passenden Diagrammtyp und gestaltet ihn sauber.', None),
    ('dataviz', 'Daten', 'Eingebaut', 'Regeln für Diagramme, Farben und Dashboards, die in Hell und Dunkel funktionieren.',
     'Use this skill whenever you are about to create any chart, graph, plot, dashboard, or data visualization: a form heuristic, a color formula with a runnable validator, mark specs, and interaction rules.'),
    ('data:explore-data', 'Daten', 'Plugin data', 'Untersucht einen Datensatz: Form, Qualität, Auffälligkeiten.', None),
    ('anthropic-skills:skill-creator', 'Daten', 'Mit deinem Konto synchronisiert', 'Erstellt und verbessert eigene Skills, mit Tests und Auswertung.', None),
    ('data:sql-queries', 'Daten', 'Plugin data', 'Schreibt korrektes, schnelles SQL für gängige Datenbanken.', None),
    ('data:statistical-analysis', 'Daten', 'Plugin data', 'Statistik: Verteilungen, Trends, Ausreißer, Signifikanz.', None),
    ('data:validate-data', 'Daten', 'Plugin data', 'Prüft eine Analyse vor dem Teilen auf Fehler und Verzerrungen.', None),
    ('data:write-query', 'Daten', 'Plugin data', 'Übersetzt eine Frage in optimiertes SQL.', None),
    ('anthropic-skills:xlsx', 'Daten', 'Mit deinem Konto synchronisiert', 'Liest, bearbeitet und erstellt Excel-Tabellen.', None),
    # Business
    ('marketing:brand-review', 'Business', 'Plugin marketing', 'Prüft Texte gegen deine Markenstimme und den Styleguide.', None),
    ('legal:brief', 'Business', 'Plugin legal', 'Briefing für rechtliche Arbeit: Tagesüberblick, Recherche, Vorfälle.', None),
    ('marketing:campaign-plan', 'Business', 'Plugin marketing', 'Kampagnenplan mit Zielen, Zielgruppe, Kanälen und Kalender.', None),
    ('marketing:competitive-brief', 'Business', 'Plugin marketing', 'Wettbewerbsanalyse mit Positionierung und Lücken.', None),
    ('legal:compliance-check', 'Business', 'Plugin legal', 'Prüft ein Vorhaben auf Vorschriften, Freigaben und Risiken.', None),
    ('marketing:content-creation', 'Business', 'Plugin marketing', 'Marketing-Inhalte für alle Kanäle: Blog, Social, Newsletter.', None),
    ('anthropic-skills:deep-research', 'Business', 'Mit deinem Konto synchronisiert', 'Gründliche Recherche über viele Quellen mit Bericht.', None),
    ('anthropic-skills:docs', 'Business', 'Mit deinem Konto synchronisiert', 'Teilbare, bearbeitbare Dokumente, die man kommentieren kann.', None),
    ('anthropic-skills:docx', 'Business', 'Mit deinem Konto synchronisiert', 'Word-Dokumente erstellen und bearbeiten.', None),
    ('marketing:draft-content', 'Business', 'Plugin marketing', 'Entwirft Blogposts, Social Posts, Newsletter und Landingpages.', None),
    ('marketing:email-sequence', 'Business', 'Plugin marketing', 'E-Mail-Strecken mit Texten, Timing und Verzweigungen.', None),
    ('anthropic-skills:google-workspace', 'Business', 'Mit deinem Konto synchronisiert', 'Google Docs, Sheets und Slides erstellen und ändern.', None),
    ('legal:legal-response', 'Business', 'Plugin legal', 'Antworten auf typische rechtliche Anfragen mit Vorlagen.', None),
    ('legal:legal-risk-assessment', 'Business', 'Plugin legal', 'Bewertet rechtliche Risiken nach Schwere und Wahrscheinlichkeit.', None),
    ('legal:meeting-briefing', 'Business', 'Plugin legal', 'Bereitet Meetings mit rechtlichem Bezug vor.', None),
    ('anthropic-skills:pdf', 'Business', 'Mit deinem Konto synchronisiert', 'PDFs lesen, ausfüllen, zusammenführen und erstellen.', None),
    ('marketing:performance-report', 'Business', 'Plugin marketing', 'Marketing-Bericht mit Kennzahlen, Trends und Empfehlungen.', None),
    ('anthropic-skills:pptx', 'Business', 'Mit deinem Konto synchronisiert', 'PowerPoint-Präsentationen erstellen und bearbeiten.', None),
    ('legal:review-contract', 'Business', 'Plugin legal', 'Prüft Verträge gegen eure Verhandlungsposition.', None),
    ('marketing:seo-audit', 'Business', 'Plugin marketing', 'SEO-Prüfung: Keywords, Inhalte, Technik, Wettbewerb.', None),
    ('legal:signature-request', 'Business', 'Plugin legal', 'Bereitet Dokumente für die elektronische Unterschrift vor.', None),
    ('legal:triage-nda', 'Business', 'Plugin legal', 'Ordnet eine NDA schnell ein: grün, gelb oder rot.', None),
    ('legal:vendor-check', 'Business', 'Plugin legal', 'Überblick über Verträge mit einem Anbieter und offene Punkte.', None),
    # Persönlich
    ('anthropic-skills:berater', 'Persönlich', 'Mit deinem Konto synchronisiert', 'Dein Berater: ehrliche Einordnung von Entscheidungen und Plänen.', None),
    ('anthropic-skills:coach', 'Persönlich', 'Mit deinem Konto synchronisiert', 'Dein Foto- und Video-Coach: ehrliche Bewertung, konkrete Verbesserungen.', None),
    ('anthropic-skills:coworker', 'Persönlich', 'Mit deinem Konto synchronisiert', 'Dein Co-Worker: Recherche, Schnitt-Vorbereitung, Footage, Skripte.', None),
    ('anthropic-skills:import-memory', 'Persönlich', 'Mit deinem Konto synchronisiert', 'Übernimmt Erinnerungen aus einem anderen KI-Assistenten.', None),
    ('productivity:memory-management', 'Persönlich', 'Plugin productivity', 'Zweistufiges Gedächtnis: Kürzel, Personen, Projekte.', None),
    ('anthropic-skills:morning', 'Persönlich', 'Mit deinem Konto synchronisiert', 'Dein Morgen-Briefing als gestaltete Seite.', None),
    ('productivity:start', 'Persönlich', 'Plugin productivity', 'Richtet das Produktivitätssystem ein und öffnet das Dashboard.', None),
    ('productivity:task-management', 'Persönlich', 'Plugin productivity', 'Aufgabenliste in einer gemeinsamen TASKS.md.', None),
    ('productivity:update', 'Persönlich', 'Plugin productivity', 'Gleicht Aufgaben ab und frischt das Gedächtnis auf.', None),
    # Weitere
    ('anthropic-skills:computer-use', 'Weitere', 'Mit deinem Konto synchronisiert', 'Bedient Apps auf deinem Computer per Bildschirm, Klick und Tastatur.', None),
    ('anthropic-skills:optimize', 'Weitere', 'Mit deinem Konto synchronisiert', 'Optimiert Texte oder Abläufe nach deinen Vorgaben.', None),
    ('reset-credits', 'Weitere', 'Von einem Connector', 'Befehl eines verbundenen Connectors (MCP).',
     'A prompt command provided by a connected MCP server.'),
]

RECOMMENDED = [
    {
        'id': 'apple-design', 'title': 'apple-design', 'author': 'Emil Kowalski',
        'summary': 'Überträgt Apples WWDC-Talk „Designing Fluid Interfaces“ ins Web. Passt am besten zu dezent und flüssig.',
        'rules': ['Feedback schon beim Drücken, nicht erst beim Loslassen', 'Jede Animation lässt sich unterbrechen',
                  'Springs statt fester Dauer: damping 1.0, Bounce nur nach einem Wisch',
                  'Die Geschwindigkeit der Geste geht in die Animation über',
                  'Rubber-Banding am Rand, durchscheinende Materialien per backdrop-filter'],
        'references': [{'label': 'SKILL.md auf GitHub', 'href': 'https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md'},
                       {'label': 'Repo emilkowalski/skills', 'href': 'https://github.com/emilkowalski/skills'}],
        'referenceNote': 'Keine Bilder: Textregeln mit konkreten Werten (Spring-Tabelle, Easing-Tokens) und Code-Beispielen.',
        'install': 'npx skills@latest add emilkowalski/skills',
    },
    {
        'id': 'emil-design-eng', 'title': 'emil-design-eng', 'author': 'Emil Kowalski',
        'summary': 'Handwerk für Animationen und Interaktion im Alltag einer Oberfläche.',
        'rules': ['UI-Animationen unter 300 ms, nie ease-in, nie scale(0)', 'Buttons geben beim Drücken nach (scale 0.97)',
                  'Eigene Easing-Kurven als Tokens, reduzierte Bewegung wird beachtet', 'Reviews als Vorher/Nachher-Tabelle'],
        'references': [{'label': 'SKILL.md auf GitHub', 'href': 'https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md'}],
        'referenceNote': 'Textregeln mit Werten und Code-Beispielen, dazu ein Performance-Cheatsheet im Repo.',
        'install': 'npx skills@latest add emilkowalski/skills',
    },
    {
        'id': 'frontend-design', 'title': 'frontend-design', 'author': 'Anthropic',
        'summary': 'Die schlanke offizielle Basis, in fünf Minuten gelesen.',
        'rules': ['Zuerst ein Plan: 4–6 Farben, Schriften, ASCII-Wireframe', 'Den Plan gegen Standardlösungen prüfen',
                  'Bauen, dann die eigenen Screenshots kritisieren', 'Typische KI-Looks meiden',
                  'Ein geplanter Bewegungsmoment statt Einblenden überall'],
        'references': [{'label': 'SKILL.md auf GitHub', 'href': 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md'}],
        'referenceNote': 'Eine einzige Textdatei. Dein eigenes Briefing hat laut Skill Vorrang.',
        'install': '/plugin marketplace add anthropics/skills, danach /plugin install example-skills@anthropic-agent-skills',
    },
    {
        'id': 'make-interfaces-feel-better', 'title': 'make-interfaces-feel-better', 'author': 'Jakub Krehel',
        'summary': 'Feinschliff in 19 Detailregeln. Gibt keine Richtung vor, macht sie aber sauber.',
        'rules': ['Konzentrische Radien: außen = innen + Abstand', 'Optische statt geometrischer Ausrichtung',
                  'Schatten für Tiefe, Rahmen für Struktur', 'Gestaffelte Eingänge, dezente Ausgänge',
                  'Große Klickflächen, Zurückhaltung bei Bewegung'],
        'references': [{'label': 'Repo auf GitHub', 'href': 'https://github.com/jakubkrehel/make-interfaces-feel-better'}],
        'referenceNote': 'typography.md, surfaces.md, animations.md, icons.md und performance.md neben der SKILL.md.',
        'install': 'npx skills add jakubkrehel/make-interfaces-feel-better',
    },
    {
        'id': 'taste-skill', 'title': 'Taste (v2)', 'author': 'Leonxlnx',
        'summary': 'Zehnstufiger Prozess Richtung Award-Website, gestützt auf eine Studie von 247 Websites.',
        'rules': ['Briefing lesen, 8–12 Fakten sammeln, die nur dieser Kunde hat', 'Ein Skript schlägt 3 von 20 Designrichtungen vor',
                  'Prüft die Seite bei 1440, 768 und 390 px, bis zu drei Kritik-Runden',
                  'Verbietet Verläufe, Schatten auf ruhenden Elementen und Glas'],
        'references': [{'label': 'Repo Leonxlnx/taste-skill', 'href': 'https://github.com/Leonxlnx/taste-skill'},
                       {'label': 'tasteskill.dev', 'href': 'https://tasteskill.dev'}],
        'referenceNote': 'Zum Ansehen: examples/v2 (Screenshots), references/research.md (die Studie), tells.md, motion.md.',
        'install': '/plugin marketplace add Leonxlnx/taste-skill, danach /plugin install taste-skill@taste-skill',
        'note': 'Schwer: 30–45 Minuten pro Durchlauf. Das Glas-Verbot widerspricht dem Apple-Look.',
    },
    {
        'id': 'high-end-visual-design', 'title': 'high-end-visual-design', 'author': 'Leonxlnx',
        'summary': 'Aus den Taste-Classics: ausdrücklich „Apple-esque / Linear-tier“. Gezielt beim Namen aufrufen.',
        'rules': ['Karten mit doppeltem Rahmen', 'Federnde Bewegungen', 'Läuft nur, wenn man ihn beim Namen aufruft'],
        'references': [{'label': 'Repo Leonxlnx/taste-skill-classics', 'href': 'https://github.com/Leonxlnx/taste-skill-classics'}],
        'referenceNote': 'Liegt neben minimalist-ui und Taste Version 1 im Classics-Repo.',
        'install': 'aus github.com/Leonxlnx/taste-skill-classics',
    },
]


def find_file(name):
    prefix, _, short = name.rpartition(':')
    candidates = []
    if prefix in ('design', 'data', 'legal', 'marketing', 'productivity'):
        candidates.append(f'{SYNCED_PLUGINS}/{prefix}/skills/{short}/SKILL.md')
    if prefix == 'anthropic-skills':
        candidates.append(f'{SYNCED_SKILLS}/{short}/SKILL.md')
    if name == 'session-start-hook':
        candidates.append('/root/.claude/skills/session-start-hook/SKILL.md')
    return next((c for c in candidates if os.path.isfile(c)), None)


def frontmatter(text):
    match = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n?', text, re.S)
    if not match:
        return {}, text
    head = match.group(1)
    fields = {}
    for key in ('name', 'description'):
        m = re.search(rf'^{key}:\s*(.*?)(?=^\w[\w-]*:|\Z)', head, re.S | re.M)
        if m:
            value = ' '.join(m.group(1).split())
            fields[key] = value.strip('"').strip("'").lstrip('>|').strip()
    return fields, text[match.end():].strip()


TEXT = re.compile(r'\.(md|txt)$', re.I)
CODE = re.compile(r'\.(py|js|mjs|ts|json|csv|ya?ml|sh|css|html|toml)$', re.I)
MAX_FILE = 40_000


def references(folder):
    files = []
    for entry in sorted(os.listdir(folder)):
        path = os.path.join(folder, entry)
        if entry.startswith('.') or entry in ('SKILL.md', 'LICENSE.txt'):
            continue
        items = [(entry, path)] if os.path.isfile(path) else [
            (f'{entry}/{inner}', os.path.join(path, inner)) for inner in sorted(os.listdir(path))
            if os.path.isfile(os.path.join(path, inner)) and not inner.startswith('.')
        ]
        for label, file in items:
            kind = 'text' if TEXT.search(label) else 'code' if CODE.search(label) else 'other'
            item = {'label': label, 'kind': kind, 'size': os.path.getsize(file)}
            if kind in ('text', 'code') and item['size'] <= MAX_FILE:
                with open(file, encoding='utf-8', errors='replace') as handle:
                    item['text'] = handle.read()
            files.append(item)
    return files[:40]


index, details = [], {}
for name, category, source, summary, fallback in SKILLS:
    path = find_file(name)
    description, body, files = fallback or '', None, []
    if path:
        with open(path, encoding='utf-8', errors='replace') as handle:
            fields, body = frontmatter(handle.read())
        description = fields.get('description') or description
        files = references(os.path.dirname(path))
    index.append({
        'name': name, 'short': name.rpartition(':')[2], 'category': category, 'source': source,
        'summary': summary, 'description': description, 'hasFiles': bool(path), 'fileCount': len(files),
    })
    if path:
        details[name] = {'body': body, 'files': files}

with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as handle:
    json.dump({'skills': index, 'recommended': RECOMMENDED}, handle, ensure_ascii=False, separators=(',', ':'))
with open(os.path.join(OUT, 'skills.json'), 'w', encoding='utf-8') as handle:
    json.dump(details, handle, ensure_ascii=False, separators=(',', ':'))

missing = [name for name, *_ in SKILLS if not find_file(name)]
print(len(index), 'skills,', len(details), 'with files; no file:', ', '.join(missing))
print('index', os.path.getsize(os.path.join(OUT, 'index.json')), 'bytes; details', os.path.getsize(os.path.join(OUT, 'skills.json')), 'bytes')
