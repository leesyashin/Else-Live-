# Büro – deine Claude Code Sessions als Pixel-Art-Büro

![Vorschau](vorschau.png)

Jede Claude-Code-Session auf deinem PC ist ein Mitarbeiter an einem Schreibtisch.
Seine Agents stehen als Praktikanten daneben. Hat jemand eine Frage oder braucht
eine Freigabe, geht er ins **Chefbüro** zu dir. Die Sessions können sich außerdem
gegenseitig kurze Nachrichten schicken. Im Büro fliegen die dann als Briefe von
Tisch zu Tisch.

## Installieren

Das Repository ist privat. Dein PC muss deshalb bei GitHub angemeldet sein, z. B.
über Git für Windows mit dem Git Credential Manager oder über `gh auth login` und
danach `gh auth setup-git`.

**In der Desktop-App:** Klicke auf **+** neben dem Eingabefeld, dann auf
**Plugins** und **Add marketplace**. Gib `leesyashin/Else-Live-` ein und klicke
danach bei **buero** auf **Add plugin**.

**Im Terminal:**

```
/plugin install buero --marketplace leesyashin/Else-Live-
```

Bestätige mit `y` und wähle den Bereich *user*. Dann läuft das Büro in jeder
neuen Session.

## Benutzen

- `/buero` öffnet das Büro als Fenster. Du kannst es in jeder Session öffnen, alle sehen dasselbe Büro.
- Ein Klick auf einen Mitarbeiter (unter dem Bild) zeigt Auftrag, aktuelle Tätigkeit, Frage, Agents und Ordner.
- In der Detailansicht kannst du dem Mitarbeiter eine Nachricht schicken.
- Fährst du in der Desktop-App mit der Maus über eine Figur, erscheint ein Tooltip mit den Details.

| Im Büro | Bedeutung |
| --- | --- |
| tippt am Rechner, Code läuft über den Bildschirm | arbeitet |
| hat sich mit Kaffee zu dir umgedreht, grüner Haken | fertig, wartet auf deinen nächsten Auftrag |
| steht im Chefbüro mit **?** | hat eine Frage an dich |
| steht im Chefbüro mit **OK?** | braucht eine Freigabe |
| schläft am Tisch (Zzz) | hängt: 5 Min. keine Aktivität während eines Auftrags |
| roter Bildschirm, **!** | Fehler beim Modell-Aufruf |
| leerer Stuhl, schwarzer Bildschirm, blasses Namensschild | Session geschlossen oder nicht erreichbar |

Antworten und Freigaben gibst du weiterhin im Fenster der jeweiligen Session. Das
Büro zeigt dir nur, *wo* jemand wartet.

## Absprache zwischen den Sessions

Jede Session bekommt zwei Werkzeuge:

- `kollegen` zeigt, welche anderen Sessions gerade woran arbeiten.
- `nachricht` schickt einem Kollegen eine kurze Nachricht.

Die Sessions sind angewiesen, das nur zu nutzen, wenn es echte Arbeit spart, und
höchstens **5 Nachrichten pro Stunde** zu schicken. Das Limit gilt auch für das
eingebaute SendMessage an andere Sessions. Nachrichten innerhalb des eigenen Teams
einer Session zählen nicht.

## Einstellungen

Unter `/config` findest du zwei Einstellungen:

- **Nachrichten pro Stunde** (Standard 5)
- **Hängt nach Minuten** (Standard 5)

## Was du wissen solltest

- Das Büro zeigt die Sessions **auf diesem PC**. Cloud-Sessions (claude.ai/code, Handy-App) laufen in eigenen Containern und erscheinen hier noch nicht.
- Jede Session schreibt ihren Status in `~/.claude/buero/sessions/<session-id>.json`, unter Windows `%USERPROFILE%\.claude\buero\sessions`. Darin stehen Projektname, Ordner und die ersten 300 Zeichen deines letzten Auftrags. Die Dateien bleiben auf deinem Rechner.
- Die Mod nutzt die neue Mod-Schnittstelle von Claude Code. Sie braucht eine aktuelle Version (gebaut mit 2.1.302).

## Entwickeln

```
claude plugin validate buero
claude plugin test buero
```
