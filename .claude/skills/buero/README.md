# Büro – deine Claude Code Sessions als Pixel-Art-Büro

![Dein Cloud-Büro](vorschau-cloud.png)

Jede Claude-Code-Session ist ein Mitarbeiter an einem Schreibtisch. Wer auf
dich wartet, sitzt im **Chefbüro** vor deinem Tisch. Die Sessions können sich
außerdem gegenseitig kurze Nachrichten schicken.

## Am einfachsten: die Büro-Seite

**[Claude-Büro öffnen](https://claude.ai/artifact/94pH1R4YMfQgxPUeghXbiK)**. Die Seite läuft in der Desktop-App, im
Browser und auf dem iPhone.

- **Chefbüro:** Wartet eine Session auf dich, sitzt sie vor deinem Tisch. Rechts steht ihre Frage im vollen Wortlaut, nicht nur die Kurzfassung. Ein Klick darauf öffnet die Session mit einem Antwortfeld direkt unter der Frage.
- **Antworten aus dem Büro:** Tipp die Antwort ein und drück auf **Senden**. Die Nachricht landet im Briefkasten der Seite. Unter dem Feld siehst du, wo sie gerade ist: *im Briefkasten*, *unterwegs*, *zugestellt (14:02, über den Boten)* oder *nicht zugestellt*. Solange sie noch im Briefkasten liegt, kannst du sie zurückziehen.
- **Schwarzes Brett** unter dem Büro: Hier steht, was in den letzten 7 Tagen passiert ist. Wer wieder arbeitet, wer auf dich wartet, wer fertig ist oder gepusht hat, welche PRs aufgehen und gemergt werden und was ihr euch geschrieben habt.
- **Verlauf** einer Session: Ein Klick auf eine Figur zeigt dieselben Einträge nur für diese Session.
- **Bote** oben rechts: Dort steht, welche Session gerade das Büro aktuell hält und deine Nachrichten zustellt. Ist keine wach, steht dort „Kein Bote wach“.

### So hält sich das Büro aktuell

Der Connector „Claude Code Remote“ lässt die Seite bei deinem Konto nicht selbst
lesen (blocked_by_policy). Die Arbeit machen deshalb die Cloud-Sessions mit der
Büro-Mod (Setup-Skript unten). Jede schaut alle **15 Sekunden** nach dem Büro.

- **Ein Bote zur Zeit:** Die erste Büro-Session, die läuft, wird zum Boten und meldet das im Speicher der Seite. Der Bote liest die Session-Liste, schreibt sie für die Seite, führt das Logbuch fürs Schwarze Brett, holt die vollständigen Fragen wartender Sessions und stellt Post zu. Hört er auf, übernimmt nach spätestens 90 Sekunden die nächste Büro-Session.
- **Post holen die Sessions selbst ab:** Eine Session mit der Mod holt ihre eigene Post innerhalb von 15 Sekunden ab. Arbeitet sie gerade, bekommt sie die Nachricht mit dem Ergebnis ihres nächsten Arbeitsschritts, ohne dass ihr Auftrag abbricht. Endet der Auftrag vorher, kommt die Nachricht gleich danach als eigene Runde. Hat eine Session keine Mod, bringt der Bote die Nachricht nach 20 Sekunden. Die Cloud reicht sie dann aber erst weiter, wenn der laufende Auftrag fertig ist.
- **Jede Session meldet, was nur sie weiß:** dass sie gepusht hat (und damit ihren PR aktualisiert), dass sie einen PR erstellt oder gemergt hat, wem sie geschrieben hat. Dazu fragt sie einmal pro Minute bei GitHub nach dem Stand ihres eigenen PRs.

Oben rechts steht, wie alt der Stand ist. Ist seit 5 Minuten keine Büro-Session
wach, sagt ein Band über dem Büro, von wann das Bild ist. **Grenze:** Ist gar
keine Büro-Session wach, wird nichts aktualisiert und keine Post zugestellt.
Deine Nachrichten bleiben dann im Briefkasten liegen, bis wieder eine läuft.

### Ein Ablauf als Beispiel

Du sagst einer Session im Büro: „Merge PR #5 auf main.“ Sie merkt, dass inzwischen
ein Review-Kommentar da ist, passt etwas an und macht einen neuen PR. Auf dem
Schwarzen Brett steht dann ungefähr:

| Zeit | Eintrag |
| --- | --- |
| 14:02 | Du → Mia: „Merge PR #5 auf main.“ · zugestellt |
| 14:02 | Mia · arbeitet wieder |
| 14:06 | Mia · hat gepusht (claude/login), PR #5 aktualisiert |
| 14:09 | Mia · hat PR #6 erstellt |
| 14:10 | Mia · fertig: PR #6 offen, CI grün |
| 14:10 | Mia · neuer PR #6 offen, wartet aufs Mergen |

Im Büro sitzt Mia dazwischen tippend am Tisch und danach mit Kaffee und „PR #6
mergen“ auf dem Bildschirm. Ist PR #6 gemergt, steht „PR #6 gemergt, fertig“ am
Brett und Mia verlässt das Büro.

### Was eine Nachricht aus dem Büro darf

Eine Nachricht aus dem Büro kommt bei der Session als **Büro-Nachricht** an
(„[Büro] Nachricht vom Nutzer, geschrieben im Büro-Fenster“), nicht als deine
eigene Eingabe. Für Antworten wie „Ja, nimm Variante B“ reicht das. Etwas
Unumkehrbares wie einen Merge auf main führt eine Session darauf allein unter
Umständen nicht aus, und Auswahl-Dialoge mit Knöpfen oder Freigaben lassen sich
nur in der Session selbst beantworten. Dafür steht **Session öffnen** direkt
daneben.

Die Seite wird aus `seite/vorlage.html` und dem Zeichen-Code der Mod gebaut:
`node scripts/build-office-page.mjs`.

## Einrichten: die Büro-Mod in jeder Cloud-Session

Ohne die Mod bleibt die Büro-Seite stehen: Nur Cloud-Sessions mit der Mod halten
sie aktuell und stellen deine Post zu. Mit der Mod kommen auch die Werkzeuge
`kollegen` und `nachricht`, die News aus dem eigenen Repo und das
Nachrichtenlimit.

**Einmal einrichten:**

1. Öffne irgendeine Cloud-Session und klicke in der Titelleiste auf das Umgebungsmenü, dann auf **Bearbeiten**.
2. Kopiere den kompletten Inhalt von [`buero-cloud-setup.sh`](../../../buero-cloud-setup.sh) in das Feld **Setup-Skript**. Steht dort schon etwas, häng ihn unten an. Dann speichern.
3. Starte eine **neue** Session. Ab jetzt hat jede neue Cloud-Session dieser Umgebung die Mod. Bereits laufende Sessions bekommen sie erst, wenn ihr Container neu aufgebaut wird.

Das Setup-Skript schreibt die Mod nach `~/.claude/skills/buero`. Von dort lädt
Claude Code sie in jeder Session, egal auf welchem Repo.

**Benutzen:** Mehr ist nicht nötig. Jede neue Cloud-Session hält ab jetzt die
Büro-Seite mit aktuell (siehe oben). Tippst du in einer Session `/buero`, zeigt
die Desktop-App das Büro auch als Fenster in der Session, sobald sie Mod-Fenster
in Cloud-Sessions anzeigt. Es aktualisiert sich alle 10 Sekunden.

- Wartet eine Session auf dich, steht sie im Chefbüro. Oben im Fenster steht, was sie braucht.
- Ein Klick auf einen Mitarbeiter zeigt Auftrag, Repo, Branch, letzte Zusammenfassung, Kontext und Kosten. Dort findest du außerdem den Link **Session öffnen** und ein Feld für eine Nachricht. Die iPhone-App zeigt noch keine Eingabefelder, der Link funktioniert dort aber.
- Eine Nachricht aus dem Büro kommt bei der Session als **Nachricht einer anderen Session** an, nicht als deine eigene Eingabe. Für einfache Antworten („Ja, mach Variante B“) reicht das. Freigaben, Moduswechsel oder Heikles erledigst du in der Session selbst.

Die Desktop-App zeigt Mod-Fenster in Cloud-Sessions derzeit nicht an
(„no surface is attached“). `/buero` als Fenster bringt dort also noch nichts;
die Büro-Seite zeigt alles.

**Nach Änderungen an der Mod:** Führe `scripts/make-cloud-setup.sh` aus und
ersetze den Büro-Teil im Setup-Skript durch das neue `buero-cloud-setup.sh`.
Erst neue Sessions bekommen die neue Mod.

## Wann eine Cloud-Session das Büro verlässt

Ist ihre Arbeit auf main gemergt, ist eine Session endgültig fertig und
verschwindet aus dem Büro. Die Cloud speichert keinen Merge-Status, deshalb
liest das Büro die kurze Zusammenfassung, die die Cloud nach jeder Runde einer
Session schreibt („PR #2 merged to main“, „PR auf main gemergt“):

- **Auf main gemergt:** nicht mehr im Büro.
- **PR offen:** sitzt mit Kaffee am Tisch, der Bildschirm zeigt „PR #8 mergen“. Bleibt, bis der PR gemergt ist, egal wie alt.
- **Fertig ohne PR** (z. B. eine beantwortete Frage): bleibt, bis du die Session einmal geöffnet hast, höchstens einen Tag.
- **Arbeitet, hängt oder wartet auf dich:** immer im Büro, auch wenn eine frühere Runde schon gemergt hat.

Mergst du einen PR selbst auf GitHub, merkt das die Session mit der Büro-Mod
innerhalb einer Minute, solange sie noch läuft. Ist sie schon eingeschlafen,
bleibt sie als „PR bereit“ sitzen, bis du ihr kurz Bescheid gibst oder sie
archivierst.

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
woran arbeitet, in der Cloud auch die letzten Einträge vom Schwarzen Brett, das
eigene Repo zuerst. `nachricht` schickt einem Kollegen eine kurze Nachricht.

**Von selbst** erfährt eine Cloud-Session, was im **selben Repo** passiert:
Neben jedem neuen Prompt bekommt sie einen kurzen Block „[Büro] Neues aus dem
Repo …“, wenn sich seit ihrer letzten Runde etwas getan hat. Darin steht zum
Beispiel, dass ein Kollege gepusht oder einen PR gemergt hat (main hat sich
bewegt) oder dass jemand auf dich wartet, und wer gerade im selben Repo an
welchem Branch arbeitet. Andere Repos erscheinen dort nicht, die stehen nur in
`kollegen`. Der Block ist als Information markiert, nicht als Anweisung.

**Nachrichten an arbeitende Kollegen:** Die Cloud stellt eine Nachricht an eine
Session, die gerade arbeitet, erst zu, wenn deren Auftrag fertig ist. Das kann
eine halbe Stunde dauern. Deshalb legt `nachricht` in der Cloud zusätzlich einen
Brief in den Speicher der Seite. Die Mod des Empfängers holt ihn innerhalb von
15 Sekunden ab und reicht ihn mit dem Ergebnis des nächsten Arbeitsschritts
durch („[Büro] Während deines Auftrags angekommen …“). So erfährt eine Session
rechtzeitig, dass ein Kollege eine Aufgabe übernommen hat. Bringt die Cloud
denselben Brief nach dem Auftrag noch einmal, fängt die Mod ihn ab. Unter
„Deine Nachrichten der letzten Stunde“ zeigt `kollegen` dem Absender, ob seine
Nachricht schon gelesen ist.

Nachrichten untereinander sollen die Sessions nur schicken, wenn es echte Arbeit
spart, höchstens **5 pro Stunde**. Das Limit gilt auch für das eingebaute
`send_message` der Cloud und für SendMessage an andere Sessions. Nachrichten
innerhalb des eigenen Teams einer Session zählen nicht, deine Post aus dem Büro
auch nicht.

## Was im Speicher der Büro-Seite liegt

| Sammlung | Inhalt | Wer schreibt | Wie lange |
| --- | --- | --- | --- |
| `buero/liste` | die Session-Liste, wie die Cloud sie meldet | der Bote | immer der neueste Stand |
| `leitung/bote` | wer gerade Bote ist, bis wann, was das Logbuch zuletzt wusste | der Bote | laufend erneuert |
| `sessions/<id>` | der eigene PR einer Session, ihre letzten Nachrichten an Kollegen | jede Büro-Session | 7 Tage |
| `logbuch/<tag>-<id>` | die Einträge fürs Schwarze Brett, ein Dokument pro Schreiber und Tag | Bote und Sessions | 7 Tage |
| `post/<id>` | deine Nachrichten aus dem Büro mit Zustellstatus | du, beim Zustellen der Empfänger oder der Bote | 7 Tage |
| `kollegenpost/<id>` | Nachrichten der Sessions untereinander, ob sie gelesen sind | Absender und Empfänger | 7 Tage |
| `fragen/<id>` | der volle Wortlaut der Frage einer wartenden Session | der Bote | solange sie wartet |

Ältere Dokumente räumt der Bote alle 10 Minuten weg. Die Mod schreibt nur in
diese eine Seite. Damit dabei in deinen Sessions keine Erlaubnis-Abfragen
aufpoppen, gibt sie ihre eigenen Schreibzugriffe auf genau diese Seite selbst
frei. Alles andere läuft weiter über die normalen Freigaben.

## Einstellungen

Standardmäßig gelten **5 Nachrichten pro Stunde** und **„hängt“ nach 5 Minuten**.
Auf dem PC kannst du beides unter `/config` ändern.

## Was du wissen solltest

- In der Cloud siehst du keine Agents fremder Sessions, nur die der Session, in der das Büro offen ist.
- Auf dem PC schreibt jede Session ihren Status nach `~/.claude/buero/sessions/<session-id>.json`. Darin stehen Projektname, Ordner und die ersten 300 Zeichen deines letzten Auftrags. Die Dateien bleiben auf deinem Rechner.
- Im Speicher der Büro-Seite liegen Titel, Repos und Zusammenfassungen deiner Cloud-Sessions, der volle Wortlaut wartender Fragen, deine Nachrichten aus dem Büro und die Nachrichten der Sessions untereinander. Die Seite ist privat. Teilst du sie, kann jeder, mit dem du sie teilst, das lesen.
- Die Mod nutzt die neue Mod-Schnittstelle von Claude Code. Gebaut und getestet wurde sie mit Version 2.1.302.

## Entwickeln

```
claude plugin validate .claude/skills/buero
claude plugin test .claude/skills/buero
scripts/make-cloud-setup.sh
```
