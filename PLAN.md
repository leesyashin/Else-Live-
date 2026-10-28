# Plan: Claude-Mod „Cockpit“ (Arbeitstitel)

Eine Mod für Claude Code, die Funktionen und Oberfläche erweitert: mehr Übersicht, schlichtes Design, dezente Apple-artige Animationen.

## Warum

- Kein Gedächtnis zwischen den Repos: Connectors werden vergessen, Unsicherheit beim Mergen.
- Skills sind unsichtbar: Unklar, ob sie verfügbar waren und ob sie benutzt wurden.
- Skills sollen per Knopf startbar sein, Frontend-Skills mit sichtbaren Referenzen.
- Mehr Connectors für professionelle Ergebnisse.

## Entscheidungen (20 Fragen)

| # | Thema | Entscheidung |
| --- | --- | --- |
| 1 | Oberfläche | Desktop-App |
| 2 | Platzierung | Leiste über der Eingabe + Seitenpanel für Details |
| 3 | Installation | Global als Marketplace aus diesem Repo (Else-Live-) |
| 4 | Erster Meilenstein | Skill-Knopf + Transparenz |
| 5 | Skill-Liste | Status pro Skill, Favoriten oben, nach Kategorie gruppiert |
| 6 | Skill-Klick | Erst Infokarte (was er tut, Referenzen), dann „Starten“ mit Eingabe |
| 7 | Nachweis | Toast + Zeitstrahl im Panel |
| 8 | Design-Skills | Beste Frontend-Design-Skills recherchieren und vorschlagen (siehe unten) |
| 9 | Merge-Knopf | Vorschau-Karte, dann bestätigen |
| 10 | Sicherheit | Sperre bei rotem/laufendem CI, Sperre bei Konflikten, „Gedrückt halten“ (siehe Abweichung) |
| 11 | Merge-Art | Squash |
| 12 | Nach Merge | Branch löschen, Erfolgs-Animation, Eintrag ins Memory |
| 13 | Kontext-Stil | Aktivitätsring wie Apple Watch |
| 14 | Zeitraum | Live-Füllstand jetzt |
| 15 | Memory | Setup-Checkliste pro Repo, Connector-Bedarf |
| 16 | Speicherort | Dateien in Else-Live- |
| 17 | Teamwork | Lead-Chat verteilt Aufgaben |
| 18 | Kontrolle | Minimiert, Pop-up nur bei Konflikt oder Frage |
| 19 | Connectors | Design |
| 20 | Animationen | Dezent & flüssig, eine Spielerei nur bei Momenten wie Merge |

## Aufbau

- **Leiste über der Eingabe:** Kontext-Ring · Merge · Skills · Team. Ein Klick öffnet das Panel.
- **Seitenpanel:** Tabs für Skills, Merge, Team und Setup.
- **Animationen:** SVG mit SMIL-Animation, wird in der Desktop-App animiert gezeichnet. In anderen Oberflächen als ruhiges Bild bzw. Text.
- **Verteilung:** `.claude-plugin/marketplace.json` in diesem Repo. Einmal `/plugin install` ausführen, danach lädt die Mod in jedem Repo.

## Phasen

### Phase 1: Skill-Launcher

- Alle Skills mit Status: ● verfügbar, ◉ in dieser Session geladen, ○ fehlt.
- Favoriten oben, der Rest nach Kategorie: Design, Code, Daten, Business, Persönlich.
- Ein Klick öffnet die Infokarte: Beschreibung, Herkunft, Referenzen. Darunter „Starten“ mit Eingabefeld.
- Jede Skill-Nutzung erzeugt einen Toast und einen Eintrag im Zeitstrahl.
- Die Gruppe „Design“ enthält die empfohlenen Design-Skills mit ihren Regeln und Referenzen zum Ansehen.

### Phase 2: Kontext-Ring

- Live-Füllstand der Session als Ring, der von Grün über Gelb zu Rot wechselt.
- Ein Klick zeigt Ringe pro Kategorie: System, Tools, Skills, Chat.

### Phase 3: Merge-Knopf

- Die Vorschau-Karte zeigt PR, Quell- und Ziel-Branch (Ziel groß), CI-Status, Dateien und Konflikte.
- Der Knopf ist gesperrt, solange CI rot ist oder noch läuft, und solange es Konflikte gibt.
- Ablauf nach der Bestätigung:
  1. Squash-Merge
  2. Branch löschen
  3. Häkchen-Animation
  4. Eintrag ins Memory
- **Abweichung bei Frage 10:** Knöpfe kennen technisch nur „Drücken“, kein „Gedrückt halten“. Ersatz in zwei Stufen:
  1. Der erste Druck macht den Knopf scharf, ein Ring läuft 2 s.
  2. Ein zweiter Druck innerhalb dieser Zeit merged. Ohne zweiten Druck fällt der Knopf zurück.

### Phase 4: Memory & Setup-Check

- Memory-Dateien liegen in Else-Live- und enthalten pro Repo:
  - eine Setup-Checkliste
  - die benötigten Connectors
- Beim Session-Start zeigt die Leiste grüne und rote Punkte: Connectors verbunden? Skills da? Richtiger Branch?

### Phase 5: Chat-Teamwork

- Der Lead-Chat zerlegt eine Aufgabe und verteilt die Teile an andere Chats im selben Repo.
- Das Panel zeigt kleine Avatare mit Status: arbeitet, wartet, fertig. Ein Klick öffnet den Verlauf.
- Ein Pop-up erscheint nur bei Konflikt oder einer Frage an dich.

## Empfohlene Design-Skills (Recherche 28.10.2026)

1. **Emil Kowalski: `apple-design` + `emil-design-eng`** (github.com/emilkowalski/skills)
   - Überträgt Apples „Designing Fluid Interfaces“ ins Web.
   - Springs statt fester Dauer, unterbrechbare Animationen, Feedback schon beim Drücken.
   - UI-Animationen unter 300 ms.
   - Passt am besten zu „dezent & flüssig“.
2. **Anthropic: `frontend-design`** (github.com/anthropics/skills)
   - Schlanke offizielle Basis, 71 Zeilen, in fünf Minuten gelesen.
   - Erst Plan (Farben, Schrift, Wireframe), dann bauen und die eigenen Screenshots kritisieren.
3. **Jakub Krehel: `make-interfaces-feel-better`** (github.com/jakubkrehel/make-interfaces-feel-better)
   - Feinschliff in 19 Regeln: konzentrische Radien, optische Ausrichtung, Schatten, Typografie.
4. **Optional, Taste-Skill** (github.com/Leonxlnx/taste-skill)
   - Die aktuelle v2 ist ein schwerer 10-Schritte-Prozess Richtung Award-Website.
   - Sie verbietet Glas und Schatten und widerspricht damit dem Apple-Look.
   - Besser gezielt `high-end-visual-design` aus `Leonxlnx/taste-skill-classics` aufrufen.

## Connectors: Design

- Figma (`mcp.figma.com`) und Canva (`mcp.canva.com`) sind als Connectors vorhanden.
- In der Cloud-Umgebung blockiert die Netzwerk-Richtlinie beide derzeit.
- Lösung: Beide Hosts in den Umgebungs-Einstellungen unter Network access → Allowed domains freigeben.

## Offene Punkte / Risiken

- **Memory zurückschreiben:** Eine Session in einem anderen Repo braucht Schreibzugriff auf Else-Live-. Ob das ohne Rückfrage geht, wird in Phase 4 geprüft.
- **Chats untereinander:** Cloud-Sessions brauchen evtl. einmal deine Freigabe, bevor sie andere Sessions erreichen dürfen.
- **Mod-Name:** offen.
