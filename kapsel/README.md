# Kapsel – Cloud-Sessions als App auf dem Home-Bildschirm

Die zweite Mod in Else Live, unabhängig vom Büro. Eine PWA für die Cloud-Sessions von claude.ai/code, angebunden an GitHub. Der Prototyp läuft mit Beispieldaten; die GitHub-Seite (PR, CI, Merge, Branch löschen) ist echt, sobald ein Token eingetragen ist.

## Was sie kann

| Teil | Wie es aussieht |
| --- | --- |
| **Insel** | Pille oben im Stil der Dynamic Island: *Arbeitet*, *Frage wartet*, *PR fertig*, mit Zählern für die anderen Zustände. Tippen klappt sie zur Liste auf, eine Zeile öffnet die Session. Bei jedem Wechsel springt sie kurz auf, zeigt die Meldung, dazu Banner in der App und Haptik. |
| **Sessions** | Gruppiert nach Status. Im Verlauf sind Tool-Aufrufe eingeklappt (mehrere hintereinander als eine Zeile „4 Tool-Aufrufe“), Fragen kommen als Karte mit Antwortknöpfen. Über der Eingabe liegt die Skill-Leiste, die häufigsten zuerst; die Zählung lernt mit. |
| **PR-Knopf** | „PR erstellen“ lässt Claude den PR anlegen. Läuft die CI, zeigt die Karte den Stand (2/5). Ist sie grün, **gedrückt halten** (0,9 s): Squash-Merge, Branch löschen, Session archivieren, jeder Schritt mit Haken. |
| **Hintergrund** | Bewegte Stile (WebGL), auf 60 fps begrenzt, Auflösung passt sich der Leistung an: **Flüssiges Metall** (Produkt-Shot einer Quecksilber-Fläche im Fotostudio: Softboxen, Lichtstreifen, Abschatter, HDR mit Filmkurve, Tiefenunschärfe; auf dem Mac in voller Retina-Auflösung; arbeitet Claude, wellt es sich stärker) und **Lava-Lampe** (weiche Blasen, die verschmelzen, in der Statusfarbe: blau arbeitet, orange Frage, grün PR fertig). Dazu **Küste**: ein Porsche 911 Carrera 4S in Navy fährt eine kurvige Küstenstraße hoch über dem Meer entlang, wie an der Amalfiküste. Die Kamera schwebt schräg hinter dem Auto und schaut die Straße entlang aufs Meer; in den Kurven schwenkt die ganze Landschaft mit. Bruchsteinmauer mit weißer Abdeckung, Zypressen und Macchia an der Kante, tief unten Felsnadeln in der Brandung und Boote mit Kielwasser, gegenüber Steilküsten mit bunten Dörfern und Serpentinen, Möwen segeln mit. Das Auto ist fotografisch (three.js, echtes 3D-Modell), die Umgebung im Stil eines Zeichentrickfilms gezeichnet: Licht in drei Stufen, satte Farben, dunkle Umrisslinien, ein gemalter Himmel mit ziehenden Haufenwolken, Büsche und Zypressen wiegen sich im Wind, und je schneller er fährt, desto deutlicher fliegen Fahrtwind-Striche vorbei. Jedes Rad dreht sich um die eigene Nabe, bei Tempo verwischen die Felgen. Hell ist Nachmittag, im Dunkeln Sonnenuntergang mit Licht am Auto. Wie schnell er fährt, hängt am Status (arbeitet Claude, geht es zügig voran); die Kamera schwebt leicht und folgt Maus bzw. Neigung. Modell und three.js (zusammen rund 2,5 MB) werden erst geladen, wenn die Küste gewählt ist, und dann dauerhaft zwischengespeichert. Und **ASCII**: ein Porsche 911 GT3 RS als 3D-Modell, gerendert wie im Fotostudio und in Terminal-Zeichen übersetzt (auf dem Mac in der freien Fläche rechts). Karosserie mit 911-Flyline, hohen Kotflügeln mit runden Scheinwerfern, breiten Hüften, Schwanenhals-Flügel, Leuchtband, Felgen mit Zentralverschluss und gelben Bremssätteln; der Lack spiegelt Softboxen und hat die Statusfarbe. Die Kamera kreist langsam um das Auto auf seiner Drehscheibe und folgt Maus bzw. Neigung. Helligkeit steckt in Zeichen und Farbe, Kanten werden zu Strichen in ihrer Richtung (- / | \). Rund um den Mauszeiger oder Finger zeigt sich ein ruhiges Zeichenfeld in der Lackfarbe. Alle reagieren auf das Neigen des iPhones bzw. die Maus; Auswahl und Aus in den Einstellungen. |
| **Oberfläche** | Ruhig und flach im Stil von Grok: weiß oder schwarz nach System-Theme, große graue Pillen, schwebende Eingabekarte (Text oben, Knopfzeile mit +, Repo-Pille und Senden), schwarze Pillen-Knöpfe, runde Knöpfe mit Schatten, Zeichen und Name oben links, blasses Zeichen in leeren Zuständen. Tab-Bar als schwebende Pille mit drei Bereichen: Sessions, PRs, Einstellungen. Auf breiten Bildschirmen (Mac, ab 900 px) steht die App als Spalte links, damit der Hintergrund rechts frei bleibt. |

## Aufs iPhone

Die App braucht HTTPS. Am einfachsten über GitHub Pages: Repo → Settings → Pages → Source „GitHub Actions“, dann den Workflow **Kapsel veröffentlichen** einmal von Hand starten. Danach die Seite in Safari öffnen → Teilen → **Zum Home-Bildschirm**. (Pages für private Repos braucht einen bezahlten GitHub-Plan.)

Lokal: `npx http-server kapsel -p 8080` und `http://localhost:8080` öffnen.

## GitHub live

Einstellungen → Token und Repos eintragen → „Verbindung prüfen“ → „PR-Tab live von GitHub“ einschalten. Der PR-Tab zeigt dann die offenen PRs mit CI-Stand (Check-Runs und Commit-Status), Konflikte, und alle `claude/…`-Branches ohne PR mit „PR erstellen“. Halten zum Mergen prüft die CI des Head-Commits frisch, mergt mit Squash genau diesen Commit (`sha`) und löscht den Branch, wenn er im selben Repo liegt. Aktualisiert wird alle 30 Sekunden; wird eine CI grün oder rot, gibt es Banner und Haptik.

Token: Fine-grained, nur die gewünschten Repos, Rechte *Contents* und *Pull requests* (lesen und schreiben), *Checks* und *Commit statuses* (lesen). Er liegt nur im Speicher des Geräts; die Content-Security-Policy erlaubt Verbindungen nur zu `api.github.com`.

## Ehrlicher Vorbehalt

- **Sessions, Fragen, Skills und Archivieren** kommen aus Beispieldaten (`js/daten.js`). Ob eine fremde App den Live-Status der Cloud-Sessions und die Skills von claude.ai/code auslesen, Antworten senden und Sessions archivieren darf, ist vor der echten Anbindung zu prüfen. Im Live-Modus steht beim Merge darum „Session-Archiv folgt“.
- **Haptik auf dem iPhone:** Safari kennt `navigator.vibrate` nicht. Die App nutzt den Schalter-Trick (`<input type="checkbox" switch>`, ab iOS 18), der zuverlässig nur bei einer Berührung auslöst; Meldungen aus dem Hintergrund bleiben dort manchmal still. Android vibriert normal.
- **Neigung:** iOS fragt beim Einschalten in den Einstellungen einmal nach der Bewegungserlaubnis.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `manifest.webmanifest`, `sw.js` | Hülle, PWA-Angaben, Offline-Cache (GitHub geht immer ins Netz) |
| `css/app.css` | iOS-Systemfarben hell/dunkel, Insel, Banner, Listen, PR-Karte, Eingabe |
| `js/app.js` | Navigation, Insel, Banner, Seiten, Halten zum Mergen, GitHub live, Neigung |
| `js/daten.js` | Beispiel-Sessions, Simulation, Skill-Zählung |
| `js/github.js` | REST-Client: PRs, CI-Auswertung, PR erstellen, Squash-Merge, Branch löschen |
| `js/hintergrund.js` | WebGL-Hintergrund (Metall, Lava, ASCII, Küste) mit 60-fps-Grenze und adaptiver Auflösung |
| `js/ascii-porsche.js` | Der ASCII-Porsche: Modell aus Abstandsfunktionen, Raymarching und Schattierung pro Zeichenzelle, dann Zeichen und Konturstriche aus einem Schrift-Atlas |
| `js/kueste.js` | Der Küsten-Hintergrund: gemalter Himmel, Meer mit Wellen im Shader, kurvige Küstenstraße mit Mauer, Zypressen und Brandung am Fuß der Klippe, Felsnadeln, Steilküsten mit Dörfern, Boote, Möwen, das Auto mit drehenden Rädern |
| `vendor/three-r186.min.js` | three.js r186 mit GLTFLoader, Sky und Meshopt-Decoder in einer Datei (`scripts/kapsel-three.mjs`) |
| `modelle/porsche-911-navy-1.glb` | Das Auto, 1,7 MB (`scripts/kapsel-modell.mjs`); Lizenz und Herkunft in `modelle/LIZENZ.md` |
| `js/haptik.js` | Vibration bzw. iOS-Schalter-Haptik |

Kein Build-Schritt, keine Abhängigkeiten zur Laufzeit (three.js liegt fertig gebündelt in `vendor/`). Updates kommen von selbst: Der Service Worker holt die App-Hülle zuerst frisch aus dem Netz (Cache nur offline), fragt bei jedem Öffnen nach einer neuen Version und lädt nach dem Wechsel einmal neu. `VERSION` in `sw.js` bei jeder Änderung trotzdem hochzählen.

## Rechte

Das Auto der Küste ist „(FREE) Porsche 911 Carrera 4S“ von Karol Miklas (Sketchfab), CC BY-SA 4.0, verändert (Lack, Logos entfernt, verkleinert); Einzelheiten in `modelle/LIZENZ.md`. Die Angabe steht auch in der App unter Einstellungen → Darstellung. Porsche-Marken deckt die Lizenz nicht ab: Wappen und Schriftzüge sind aus dem Modell entfernt, die Kapsel ist kein offizielles Projekt der Porsche AG und nicht kommerziell. three.js steht unter MIT.
