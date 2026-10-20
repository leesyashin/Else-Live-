# Chef vom Dienst: Betrieb

Der Prompt, mit dem die Session „Chef vom Dienst“ startet, steht an einer Stelle: in der Mod, `.claude/skills/buero/hooks/auftraege.ts`, Funktion `cvdPrompt`. Er wird nicht abgeschrieben; wer ihn lesen will, liest ihn dort. Die Mod startet damit jeden Chef vom Dienst selbst.

## Starten

In irgendeiner Cloud-Session mit der Büro-Mod: `mcp__buero__kollegen_holen auftrag=cvd`. Die Mod startet die Session im Repo Else-Live- mit dem Titel „Chef vom Dienst“, dem Tag `buero:rolle=cvd`, dem Modell der Regel (Standard claude-opus-5-5) und, wenn schon einer läuft, dem Tag `buero:vorgaenger=<Session>`. Läuft der Befehl in der Session des bisherigen Chefs vom Dienst, geht der in den Ruhestand: Er gibt die Lease sofort ab, hält keine Runden mehr und nimmt nichts Neues an.

## Was die Mod beim Start selbst erledigt

- **Wecker.** Sobald die Rolle erkannt ist, bindet die Mod die geplante Aufgabe „Chef vom Dienst wach halten“ (alle drei Stunden, `persistent_session_id`) an die neue Session und löscht Kopien, die an andere Sessions gebunden sind.
- **Vorgänger.** Sobald die neue Session das Büro hält, archiviert die Mod die Session aus `buero:vorgaenger` und notiert es im Logbuch.
- **Watch.** Die Watch auf die Büro-Seite, damit Kommentare die Session wecken.

Die Session selbst macht nur noch: Tag prüfen (`get_session`, sonst `set_session_tags`), Bereitschaft starten (`sleep 7100` im Hintergrund), „Bereit.“ antworten. Das steht im Prompt.

## Ablösung bei vollem Kontext

Jede Runde kostet Kontext, und die Session lebt Tage. Ist der Kontext zu 75 Prozent voll (`ABLOESE_PROZENT` in `auftraege.ts`), und der Chef vom Dienst arbeitet gerade nicht und hat kein Kommando offen, startet die Mod von selbst einen Nachfolger, meldet es ihm und dir (Push) und schreibt es ins Logbuch. Alles Zustandsbehaftete liegt in der Datenbank der Seite, darum braucht der Nachfolger keine Übergabe: Er liest Aufträge und Kollegen und macht weiter. Wecker, die der alte sich selbst gestellt hatte (`send_later`), verfallen mit seiner Archivierung; das ist gewollt, die PR-Wache und der Rundgang des Nachfolgers decken sie ab.

## Neue Version der Mod

`buero-cloud-setup.sh` von main ins Setup-Skript der Umgebung einfügen (die Cloud baut ihr Abbild sofort neu; beim Bau gibt es keinen GitHub-Zugang, es zählt die eingebettete Kopie), die Seite `seite/buero.html` neu veröffentlichen, dann in der laufenden Chef-vom-Dienst-Session oder einer anderen Session mit der Mod `mcp__buero__kollegen_holen auftrag=cvd`. Der Rest (Wecker, Archivieren) passiert von selbst. Laufende Arbeiter-Sessions behalten ihre Version.
