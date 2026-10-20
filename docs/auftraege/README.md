# Aufträge

Ein Auftrag ist der Vertrag zwischen dir (oder dem Chef vom Dienst) und einer Session: Ziel, Kontext, Umsetzung, Abnahme. Im Büro lebt er auf dem Aufgabenbrett der Büro-Seite (`auftraege/<id>`, angelegt mit `mcp__buero__auftrag` oder auf der Seite); größere Aufträge, die über Tage laufen, liegen zusätzlich als Datei hier, damit sie im Repo versioniert sind.

- Dateiname: `<phase>-<nr>-<name>.md` für Aufträge aus dem Plan (`1-6-verteilung.md`), sonst `<nr>-<name>.md`.
- Vorlage: [`vorlage.md`](vorlage.md). Jeder Abschnitt bleibt, auch wenn er kurz ist.
- Die Session, die den Auftrag bearbeitet, nimmt ihn auf dem Brett an (`aktion=annehmen`), meldet ihren Stand (`mcp__buero__stand`), meldet Review und Abschluss (`aktion=review`, `aktion=abschliessen`) und gibt bei Blockade ab (`mcp__buero__abgeben`).
- Was noch offen ist, steht in [`offen.md`](offen.md).
