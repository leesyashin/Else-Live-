# Cockpit-Seite (Handy)

Die Mod in `mods/cockpit` zeichnet nur dort, wo eine Oberfläche Mods darstellt: in der Desktop-App und im Terminal. Die Claude-App auf dem Handy zeigt bei Cloud-Sessions keine Mod-Oberfläche. Für das Handy gibt es deshalb diese Seite als Artifact.

Was die Seite zeigt:
- oben eine Suche („Was willst du tun?“) mit Vorschlägen und Schnellbegriffen
- darunter die Bereiche als Kartenstapel wie in Apple Wallet: Diese Session, sechs Kategorien, Empfohlen
- eine geöffnete Karte zeigt ihre Skills als Karten
- **gedrückt halten** lädt einen Skill, **tippen** öffnet ihn als Pass mit SKILL.md und Referenzdateien
- **Kontext-Ring** oben rechts und auf der Session-Karte: wie voll das Kontextfenster der Session ist, alle 30 Sekunden live über „Claude Code Remote“. Antippen zeigt den großen Ring mit der Marke fürs automatische Zusammenfassen, den Kosten und dem Nutzungslimit.

Wie „Starten“ funktioniert:
1. Die Seite schickt den Auftrag per „Send to Claude“ als Kommentar an die Session.
2. Claude startet den Skill und antwortet im Kommentar.
3. Claude schreibt den Live-Status in die Datenbank der Seite, im Dokument `cockpit/status`. Die Seite liest ihn sofort mit.

## Bauen

```
python3 -I build_data.py <ausgabe-ordner>   # schreibt index.json und skills.json
```

Danach in `shell.html` zwei Platzhalter ersetzen:

- `__INDEX__` durch den Inhalt von `index.json`, dabei `</` als `<\/` schreiben
- `__SESSION__` durch die ID der Claude-Session, deren Kontext der Ring zeigen soll

Das Ergebnis als `index.html` veröffentlichen, mit `skills.json` als zusätzlicher Datei und diesen Fähigkeiten: `db`, `user`, `comments` und `mcp` mit dem Connector „Claude Code Remote“ (Werkzeug `get_session`).

`skills.json` wird nicht eingecheckt. Es enthält die Anleitungen deiner eigenen Skills.
