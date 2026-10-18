# Büro – deine Claude Code Sessions als Pixel-Art-Büro

![Dein Cloud-Büro](vorschau-cloud.png)

Jede Claude-Code-Session ist ein Mitarbeiter an einem Schreibtisch. Wer auf
dich wartet, sitzt im **Chefbüro** vor deinem Tisch. Die Sessions können sich
außerdem gegenseitig kurze Nachrichten schicken.

## Am einfachsten: die Büro-Seite

**[Claude-Büro öffnen](https://claude.ai/artifact/94pH1R4YMfQgxPUeghXbiK)**. Die Seite läuft in der Desktop-App, im
Browser und auf dem iPhone. Sie liest deine Cloud-Sessions live über den
Connector „Claude Code Remote“ und fragt beim ersten Öffnen einmal nach deiner
Erlaubnis. Ein Klick auf eine Figur zeigt die Details, dort kannst du der
Session auch eine Nachricht schicken.

**Woher die Seite ihre Daten hat:** Darf die Seite den Connector nutzen, liest
sie selbst alle 30 Sekunden. Ist er gesperrt, liest sie den Stand, den jede
Cloud-Session mit der Büro-Mod höchstens einmal pro Minute in den Speicher der
Seite schreibt (über das Setup-Skript unten). Oben rechts steht, wie alt der
Stand ist. Antworten direkt aus dem Büro gehen nur über den Connector; sonst
nutzt du „Session öffnen“.

Die Seite wird aus `seite/vorlage.html` und dem Zeichen-Code der Mod gebaut:
`node scripts/build-office-page.mjs`.

## Als Mod in Cloud-Sessions (Fenster in der Session)

Die Desktop-App zeigt Mod-Fenster in Cloud-Sessions derzeit nicht an
(„no surface is attached“). Die Werkzeuge `kollegen` und `nachricht` und das
Nachrichtenlimit wirken dort trotzdem.

**Einmal einrichten:**

1. Öffne irgendeine Cloud-Session und klicke in der Titelleiste auf das Umgebungsmenü, dann auf **Bearbeiten**.
2. Kopiere den kompletten Inhalt von [`buero-cloud-setup.sh`](../../../buero-cloud-setup.sh) in das Feld **Setup-Skript**. Steht dort schon etwas, häng ihn unten an. Dann speichern.
3. Starte eine **neue** Session. Ab jetzt hat jede neue Cloud-Session dieser Umgebung die Mod. Bereits laufende Sessions bekommen sie erst, wenn ihr Container neu aufgebaut wird.

Das Setup-Skript schreibt die Mod nach `~/.claude/skills/buero`. Von dort lädt
Claude Code sie in jeder Session, egal auf welchem Repo.

**Benutzen:** Tippe in einer Session `/buero`. Das Büro zeigt deine
Cloud-Sessions, die arbeiten, hängen oder auf dich warten, und die fertigen,
deren PR noch auf dein Mergen wartet (siehe unten). Es aktualisiert sich alle
10 Sekunden.

- Wartet eine Session auf dich, steht sie im Chefbüro. Oben im Fenster steht, was sie braucht.
- Ein Klick auf einen Mitarbeiter zeigt Auftrag, Repo, Branch, letzte Zusammenfassung, Kontext und Kosten. Dort findest du außerdem den Link **Session öffnen** und ein Feld für eine Nachricht. Die iPhone-App zeigt noch keine Eingabefelder, der Link funktioniert dort aber.
- Eine Nachricht aus dem Büro kommt bei der Session als **Nachricht einer anderen Session** an, nicht als deine eigene Eingabe. Für einfache Antworten („Ja, mach Variante B“) reicht das. Freigaben, Moduswechsel oder Heikles erledigst du in der Session selbst.

**Nach Änderungen an der Mod:** Führe `scripts/make-cloud-setup.sh` aus und füge
das neue `buero-cloud-setup.sh` wieder ins Setup-Skript ein.

## Wann eine Cloud-Session das Büro verlässt

Ist ihre Arbeit auf main gemergt, ist eine Session endgültig fertig und
verschwindet aus dem Büro. Die Cloud speichert keinen Merge-Status, deshalb
liest das Büro die kurze Zusammenfassung, die die Cloud nach jeder Runde einer
Session schreibt („PR #2 merged to main“, „PR auf main gemergt“):

- **Auf main gemergt:** nicht mehr im Büro.
- **PR offen:** sitzt mit Kaffee am Tisch, der Bildschirm zeigt „PR #8 mergen“. Bleibt, bis der PR gemergt ist, egal wie alt.
- **Fertig ohne PR** (z. B. eine beantwortete Frage): bleibt, bis du die Session einmal geöffnet hast, höchstens einen Tag.
- **Arbeitet, hängt oder wartet auf dich:** immer im Büro, auch wenn eine frühere Runde schon gemergt hat.

Mergst du einen PR selbst auf GitHub, erfährt die Session das nur, wenn sie
den PR beobachtet. Sonst bleibt sie als „PR bereit“ sitzen, bis du ihr kurz
Bescheid gibst oder sie archivierst.

## Auf dem PC (lokale Sessions)

Hier liest das Büro die Sessions auf deinem Rechner, inklusive ihrer Agents
als Praktikanten und Freigabe-Anfragen.

![Lokales Büro](vorschau.png)

Das Repository ist privat. Dein PC muss deshalb bei GitHub angemeldet sein,
z. B. über Git für Windows.

- **Desktop-App:** Klicke auf **+** neben dem Eingabefeld, dann auf **Plugins** und **Add marketplace**. Gib `leesyashin/Else-Live-` ein und klicke bei **buero** auf **Add plugin**.
- **Terminal:** `/plugin install buero --marketplace leesyashin/Else-Live-`

## Was die Figuren bedeuten

| Im Büro | Cloud | PC |
| --- | --- | --- |
| tippt, Hände an der Tastatur, Code schreibt sich auf den Bildschirm | arbeitet | arbeitet |
| zu dir umgedreht, trinkt Kaffee, Bildschirm „PR #… mergen“ | fertig, PR wartet auf dein Mergen | – |
| zu dir umgedreht, trinkt Kaffee, grüner Haken | fertig ohne PR, noch nicht gelesen | fertig, wartet auf deinen nächsten Auftrag |
| kommt ins Chefbüro und setzt sich vor deinen Tisch, **?** | wartet auf dich | hat eine Frage |
| sitzt im Chefbüro mit **OK?** | – | braucht eine Freigabe |
| schläft am Tisch (Zzz), Sanduhr | arbeitet, aber seit 5 Min. nichts Neues | 5 Min. keine Aktivität während eines Auftrags |
| Hände am Kopf, roter Bildschirm, **!** | fehlgeschlagen | Fehler beim Modell-Aufruf |
| nicht mehr da | auf main gemergt: endgültig fertig | Session beendet |

In der Desktop-App zeigt ein Tooltip über jeder Figur die Details.

## Absprache zwischen den Sessions

Jede Session mit der Mod bekommt zwei Werkzeuge: `kollegen` zeigt, wer gerade
woran arbeitet, und `nachricht` schickt einem Kollegen eine kurze Nachricht.
Die Sessions sind angewiesen, das nur zu nutzen, wenn es echte Arbeit spart,
und höchstens **5 Nachrichten pro Stunde** zu schicken. Das Limit gilt auch für
das eingebaute `send_message` der Cloud und für SendMessage an andere Sessions.
Nachrichten innerhalb des eigenen Teams einer Session zählen nicht.

## Einstellungen

Standardmäßig gelten **5 Nachrichten pro Stunde** und **„hängt“ nach 5 Minuten**.
Auf dem PC kannst du beides unter `/config` ändern.

## Was du wissen solltest

- In der Cloud siehst du keine Agents fremder Sessions, nur die der Session, in der das Büro offen ist.
- Auf dem PC schreibt jede Session ihren Status nach `~/.claude/buero/sessions/<session-id>.json`. Darin stehen Projektname, Ordner und die ersten 300 Zeichen deines letzten Auftrags. Die Dateien bleiben auf deinem Rechner.
- Die Mod nutzt die neue Mod-Schnittstelle von Claude Code. Gebaut und getestet wurde sie mit Version 2.1.302.

## Entwickeln

```
claude plugin validate .claude/skills/buero
claude plugin test .claude/skills/buero
scripts/make-cloud-setup.sh
```
