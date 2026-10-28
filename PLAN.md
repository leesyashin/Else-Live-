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

### Phase 1: Skill-Launcher (umgesetzt in `mods/cockpit`)

- Alle Skills mit Status: ● verfügbar, ◉ in dieser Session geladen, ○ fehlt. Zusätzlich ● grau für Skills, die nicht in Claudes Liste passen; der Kopf warnt, wenn das passiert.
- Favoriten oben, der Rest nach Kategorie: Design, Code, Daten, Business, Persönlich.
- Ein Klick öffnet die Infokarte: Beschreibung, Herkunft, Referenzen. Darunter „Starten“ mit Eingabefeld.
- Jede Skill-Nutzung erzeugt einen Toast und einen Eintrag im Zeitstrahl.
- Die Gruppe „Design“ enthält die empfohlenen Design-Skills mit ihren Regeln und Referenzen zum Ansehen.

**Auf dem Handy:** Die Mobile-App zeigt bei Cloud-Sessions keine Mod-Oberfläche. Deshalb gibt es das Cockpit dort als Artifact-Seite (`apps/cockpit-web`):
- alle Skills farbig nach Kategorie
- Infokarten mit Anleitung und Referenzen
- ein Starten-Knopf, der den Auftrag per „Send to Claude“ an die Session schickt
- Live-Status über die Datenbank der Seite

### Phase 2: Kontext-Ring (umgesetzt)

- **Handy-Seite:** Ring oben rechts und auf der Session-Karte. Die Mod schreibt nach jedem Schritt von Claude den Füllstand, die Marke, die Kosten und die Nutzungslimits in die Datenbank der Seite. Die Seite liest sie live mit, ohne Connector und ohne Remote Control. Antippen öffnet den großen Ring mit Marke fürs Zusammenfassen, verbleibenden Tokens, Kosten und Nutzungslimit.
- **Mod (Desktop, Terminal):** Ring mit Prozentzahl in der Leiste über der Eingabe, nach jedem Zug aktualisiert.
- **Noch offen:** Ringe pro Kategorie (System, Tools, Skills, Chat). Die Aufschlüsselung kennt nur die Mod, nicht die Handy-Seite.

Ursprünglicher Plan:

- Live-Füllstand der Session als Ring, der von Grün über Gelb zu Rot wechselt.
- Ein Klick zeigt Ringe pro Kategorie: System, Tools, Skills, Chat.

### Phase 3: Merge-Knopf (auf der Handy-Seite umgesetzt)

- **Handy-Seite:** Wallet-Karte „Merge“ direkt unter der Session. Vorn: Ziel-Branch groß, Status, Titel, Anzahl Dateien. Geöffnet: Vorschau mit Quell- und Ziel-Branch, CI und einzelnen Checks, Konflikten, Dateien (+/−), Entwurf-Hinweis und Stand.
- Statt „scharf machen + zweiter Druck“ gilt auf dem Handy echtes **Halten (1,2 s)**: Der Knopf füllt sich, ein kurzer Druck schickt nichts.
- Gesperrt bei rotem oder laufendem CI, bei Konflikten und solange GitHub die Konflikte noch prüft (`mergeable: null`).
- Ergebnis: Spinner „Claude merged …“, dann ein gezeichnetes Häkchen mit Funken, Insel „Gemergt“ und Vibration. Bei Abbruch steht Claudes Grund auf der Karte.
- **Noch offen:** Merge-Knopf in der Mod (Desktop) und der Eintrag ins Memory (kommt mit Phase 4).

Ursprünglicher Plan:

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

### Phase 4: Memory & Setup-Check (umgesetzt)

- **Memory:** eine Datei pro Repo in `mods/cockpit/memory/<repo>.md`, Format in `mods/cockpit/memory/README.md`. Kopf mit `base`, `branch`, `connectors`, `optional` und `skills`. Darunter frei: Notizen, Checkliste, Merges (das Cockpit zeigt sie nicht an). Die Dateien liegen in der Mod, damit sie mit jeder Installation in jedem Repo ankommen.
- **Mod prüft selbst:**
  - Beim Session-Start nach 4 s, dann nach Zügen höchstens einmal pro Minute.
  - Connectors: an den MCP-Werkzeugnamen der Session (`mcp__<server>__…`) erkannt.
  - Skills: aus der Skill-Liste der Session.
  - Branch: per `git rev-parse`. Arbeiten auf `base` ist rot, ein losgelöster Stand gelb.
  - Ein fehlender Pflicht-Connector oder Skill ist rot, ein optionaler gelb.
- **Anzeige:**
  - Leiste: drei Punkte (Connectors, Skills, Branch) und „Setup“.
  - Panel: Abschnitt „Setup“ mit jeder Prüfung.
  - Als Text: `/cockpit setup`.
  - Werkzeug `check_setup` für Claude.
- **Handy-Seite:** Wallet-Karte „Setup“ mit „n von m“ oder „Alles bereit“ und den drei Punkten. Geöffnet zeigt sie jede Prüfung. Die Mod schreibt `cockpit/setup`, aber nur bei Änderungen.
- **Memory nach dem Merge:** Claude trägt jeden Merge vom Handy unter `## Merges` ein (siehe Ablauf „Cockpit · Merge“).
- **Noch offen:** Aus einem anderen Repo heraus braucht der Merge-Eintrag Schreibzugriff auf Else-Live-. Bis dahin trägt ihn die nächste Session in Else-Live- nach.

Ursprünglicher Plan:

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

- **Memory zurückschreiben:** Eine Session in einem anderen Repo braucht Schreibzugriff auf Else-Live- (per `add_repo` mit `push`). Lesen klappt ohne, weil die Memory-Dateien mit der Mod kommen.
- **Chats untereinander:** Cloud-Sessions brauchen evtl. einmal deine Freigabe, bevor sie andere Sessions erreichen dürfen.
- **Mod-Name:** offen.

## Übergabe: Stand und nächste Schritte (28.10.2026, nach Phase 4)

Für die nächste Session: Hier steht, was es gibt, wie es zusammenspielt und wie es weitergeht.

### Was es gibt

| Teil | Ort | Zweck |
| --- | --- | --- |
| Mod „cockpit“ | `mods/cockpit` | Skill-Launcher (Leiste, Panel, `/cockpit` als Text), Kontext-Ring in der Leiste, Abgleich mit der Handy-Seite. 15 Tests. |
| Handy-Seite | `apps/cockpit-web` (Quelltext), live: https://claude.ai/artifact/3mAJQLuy66EZ9EoNiqAgT8 | Das Cockpit auf dem Handy, siehe unten. |
| Marketplace | `.claude-plugin/marketplace.json` | `/plugin install cockpit --marketplace leesyashin/Else-Live-` |
| Design-Entwürfe | https://claude.ai/artifact/5EBWMLf4CEbFLtgNSRfi5Q | Fünf Richtungen; gewählt wurden Wallet (3) und Suche mit Vorschlägen (4). |

Die Handy-Seite zeigt:
- **oben:** Suche („Was willst du tun?“), Vorschläge, Kontext-Ring
- **darunter:** Bereiche als Wallet-Kartenstapel mit eigenem Muster je Bereich (Session, Design, Code, Daten, Business, Persönlich, Weitere, Empfohlen)
- **in einer geöffneten Karte:** Skills als Liste; gedrückt halten lädt den Skill, tippen öffnet ihn als Pass mit Anleitung und Referenzen
- **Aufgabe zu einem Skill:** wird in einer Karte oben am Bildschirm eingegeben

### Wie die Teile zusammenspielen

- **Warum eine Seite:** Die Claude-App auf dem Handy zeigt bei Cloud-Sessions keine Mod-Oberfläche. Die Session meldet dort keine Zeichenfläche. Deshalb ist die Handy-Oberfläche eine Artifact-Seite.
- **Seite → Claude:** Halten oder „Starten“ schickt per `comments.sendToClaude` einen Kommentar an alle Sessions, die die Seite beobachten. Format:
  - `Cockpit · Skill laden` + neue Zeile + `/<skill> [Aufgabe]`
  - `Cockpit · Skill installieren` + neue Zeile + `<Titel> von <Autor>: <Befehl>`
  - `Cockpit · Merge` + neue Zeile + `<owner/repo> #<Nummer>: <head> → <base>`
  - `Cockpit · PR prüfen` + neue Zeile + `<owner/repo>`
  - `Cockpit · Setup prüfen` + neue Zeile + `<repo>`
- **Claude → Seite:** über die Datenbank der Seite (Werkzeug `ArtifactData`):
  - `cockpit/status` mit `{ loaded: [{ skill, at }], session, updatedAt }`. Schreibt derzeit Claude von Hand, nachdem ein Skill geladen wurde.
  - `cockpit/pr` mit dem offenen PR des Branches, Felder siehe `apps/cockpit-web/README.md`. Schreibt Claude nach jedem Push, PR-Ereignis und Merge.
  - `cockpit/context` mit `{ sessionId, repo, used, max, threshold, costUsd, limits[], at }`. Schreibt die Mod automatisch nach jedem Schritt (Hook `turn.complete`, Einstellung `cockpitUrl`). Das Werkzeug `mcp__cockpit__sync_context` löst es sofort aus.
  - `cockpit/setup` mit `{ repo, branch, memory, checks[], at }`. Schreibt die Mod beim Start und nach Änderungen. Das Werkzeug `mcp__cockpit__check_setup` löst es sofort aus.

### So übernimmt eine neue Session

1. **Mod laden:** Skill `plugin-authoring` aufrufen. Dann `mods/cockpit` ohne `.claude-plugin/types` in den Mods-Ordner kopieren, den der Skill nennt, und den Nutzer „Turn them on“ bestätigen lassen. In einer Terminal-Session geht stattdessen `/plugin install cockpit --marketplace leesyashin/Else-Live-`.
2. **Seite beobachten:** `ArtifactComments` mit `action: watch` und der Seiten-URL. Erst dann kommen Aufträge vom Handy an.
3. **Auftrag „Cockpit · Skill laden“:**
   1. Den Skill mit dem Skill-Werkzeug starten, die Aufgabe als Argument.
   2. Im Kommentar-Thread kurz antworten und ihn auflösen.
   3. In `cockpit/status` den Eintrag `{ skill, at }` ergänzen, mit `if_version`.
4. **Auftrag „Cockpit · Merge“:**
   1. Den PR live prüfen (GitHub-Werkzeuge): offen, Head unverändert, CI grün auf dem aktuellen Commit, keine Konflikte. Die Seite ist nur der Wunsch, nicht der Beweis.
   2. `cockpit/pr` auf `merge: { state: 'running', at }` setzen.
   3. Ist der PR ein Entwurf, ihn freigeben. Dann per Squash mergen und den Branch löschen (`git push origin --delete <branch>`).
   4. `cockpit/pr` mit `state: 'merged'`, `merge: { state: 'done', at, sha, branchDeleted }` schreiben. Geht etwas nicht: `merge: { state: 'failed', at, message }` mit einem kurzen Grund auf Deutsch.
   5. Eine Zeile `- JJJJ-MM-TT · #<Nummer> <Titel>` oben unter `## Merges` in `mods/cockpit/memory/<repo>.md` eintragen und mit nach `main` bringen.
   6. Im Thread antworten und ihn auflösen.
5. **Auftrag „Cockpit · Setup prüfen“:** das Werkzeug `mcp__cockpit__check_setup` aufrufen (ohne geladene Mod: `/cockpit setup`). Danach im Thread antworten.
6. **Auftrag „Cockpit · PR prüfen“:** PR des aktuellen Branches lesen und `cockpit/pr` neu schreiben, danach im Thread antworten.
7. **Seite neu bauen:** wie in `apps/cockpit-web/README.md` beschrieben. Die Skill-Daten liefert `build_data.py` aus der jeweiligen Session.

### Nächste Schritte, in dieser Reihenfolge

1. **Skill-Status automatisch:** Die Mod schreibt geladene Skills (Hook `skill.prompt`) selbst in `cockpit/status`, so wie schon den Kontext. Dann wird der grüne Status ohne Handarbeit live.
2. **Phase 3 fertigstellen:**
   - `cockpit/pr` automatisch: Die Mod schreibt den PR nach jedem Push selbst, statt dass Claude es von Hand tut.
   - Merge-Knopf auch in der Mod (Desktop-Panel, zwei Stufen wie oben).
3. **Phase 4 abrunden:**
   - Memory-Dateien für weitere Repos anlegen, sobald dort gearbeitet wird.
   - Merge-Einträge aus anderen Repos zurück nach Else-Live- schreiben (Schreibzugriff klären).
4. **Phase 5, Chat-Teamwork:**
   - Ein Lead-Chat verteilt Aufgaben (`create_session`, `send_message`).
   - Der Status steht im Dokument `cockpit/team` und erscheint auf der Seite als Avatare.
5. **Kontext-Ringe pro Kategorie:** Die Mod gibt die Aufschlüsselung (`breakdown`) in `cockpit/context` mit, und das Kontext-Blatt zeigt sie an.
6. **Kleinigkeiten:**
   - Neue Skills erscheinen auf der Seite erst nach dem Neu-Veröffentlichen.
   - Favoriten gelten pro Gerät.
   - Der Mod-Name ist offen.

### Stolpersteine, schon gelöst

- **Gestapelte Wallet-Karten:** Im Browser-Test verdeckt die nächste Karte die vorige. Zum Öffnen den sichtbaren oberen Rand anklicken (`position: { x: 100, y: 22 }`).

- **Zustand der Mod:** Der Validator verlangt, dass jedes `atom(...)` in der Datei angelegt ist, die es liest oder schreibt. Deshalb liegt der Zustand nur in `hooks/skills.ts`, alle Zugriffe laufen über dessen Funktionen.
- **Slash-Befehl:** Befehlsname und Matcher als Literal schreiben (`'cockpit'`). Sonst zählt der Hook als prüfender Hook.
- **`$.tool.call`:** nie in einer Variablen ablegen. `ArtifactData` mit Cast direkt am Aufruf rufen, `($.tool.call as unknown as …)(…)`. Sonst braucht `tsc` über 2 GB Speicher.
- **Handy-Oberfläche:** Die Elementliste enthält `Input`, gezeichnet wird es aber nicht. Deshalb nach `e.surface` entscheiden, nicht nach der Liste.
- **Zusammenfass-Marke:** Cloud-Sessions fassen bei 80 % zusammen (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`). Die Marke ist (Fenster − 20k) × 80 %, also 784k bei 1 Mio.
- **Connector:** „Claude Code Remote“ ließ sich auf dem Handy nicht verbinden. Deshalb läuft der Kontext über die Datenbank der Seite.
- **iOS-Eingabe:** Ein Eingabefeld unten in einem fixierten Blatt schiebt das Blatt weg. Eingaben deshalb in einer Karte oben am Bildschirm.
- **Prüfen:** `claude plugin validate mods/cockpit`, `claude plugin test mods/cockpit` und `tsc -p <Mod-Ordner>`. Die Typen liegen nach dem Laden in `.claude-plugin/types`.
