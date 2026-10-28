# Cockpit-Seite (Handy)

Die Mod in `mods/cockpit` zeichnet nur dort, wo eine Oberfläche Mods darstellt: in der Desktop-App und im Terminal. Die Claude-App auf dem Handy zeigt bei Cloud-Sessions keine Mod-Oberfläche. Für das Handy gibt es deshalb diese Seite als Artifact.

Was die Seite zeigt:
- oben eine Suche („Was willst du tun?“) mit Vorschlägen und Schnellbegriffen
- darunter die Bereiche als Kartenstapel wie in Apple Wallet: Diese Session, sechs Kategorien, Empfohlen
- eine geöffnete Karte zeigt ihre Skills als Karten
- **gedrückt halten** lädt einen Skill, **tippen** öffnet ihn als Pass mit SKILL.md und Referenzdateien
- **Kontext-Ring** oben rechts und auf der Session-Karte: wie voll das Kontextfenster der Session ist, alle 30 Sekunden live aus der Datenbank der Seite. Dort schreibt ihn die Cockpit-Mod nach jedem Schritt von Claude hinein (Dokument `cockpit/context`, Einstellung `cockpitUrl` der Mod). Es braucht keinen Connector. Antippen zeigt den großen Ring mit der Marke fürs automatische Zusammenfassen, den Kosten und dem Nutzungslimit.

- **Merge-Karte** direkt unter der Session: der offene PR des Branches mit Ziel-Branch groß, CI-Status, Konflikten und Dateien. Der Knopf ist gesperrt, solange CI rot ist oder läuft und solange es Konflikte gibt. **1,2 s gedrückt halten** schickt `Cockpit · Merge` an Claude. Claude prüft noch einmal, merged per Squash, löscht den Branch und trägt das Ergebnis ein. Dann zeichnet die Karte ein Häkchen.

- **Setup-Karte:** Ist das Repo bereit? Grüne, gelbe und rote Punkte für Connectors, Skills und Branch, geprüft gegen das Memory des Repos. Die Daten schreibt die Cockpit-Mod beim Start der Session.

- **Team-Karte:** die Chats, auf die Claude eine größere Aufgabe verteilt hat, als Avatare mit Status. „Aufgabe verteilen“ schickt `Cockpit · Team`. Hat ein Chat eine Frage oder einen Konflikt, erscheint oben ein Hinweis mit „Antworten“.

Wie „Starten“ funktioniert:
1. Die Seite schickt den Auftrag per „Send to Claude“ als Kommentar an die Session.
2. Claude startet den Skill und antwortet im Kommentar.
3. Claude schreibt den Live-Status in die Datenbank der Seite, im Dokument `cockpit/status`. Die Seite liest ihn sofort mit.

Daten, die Claude in die Datenbank der Seite schreibt (Sammlung `cockpit`):

| Dokument | Inhalt |
| --- | --- |
| `status` | `{ loaded: [{ skill, at }], session, updatedAt }` |
| `context` | schreibt die Mod, siehe oben |
| `setup` | schreibt die Mod: `{ repo, branch, memory, checks: [{ group: Memory\|Connectors\|Skills\|Branch, name, state: ok\|warn\|fail, detail }], at }` |
| `team` | schreibt der Lead-Chat: `{ goal, lead, startedAt, state }` |
| `team/members/<Session-ID>` | schreibt jeder Team-Chat selbst: `{ name, task, state: working\|waiting\|question\|conflict\|done\|failed, note, question, branch, pr, url, updatedAt }` |
| `pr` | `{ repo, number, title, url, head, base, draft, state: open\|merged\|closed, ci: success\|failure\|pending\|none, checks: [{ name, state }], mergeable: true\|false\|null, files, additions, deletions, updatedAt, merge?: { state: running\|done\|failed, at, sha, branchDeleted, message } }` |

`mergeable: null` heißt „GitHub prüft noch“ und sperrt den Knopf ebenso wie Konflikte.

## Bauen

```
python3 -I build_data.py <ausgabe-ordner>   # schreibt index.json und skills.json
```

Danach in `shell.html` den Platzhalter ersetzen:

- `__INDEX__` durch den Inhalt von `index.json`, dabei `</` als `<\/` schreiben

Das Ergebnis als `index.html` veröffentlichen, mit `skills.json` als zusätzlicher Datei und diesen Fähigkeiten: `db`, `user`, `comments`.

`skills.json` wird nicht eingecheckt. Es enthält die Anleitungen deiner eigenen Skills.
