# Cockpit-Seite (Handy)

Die Mod in `mods/cockpit` zeichnet nur dort, wo eine Oberfläche Mods darstellt: in der Desktop-App und im Terminal. Die Claude-App auf dem Handy zeigt bei Cloud-Sessions keine Mod-Oberfläche. Für das Handy gibt es deshalb diese Seite als Artifact.

Was die Seite zeigt:
- alle Skills der Session, farbig nach Kategorie
- Status: geladen, verfügbar, empfohlen
- Infokarten mit SKILL.md und Referenzdateien

Wie „Starten“ funktioniert:
1. Die Seite schickt den Auftrag per „Send to Claude“ als Kommentar an die Session.
2. Claude startet den Skill und antwortet im Kommentar.
3. Claude schreibt den Live-Status in die Datenbank der Seite, im Dokument `cockpit/status`. Die Seite liest ihn sofort mit.

## Bauen

```
python3 -I build_data.py <ausgabe-ordner>   # schreibt index.json und skills.json
```

Danach `__INDEX__` in `shell.html` durch den Inhalt von `index.json` ersetzen, dabei `</` als `<\/` schreiben. Das Ergebnis als `index.html` veröffentlichen, mit `skills.json` als zusätzlicher Datei und diesen Fähigkeiten: `db`, `user`, `comments`.

`skills.json` wird nicht eingecheckt. Es enthält die Anleitungen deiner eigenen Skills.
