# Cockpit

Eine Mod für Claude Code, die zeigt, welche Skills du hast, ob Claude sie sieht und ob sie wirklich benutzt wurden. Ein Klick startet einen Skill.

## Phase 1: Skill-Launcher

- **Leiste über der Eingabe:** `✦ Skills` mit Anzahl und „n geladen“. Der zuletzt geladene Skill steht daneben. In der Desktop-App pulsiert ein grüner Punkt, sobald gerade ein Skill geladen wurde.
- **Seitenpanel** (Klick auf die Leiste oder `/cockpit`):
  - Jeder Skill hat einen Status:
    - ◉ in dieser Session geladen
    - ● verfügbar
    - ● grau: startbar, aber nicht in Claudes Liste
    - ○ empfohlen, nicht installiert
  - Favoriten (★) stehen oben, der Rest ist nach Kategorie gruppiert: Design, Code, Daten, Business, Persönlich. Kategorien lassen sich einklappen.
  - Über die Suche findest du Skills nach Name oder Beschreibung.
  - Eine Warnung erscheint, wenn Skills nicht in Claudes Liste passen. Claude wählt sie dann nicht von selbst.
  - Der Zeitstrahl zeigt, welcher Skill wann geladen wurde.
- **Auf dem Handy und überall als Text:** Die Mobile-App zeigt bei Cloud-Sessions keine Mod-Oberfläche, nur Text. Dort ist `/cockpit` das Cockpit:
  - `/cockpit`: Übersicht mit Status, Favoriten, geladenen Skills und Kategorien
  - `/cockpit design`: eine Kategorie mit allen Skills und ihren Beschreibungen
  - `/cockpit ux-copy`: die Infokarte eines Skills mit Status, Herkunft, Startbefehl und Referenzdateien
  - `/cockpit ux-copy anleitung`: die SKILL.md, so wie Claude sie liest
  - `/cockpit <Wort>`: Suche
  - Ein geladener Skill hinterlässt dort einen Hinweis im Verlauf, weil kurze Meldungen fehlen.
- **Infokarte pro Skill:**
  - Herkunft, Platz in Claudes Kontext und Beschreibung.
  - Ein Feld „Aufgabe“ mit **Starten**: Der Skill läuft als `/skill Aufgabe`.
  - Die Anleitung `SKILL.md` zum Aufklappen, so wie Claude sie liest.
  - Alle Referenzdateien des Skills zum Öffnen (Markdown, Code, SVG).
- **Empfohlene Design-Skills:** Emil Kowalski, Anthropic, Jakub Krehel und Taste. Jeweils mit Regeln, Links zu den Referenzen und einem Knopf „Von Claude installieren lassen“.
- **Nachweis:** Jede Skill-Nutzung (per `/name`, Skill-Tool oder Subagent) erzeugt eine kurze Meldung und einen Eintrag im Zeitstrahl.

## Phase 2: Kontext-Ring

- Die Leiste über der Eingabe zeigt, wie voll das Kontextfenster ist: als Ring mit Prozentzahl, im Terminal als Text.
- Nach jedem Schritt von Claude schreibt die Mod Füllstand, Zusammenfass-Marke, Kosten und Nutzungslimits in die Cockpit-Seite fürs Handy, ins Dokument `cockpit/context`.
- Welche Seite das ist, legt die Einstellung `cockpitUrl` fest. Leer heißt: kein Abgleich.
- Wird das Schreiben verweigert, hört die Mod für diese Session damit auf, statt immer wieder zu fragen.
- Claude kann den Abgleich mit dem Werkzeug `sync_context` sofort auslösen.

## Phase 4: Memory und Setup-Check

- In `memory/<repo>.md` steht pro Repo, was es braucht: Connectors (Pflicht und optional), Skills, Ziel-Branch und Muster der Arbeits-Branches. Darunter ist Platz für Notizen. Das Format steht in `memory/README.md`.
- Beim Start der Session prüft die Mod:
  - ob die Connectors verbunden sind
  - ob die Skills da sind
  - ob die Session auf dem richtigen Branch arbeitet
- Nach Zügen prüft sie höchstens einmal pro Minute erneut.
- **Leiste:** drei Punkte für Connectors, Skills und Branch, grün, gelb oder rot.
- **Panel:** Abschnitt „Setup“ mit jeder Prüfung.
- **Als Text:** `/cockpit setup`.
- **Für Claude:** das Werkzeug `check_setup`.
- **Handy-Seite:** Das Ergebnis geht ins Dokument `cockpit/setup` und erscheint dort als Wallet-Karte „Setup“.

## Phase 6: Alles automatisch

- **Geladene Skills** gehen sofort ins Dokument `cockpit/status`. Die Session-Karte der Handy-Seite wird damit grün, ohne dass Claude etwas von Hand einträgt.
- **Der PR des Branches** geht ins Dokument `cockpit/pr`, mit CI, Checks, Konflikten und Dateien. Das passiert beim Start, kurz nach jedem `git push` oder jeder PR-Änderung und nach Zügen höchstens alle 90 s. Geschrieben wird nur, wenn sich etwas geändert hat.
- Das Werkzeug `sync_pr` löst den PR-Abgleich sofort aus.

## Sessions

- Die Mod kennt jede Session deines Kontos und öffnet sie mit einem Tipp. Sie liest sie über den Connector „Claude Code Remote“ (`list_sessions`, dazu einmal `get_session` pro Session für das Repo).
- **Nur die aktuellen:** nicht archiviert und in den letzten 24 Stunden aktiv; was gerade arbeitet, immer.
- **Nach Repo sortiert:** Repos von A bis Z, Sessions ohne Repo zuletzt, innerhalb eines Repos die neueste zuerst. Status: arbeitet, wartet auf dich, zum Ansehen, Fehler, fertig.
- **Wo:** im Panel als Abschnitt „Sessions“, in der Leiste als `⧉ n Sessions`, als `/sessions` (auch auf dem Handy, mit Links) und für Claude als Werkzeug `list_sessions`.
- Die Liste wird beim Start und alle 3 Minuten neu gelesen und, wenn sie sich geändert hat, ins Dokument `cockpit/sessions` der Cockpit-Seite geschrieben. Dort erscheint sie als Wallet-Karte „Sessions“.

## Fertige Teams räumen sich auf

- Sind alle Team-Chats fertig und ist kein Team-PR mehr offen (gemergt oder in den PR des Leads übernommen), archiviert die Mod die Team-Chats und löscht ihre Karten auf der Seite. Steht im Dokument `cockpit/team` ein `pr`, muss der gemergt sein.
- Nur eine Session räumt auf: die erste, die `cockpit/jobs/threads/team-<startedAt>` anlegt. Ihren eigenen Chat archiviert sie nie.
- Die Team-Karte bleibt und zeigt „Kein Team“ mit dem letzten Ziel. Die archivierten Chats verschwinden aus der Sessions-Liste.
- **Von Hand auf der Seite:** Archiv-Knopf rechts an jeder Session, „Team archivieren“ in der Team-Karte und „Chat archivieren“ im Blatt eines Team-Chats, jeweils mit zweitem Tipp zum Bestätigen. Die Seite schickt `Cockpit · Archivieren` mit den Session-IDs; die Mod der Session, die den Auftrag zuerst beansprucht, archiviert sie selbst und räumt die Team-Karten auf.

## Zur Cockpit-Seite

- `/seite` öffnet die Cockpit-Seite und zeigt ihren Link als Knopf, in jeder Session, auch auf dem Handy.
- Derselbe Link steht oben in `/cockpit` und in der Leiste über der Eingabe („Seite ↗“).
- Claude kann die Seite mit dem Werkzeug `open_page` öffnen, etwa auf „öffne das Cockpit“.

## Aufträge vom Handy: nur eine Session

- Ein Auftrag von der Cockpit-Seite weckt jede Session, die sie beobachtet. Liest eine Session den Thread (`ArtifactComments read`), hängt die Mod eine Zuteilung an: Nennt der Auftrag eine andere Session (`Session: <ID>`) oder hat eine andere ihn schon beansprucht (`cockpit/jobs/threads/<Thread-ID>`), bleibt diese still.
- Die Regeln dazu kommen über die Mod in den Systemprompt jeder Session, in jedem Repo.

## Skills, die mit der Mod kommen

- In `skills/` liegen die über das Cockpit installierten Skills: `apple-design` und `emil-design-eng` von Emil Kowalski (MIT), `frontend-design` von Anthropic (Apache 2.0), `high-end-visual-design` von Leonxlnx (MIT, nur beim Namen aufrufbar). Sie gelten überall, wo die Mod installiert ist.
- Im Repo Else-Live- zeigen Links in `.claude/skills/` darauf, so hat jede Cloud-Session dort sie ohne Mod.

## Installation

In einer Terminal-Session:

```
/plugin install cockpit --marketplace leesyashin/Else-Live-
```

Danach `y` zum Hinzufügen des Marketplace und den Bereich „user“ wählen. Dann lädt die Mod in jedem Repo.

In der Desktop-App: das **+** neben dem Eingabefeld, dann **Plugins**, **Add marketplace** mit `leesyashin/Else-Live-`, dann **Add plugin**.

Bei einem privaten Repo braucht der Rechner Zugang zu GitHub, z. B. per `gh auth login` und `gh auth setup-git`.

## Entwicklung

```
claude plugin validate mods/cockpit
claude plugin test mods/cockpit
```

Der Plan für alle Phasen steht in `PLAN.md` im Repo.
