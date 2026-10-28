# Cockpit-Seite (Handy)

Die Mod in `mods/cockpit` zeichnet nur dort, wo eine Oberfläche Mods darstellt: in der Desktop-App und im Terminal. Die Claude-App auf dem Handy zeigt bei Cloud-Sessions keine Mod-Oberfläche. Für das Handy gibt es deshalb diese Seite als Artifact.

Was die Seite zeigt:
- oben eine Suche („Was willst du tun?“) mit Vorschlägen und Schnellbegriffen
- darunter ein Kartenstapel wie in Apple Wallet: Diese Session, Merge, Setup, Team und Skills
- die Karte **Skills** öffnet einen zweiten Stapel mit den sechs Bereichen und Empfohlen; „Zurück“ oder ein Tipp auf die Skills-Karte führt zum Hauptstapel
- eine geöffnete Karte zeigt ihre Skills als Karten
- **gedrückt halten** lädt einen Skill, **tippen** öffnet ihn als Pass mit SKILL.md und Referenzdateien
- **Kontext-Ring** oben rechts und auf der Session-Karte: wie voll das Kontextfenster der Session ist, alle 30 Sekunden live aus der Datenbank der Seite. Dort schreibt ihn die Cockpit-Mod nach jedem Schritt von Claude hinein (Dokument `cockpit/context`, Einstellung `cockpitUrl` der Mod). Es braucht keinen Connector. Antippen zeigt den großen Ring mit der Marke fürs automatische Zusammenfassen, den Kosten und dem Nutzungslimit.

- **Merge-Karte** direkt unter der Session: der offene PR des Branches mit Ziel-Branch groß, CI-Status, Konflikten und Dateien. Der Knopf ist gesperrt, solange CI rot ist oder läuft und solange es Konflikte gibt. **1,2 s gedrückt halten** schickt `Cockpit · Merge` an Claude. Der Auftrag nennt die Session, die den PR eingetragen hat (`Session: <ID>`); nur sie merged. Claude prüft noch einmal, merged per Squash, löscht den Branch und trägt das Ergebnis ein. Dann spielt die Karte die Merge-Animation. Ein gemergter PR bleibt sichtbar, bis du die Karte einmal geöffnet hast; nach dem Schließen wird er archiviert (`archivedAt`). Die Karte bleibt und zeigt „Kein offener PR“, bis der nächste PR kommt.

- **Setup-Karte:** Ist das Repo bereit? Grüne, gelbe und rote Punkte für Connectors, Skills und Branch, geprüft gegen das Memory des Repos. Die Daten schreibt die Cockpit-Mod beim Start der Session.

- **Team-Karte:** die Chats, auf die Claude eine größere Aufgabe verteilt hat, als Avatare mit Status. „Aufgabe verteilen“ schickt `Cockpit · Team`. Hat ein Chat eine Frage oder einen Konflikt, erscheint oben ein Hinweis mit „Antworten“.

Jeder Auftrag nennt die Session, für die er gedacht ist (`Session: <ID>`, die Session, die zuletzt `cockpit/context` geschrieben hat). Nur „Skill installieren“ geht ohne Namen raus: Dort übernimmt die erste Session, die `cockpit/jobs/threads/<Thread-ID>` anlegt. Installiert wird immer global (`mods/cockpit/skills`), nie nur in einer Session.

**v2 (nach apple-design):**
- Das Blatt (Pass) folgt dem Finger 1:1 und schließt mit der Geschwindigkeit, mit der du loslässt. Ein Wisch nach unten schließt, ein kurzes Ziehen federt zurück.
- Das Blatt lässt sich mitten in der Bewegung greifen, auch beim Wegfliegen. Nach oben gibt es nach wie ein Gummiband.
- Die Suche schwebt als Material über der Seite.
- Bei reduzierter Bewegung blendet das Blatt nur über. Reduzierte Transparenz und erhöhter Kontrast werden beachtet.

Wie „Starten“ funktioniert:
1. Die Seite schickt den Auftrag per „Send to Claude“ als Kommentar an die Session.
2. Claude startet den Skill und antwortet im Kommentar.
3. Claude schreibt den Live-Status in die Datenbank der Seite, im Dokument `cockpit/status`. Die Seite liest ihn sofort mit.

Daten, die Claude in die Datenbank der Seite schreibt (Sammlung `cockpit`):

| Dokument | Inhalt |
| --- | --- |
| `status` | `{ loaded: [{ skill, at }], session, updatedAt }` |
| `context` | schreibt die Mod, siehe oben |
| `skills` | `{ installed: [{ id, name, title, author, at, pr }] }`: über das Cockpit installierte Skills. Sie verlassen „Empfohlen“ sofort und stehen unter Design. |
| `jobs/threads/<Thread-ID>` | `{ session, kind, at }`: welche Session einen Auftrag übernommen hat. Nur die erste legt das Dokument an. |
| `setup` | schreibt die Mod: `{ repo, branch, memory, checks: [{ group: Memory\|Connectors\|Skills\|Branch, name, state: ok\|warn\|fail, detail }], at }` |
| `team` | schreibt der Lead-Chat: `{ goal, lead, startedAt, state }` |
| `team/members/<Session-ID>` | schreibt jeder Team-Chat selbst: `{ name, task, state: working\|waiting\|question\|conflict\|done\|failed, note, question, branch, pr, url, updatedAt }` |
| `pr` | `{ repo, number, title, url, head, base, draft, state: open\|merged\|closed, ci: success\|failure\|pending\|none, checks: [{ name, state }], mergeable: true\|false\|null, files, additions, deletions, updatedAt, session, sessionUrl?, archivedAt?, merge?: { state: running\|done\|failed, at, sha, branchDeleted, message } }` |

`mergeable: null` heißt „GitHub prüft noch“ und sperrt den Knopf ebenso wie Konflikte.

## Bauen

```
python3 -I build_data.py <ausgabe-ordner>   # schreibt index.json und skills.json
```

Danach in `shell.html` den Platzhalter ersetzen:

- `__INDEX__` durch den Inhalt von `index.json`, dabei `</` als `<\/` schreiben

Das Ergebnis als `index.html` veröffentlichen, mit `skills.json` als zusätzlicher Datei und diesen Fähigkeiten: `db`, `user`, `comments`.

`skills.json` wird nicht eingecheckt. Es enthält die Anleitungen deiner eigenen Skills.
