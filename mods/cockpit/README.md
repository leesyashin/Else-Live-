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
- **Auf dem Handy:** Die Mobile-App zeigt keine Seitenpanels. Dort zeichnet `/cockpit` dieselbe Liste samt Infokarten direkt in den Chat, mit Starten-Knopf statt Eingabefeld. Auf jeder Oberfläche liefert `/cockpit` außerdem eine Textübersicht.
- **Infokarte pro Skill:**
  - Herkunft, Platz in Claudes Kontext und Beschreibung.
  - Ein Feld „Aufgabe“ mit **Starten**: Der Skill läuft als `/skill Aufgabe`.
  - Die Anleitung `SKILL.md` zum Aufklappen, so wie Claude sie liest.
  - Alle Referenzdateien des Skills zum Öffnen (Markdown, Code, SVG).
- **Empfohlene Design-Skills:** Emil Kowalski, Anthropic, Jakub Krehel und Taste. Jeweils mit Regeln, Links zu den Referenzen und einem Knopf „Von Claude installieren lassen“.
- **Nachweis:** Jede Skill-Nutzung (per `/name`, Skill-Tool oder Subagent) erzeugt eine kurze Meldung und einen Eintrag im Zeitstrahl.

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
