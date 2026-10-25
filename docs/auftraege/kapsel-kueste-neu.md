# Auftrag: Kapsel, neuer Hintergrund für die Küste

Repo: leesyashin/Else-Live- · Branch: claude/auftrag-<nr>-kueste-neu (Nummer vergibt der CvD) · Prio: normal · Größe: L (mehrere PRs, darf lange dauern)
Eltern: keiner · Angelegt von: Session am 24.10.2026 · Zustand: in Arbeit (Phase 0 und 1 in #41, Phase 2 in #42 gemergt, Phase 3 im Review; Prüfpunkt auf dem iPhone noch offen); Stil fotografisch bestätigt am 24.10.2026

## Ziel

Der Hintergrund **Küste** der Kapsel bekommt eine neue Welt, die aussieht wie die drei Vorlagen (Gardesana am Gardasee, Ligurien, Amalfiküste bei Positano). Die Straße ist in eine helle Kalksteinwand gehauen. Rechts ragt die Wand aus dem Bild, links liegt tief unten das Meer. Dazwischen laufen Bruchsteinmauer, Zypressenreihen, eine Galerie mit Bogenfenstern und ein kurzer Tunnel durch einen Felssporn. Das Licht ist fotografisch: tiefe Nachmittagssonne, lange Schatten quer über die Fahrbahn, Dunst, der die fernen Bergketten in Blaustufen staffelt. Die Welt ist detailreich bis vor die Kamera (Schichtung und Sinterstreifen im Fels, Pflanzen in Rissen, Flickstellen im Asphalt) und wiederholt sich erst nach rund 2 km statt nach 288 m. Das Auto bleibt, wie es ist. Mac und iPhone laufen weiter mit 60 fps.

Dieser Plan betrifft nur den Hintergrund Küste. Metall, Lava, ASCII und die App selbst bleiben unberührt.

## Was heute nicht passt (Ist-Zustand, Screenshots vom 24.10.2026)

- **Das Wichtigste der Vorlagen fehlt:** die hohe, sonnige Felswand direkt an der Straße. Auf der Landseite liegt heute eine flache, verwischte Wiese im unteren Bildrand.
- **Zeichentrick statt Foto:** Licht in drei Stufen, dunkle Umrisse und einfarbige Flächen. Das fotografische Auto wirkt darin wie hineinkopiert.
- **Zypressen** sind glatte grüne Flammen (Drehkörper mit 10 Segmenten, eine Farbe).
- **Mauer:** Ziegelmuster aus abgerundeten Rechtecken, keine Tiefe, keine Fugen, keine Verwitterung.
- **Ferne:** Tafelberge mit gleich hohen, senkrechten Wänden, Dörfer als Würfelkonfetti, keine gestaffelten Bergketten im Dunst.
- **Licht:** kein Schatten außer dem des Autos; nichts wirft Schatten auf die Fahrbahn, weil die Schattenkarte nur beim Stimmungswechsel neu gerechnet wird.
- **Wiederholung:** Die nahe Welt wiederholt sich alle 288 m, bei 18 m/s also alle 16 Sekunden.
- **Himmel:** reiner Farbverlauf, Wolken aus Kugeln.

## Bildidee: was aus den Vorlagen übernommen wird

| Vorlage | Übernehmen |
| --- | --- |
| Bild 1, Gardesana | Die Straße folgt der Wand in einer weichen S-Kurve. Die Wand ist hell und rau und wird von der Sonne gestreift, oben wächst Grün. Hinter einer niedrigen Natursteinmauer mit roten Rückstrahlern steht eine Zypressenreihe. Die Schatten der Mauer und der Zypressen liegen lang quer über der Fahrbahn. Das Wasser ist türkis bis tiefblau, gegenüber stehen Berge in blauem Dunst, der Himmel ist wolkenlos und oben tiefblau. Durchgehende weiße Randlinien. |
| Bild 2, Ligurien | Steinschlagnetz über der Wand. Steinpfeiler mit Rohrgeländer, parkende Autos in einer Ausbuchtung. Macchia quillt über die Kante. Meer und Himmel verschmelzen im weißlichen Dunst, der Horizont ist kaum zu sehen. |
| Bild 3, Amalfi | Tunnel mit Rundbogen durch einen Felssporn, das Portal steht in der nackten Wand. Bruchsteinmauer mit weißem Putz, Roller am Portal. Der Blick geht von oben aufs Meer, Boote ziehen lange weiße Kielwasser. Gestaffelte Landzungen mit hellen Kalkwänden, kleine Haufenwolken über den Bergen. |

Stimmung **hell**: Spätnachmittag im Juni, gegen 17 Uhr. Stimmung **dunkel**: Sonnenuntergang, goldene Stunde.

## Entscheidungen

1. **Fotografisch statt Zeichentrick.** Die Vorlagen sind Fotos. Die Umgebung wechselt auf physikalisch basiertes Licht (`MeshStandardMaterial` mit eigenen Shader-Teilen). Toon-Stufen (`STUFEN`, `toon`), Umrisslinien (`umreissen`) und Fahrtwind-Striche fallen weg. Damit passen Auto und Welt zusammen. Soll der gemalte Stil bleiben, gelten Strecke, Komposition und Bausteine trotzdem; nur der Abschnitt „Licht und Bild“ fällt dann anders aus.
2. **Kamera hinter dem Auto über der Fahrbahn statt über dem Hang.** Heute steht die Kamera rund 10 m landeinwärts (z ≈ 11 m), genau dort, wo künftig Fels ist. Neu blickt sie schräg von hinten die Straße entlang (`BLICK` ≈ −78°, 2,6 bis 3,4 m hoch, nie weiter als 1 m über den Straßenrand hinaus). Links liegt das Meer, rechts die Wand, wie in Bild 1. Das Auto bleibt in der Mitte der freien Fläche (auf dem Mac rechts neben der App). Die Regel „Mauer läuft über dem Dach durch“ entfällt; neue Regel: Die Mauerkrone schneidet das Auto nicht auf Höhe der Fenster.
3. **Sonne, Himmel und Umgebungslicht drehen mit der Welt.** Heute steht die Sonne fest im Bild, und die Welt dreht sich in Kurven darunter weg. Lange Schatten würden dann über das Gelände wandern. Neu steht die Sonne fest zur Landschaft: Sonne und Schattenkamera bekommen die Gierdrehung der Welt-Gruppe, der Himmel ebenso, dazu `scene.environmentRotation` und `scene.backgroundRotation` (in r186 vorhanden). Folge: In Kurven wandern Licht und Spiegelungen über den Lack, und Schatten lassen sich pro Abschnitt einbacken (siehe Licht).
4. **Strecke aus Abschnitten statt einer Schleife von 288 m.** Umlauf 2048 m, gebaut aus Kacheln zu 64 m. Kacheln werden in einem Web Worker erzeugt; die CSP erlaubt `worker-src 'self'`.
5. **Texturen werden beim Start auf der GPU gerechnet** (Render-Targets, einmal pro Start, kein Download). Foto-Scans (CC0, Poly Haven oder ambientCG) sind die Option für später. Diese Cloud-Umgebung erreicht beide Seiten nicht (Proxy lehnt ab). Wer sie will, gibt die Hosts frei oder lädt die Dateien hoch; dann kommen sie nach `kapsel/texturen/` in den Dauer-Cache.
6. **Neu neben alt bauen.** Die neue Küste entsteht als eigener Stil `kueste-neu`, nur über den URL-Parameter `?stil=kueste-neu` erreichbar. Die alte Küste bleibt, bis die neue abgenommen ist. Erst dann übernimmt die neue den Namen `kueste`, und die alte Datei fliegt raus. So bleibt `main` in jeder Phase vorzeigbar.

## Kontext

Lesen:
- `kapsel/js/kueste.js`: die heutige Szene. Behalten werden Laden und Aufbereiten des Autos (`autoLaden`, `radSeite`, `radAchse`, Felgenschleier, Kontaktschatten), das Prinzip „Auto steht, Welt läuft“ (`welt`, `nah`, `biegen`), die Wellen des Meeres (`WELLEN`, `MEER_KOPF`, Ausblenden nach Bildpunkt-Fußabdruck), Dunst aus dem Himmelswürfel (`mitDunst`), Wind (`mitWind`) und die Bildausschnitt-Rechnung mit `setViewOffset` (`kameraSetzen`).
- `kapsel/js/hintergrund.js`: Schnittstelle `new Kueste(canvas, kontext)`, `groesse(b, h, skala)` und `zeichnen(s, { tempo, neigung, dunkel, frei, ruhe })`, adaptive Auflösung (Mindestskala 0,6), 60-fps-Grenze, eigene WebGL-2-Fläche `#glas3d`. Die Schnittstelle bleibt gleich.
- `kapsel/sw.js`: `HUELLE` (jede neue JS-Datei eintragen), `VERSION` hochzählen, Dauer-Cache für `vendor/` und `modelle/`.
- `scripts/kapsel-three.mjs`: Im Bündel stecken `GLTFLoader`, `Sky` und `MeshoptDecoder`. Wird ein weiterer Zusatz gebraucht, neu bündeln und `DAUER` hochzählen. Der Plan kommt ohne aus.
- `.github/workflows/kapsel.yml`: prüft nur `kapsel/js/*.js`. Neue Unterordner müssen in die Schleife (`kapsel/js/**/*.js` bzw. `find`).
- `kapsel/README.md`: Zeile „Hintergrund“ und Aufbau-Tabelle.

Nicht anfassen: das Auto-Modell und `scripts/kapsel-modell.mjs`, Lack und Glas des Autos, die anderen Stile, die App-Oberfläche.

## Umsetzung

### 1. Komposition und Kamera

- **Bildaufbau hochkant (iPhone, 390 × 844):** Oben rechts stehen Wandkrone, Pinien und Himmel. Der Horizont liegt links über dem Meer bei etwa 38 % der Bildhöhe, das Auto bei etwa 70 %. Die Straße läuft in einer Kurve rechts hinter einen Felsvorsprung, der Fluchtpunkt bleibt verdeckt und macht neugierig.
- **Bildaufbau quer (Mac, freie Fläche etwa 924 × 900):** Die Wand nimmt rechts etwa ein Drittel der Breite ein, links liegen Meer, Felsnadeln und Landzungen bis zum Horizont, wie in Bild 1.
- **Kamera:** `BLICK` ≈ −78°, Höhe 2,6 m (quer) bis 3,4 m (hochkant). Sie zielt 2 bis 4 m vor das Auto. In Kurven schwingt sie mit leichter Trägheit 2 bis 4° zur Außenseite. In Galerie und Tunnel gleitet sie auf ≈ −86° und 2,3 m, damit sie im Querschnitt bleibt. Neigung, Maus und Drohnenschwanken bleiben (das Schwanken etwas kleiner).
- **Nie im Fels:** Abstandstest gegen das Wandprofil der aktuellen Kachel. Wird es eng, rückt die Kamera hinter das Auto oder näher heran.
- **Tempo-Gefühl** statt Fahrtwind-Strichen: Leitpfosten und Rückstrahler alle 10 bis 20 m, Schatten, die über das Auto huschen, und Bewegungsunschärfe im Asphaltkorn, die mit dem Tempo zunimmt.

### 2. Strecke

- **Umlauf 2048 m**, deterministisch aus Saat und Weg `x`, nahtlos am Umlauf.
- **Kurve:** `kurve(x)` und `kurveSteigung(x)` bleiben die Schnittstelle. Umgesetzt (Phase 1) als Summe von sechs periodischen Wellen statt einer Spline-Tabelle: ebenso nahtlos, aber einfacher. Richtung bis 26°, engster Radius 115 m. Alles quer zur Straße steht entlang der Normalen der Mittellinie (`quer`), so bleibt die Straße auch in Kurven gleich breit.
- **Abschnitte** (Reihenfolge und Längen als Tabelle in `strecke.js`, Übergänge 20 bis 40 m weich):

| Nr | Abschnitt | Länge | Vorlage | Inhalt |
| --- | --- | --- | --- | --- |
| 1 | Offene Wand | 320 m | Bild 1 | Hohe Wand rechts, S-Kurve, Natursteinmauer mit Rückstrahlern, Zypressenreihe links |
| 2 | Netz und Geländer | 256 m | Bild 2 | Steinschlagnetz mit Ankern, Steinpfeiler mit Rohrgeländer, Parkbucht mit zwei Kleinwagen und einem Roller |
| 3 | Galerie | 128 m | Gardesana | Halbtunnel mit Bogenfenstern zum Meer, Lichtfächer auf der Fahrbahn, Staub im Licht |
| 4 | Nische | 320 m | Amalfi | Bildstock mit Madonna und Blumen in einer Felsnische, Zitronenstand mit gelben Kisten, Verkehrsspiegel in der Kurve |
| 5 | Tunnel | 64 m Tunnel + Portale | Bild 3 | Rundbogenportal im nackten Fels, verputzte Mauer, Roller am Portal, Lampen im Tunnel |
| 6 | Über der Bucht | 384 m | Bild 3 | Weiß verputzte Mauer, Agaven, Feigenkakteen, Bougainvillea, Blick auf das Dorf gegenüber |
| 7 | Turm | 320 m | Amalfi | Sarazenenturm auf einer Landzunge voraus, Aleppo-Kiefern hängen über den Abgrund |
| 8 | Übergang | 256 m | – | Ruhigere Wand, Macchia, zurück zu 1 |

- **Kacheln:** 32 Kacheln zu 64 m. Im Speicher liegt ein Ring aus 2 Kacheln hinter und 12 vor dem Auto, mit Detailstufen nach Entfernung: bis 128 m voll, bis 384 m mittel, darüber grob. Kacheln überlappen sich an den Nähten um eine Gitterzeile, und Schürzen schließen die Fugen zwischen den Stufen. Wird hinten eine Kachel frei, baut der Worker vorne die nächste (Positionen, Normalen, UV, Farben und eingebackene Verdeckung und Schatten als Transferables). Vor dem ersten Bild entstehen die ersten Kacheln; die Fläche bleibt bis dahin unsichtbar (Klasse `bereit`, wie heute).
- **Genauigkeit:** Die Welt rechnet relativ zur aktuellen Kachel (wie heute mit `% PERIODE`), damit große `fahrt`-Werte nicht zittern.

### 3. Felswand (Landseite)

- **Form:** ein Gitter über Weg `s` und Höhe `h` mit einer Tiefe `d(s, h)` ab Straßenrand. So sind Überhänge möglich, was ein Höhenfeld nicht kann.
  - Grundprofil je Abschnitt: senkrecht, überhängend, gestuft oder zurückweichend mit Hangkante.
  - Große Formen: Pfeiler, Vorsprünge von 2 bis 6 m, Nischen, Überhänge bis 3 m über der Fahrbahn (erst ab 6 m Höhe, über der Kamera).
  - Mittlere Formen: Schichtbänke alle 0,6 bis 1,5 m, leicht schräg; senkrechte Klüfte; abgebrochene Blöcke.
  - Kleine Formen: nur in der Normal-Map.
  - Wandfuß 2,5 bis 3 m vom Fahrbahnrand: Bankett, Rinne, heruntergefallene Steine. In Abschnitt 2 stattdessen eine Stützmauer mit Entwässerungsrohren.
  - Höhe 25 bis 120 m. Oben liegt die Abbruchkante, dahinter steigt ein Hang mit Macchia und Pinien weiter an.
- **Auflösung:** nah 0,3 m (bis 60 m voraus), mittel 1 m, fern 4 m.
- **Material:** Kalkstein von Creme (#ebe0ca) bis Ocker (#c9a77c), triplanar abgebildet mit der GPU-Felstextur und einer zweiten, feineren Detailnormale. Kachelbruch durch zufällig gedrehte und versetzte Zellen. Prozedural kommen dazu:
  - Sinterstreifen, schwarz und rostbraun, senkrecht unter Überhängen und Rinnen, entlang der Fallrichtung gezogen;
  - graue und gelbe Flechtenflecken;
  - frischer, hellerer Bruch an Kanten (Krümmung);
  - dunkle Feuchte am Fuß und in Rinnen;
  - Rauheit nach Material (Sinter etwas glatter).
- **Verdeckung:** beim Bau pro Vertex eingebacken (Horizontmethode in 8 Richtungen gegen die Kachel und ihre Nachbarn). Dadurch werden Nischen, Fugen und Wandfuß dunkler.
- **Bewuchs:** Pflanzen sitzen auf Absätzen (Normale nach oben) und in Klüften: Kapernsträucher, Efeuvorhänge über Kanten, Grasbüschel, kleine Steineichen. Instanziert, Verteilung nach Regeln (siehe 6).
- **Bauwerke:** Steinschlagnetz in Abschnitt 2 (Drahtgeflecht als Alpha-Textur mit Normale, hängt über Vorsprüngen durch, mit Randseilen und Felsankern), Leitpfosten, Felsanker einzeln.

### 4. Fahrbahn

- **Maße:** zwei Spuren, 7 m breit, plus Bankette. `STRASSE` bleibt 4,5 m halbe Breite bis Rand.
- **Asphalt (GPU-Textur):** feines Korn mit Splitt, Rauheit-Map, Fahrspuren etwas heller und glatter, Ölschleier in Spurmitte. Ausbesserungen: dunklere, rechteckige Flicken und glänzende Bitumen-Rissbahnen, die im Gegenlicht aufblitzen. Gullys am Wandfuß.
- **Markierung:** durchgehende weiße Randlinien (Bild 1), gestrichelte Mittellinie, stellenweise verblasst und abgeplatzt. Leicht erhaben, damit sie im Streiflicht einen Hauch Schatten wirft.
- **Bewegung:** Das Korn verwischt in Fahrtrichtung, stärker mit Tempo (wie heute, aber im Shader statt fest in der Textur).

### 5. Brüstung (Meerseite)

Drei Bauarten, je nach Abschnitt:
1. **Natursteinmauer** (Bild 1, Abschnitte 1, 7, 8): 0,8 m hoch, unregelmäßige Kalksteine mit tiefen Mörtelfugen. Nah als echtes Relief (Steine als verbeulte, instanzierte Quader mit Fugen dazwischen), fern als Textur mit Normale. Runde, raue Abdeckung, Flechten, Moos in den Fugen, Abflussöffnungen. Rot-weiße Rückstrahler alle 10 m.
2. **Amalfi-Mauer** (Bild 3, Abschnitte 4, 5, 6): unten Bruchstein, oben weiß verputzt, verwittert, mit Abplatzungen, die den Stein zeigen. Abdeckung als gerundeter Wulst. Bougainvillea hängt darüber.
3. **Pfeiler mit Geländer** (Bild 2, Abschnitt 2): Steinpfeiler alle 2,5 m, dazwischen zwei verzinkte Rohre. Der Blick aufs Meer bleibt frei.

### 6. Pflanzen

- **Zypressen**, die Hauptdarsteller aus Bild 1: 8 bis 16 m hoch, als dichte Spindel aus 40 bis 80 Laubbüscheln um einen Stamm.
  - Farbe: tiefes Schwarzgrün, auf der Lichtseite warmes Olivgrün. Im Gegenlicht leuchten die Ränder (Durchscheinen als Rimlicht im Shader), in der Tiefe sitzt Verdeckung pro Büschel.
  - Wind: Jedes Büschel wiegt mit eigener Phase, der Wipfel stärker.
  - Detailstufen: nah Karten mit Alpha und Normale, mittel ein verbeultes Büschel-Mesh, fern ein Impostor (8 Blickwinkel, beim Start in einen Atlas gerendert).
- **Pinien und Aleppo-Kiefern:** schräg über den Abgrund gewachsen, mit Schirmkrone und rotbraunem, rissigem Stamm.
- **Macchia:** Steineiche, Mastix, Myrte, Ginster mit gelben Blüten. Dazu Agaven (blaugraue Rosetten, einzelne mit hohem Blütenstand), Feigenkakteen mit Früchten, Bougainvillea in Magenta, Oleander in Rosa, Efeu.
- **Boden:** Grasbüschel als Karten, Trockengras, Laub und kleine Steine an Bankett und Mauerfuß.
- **Verteilung nach Regeln statt gleichmäßig:** Gruppen und Lücken, abhängig von Hangneigung, Abstand zur Kante, Licht (Agaven und Kakteen auf sonnigen, trockenen Stellen) und Abschnitt. Nie so nah an der Fahrbahn, dass Pflanzen das Auto verdecken.

### 7. Meer

- **Wellen:** Das heutige Wellensystem bleibt (gerichtete Wellen, Kräuseln, Windflecken, Ausblenden nach Fußabdruck). Die Schattierung wird physikalisch:
  - Fresnel nach Schlick mit Spiegelung des Himmels;
  - Farbe nach Wassertiefe: Türkis über hellem Grund am Klippenfuß (Bild 1), Kobalt und Ultramarin draußen;
  - unter Wasser liegende Felsen nahe am Ufer schimmern hell durch.
- **Sonnenpfad:** echte Spiegelung der Sonne (GGX, Rauheit aus den Windflecken). Im Gegenlicht entsteht ein breiter Glitzerpfad, dessen Funken über Bloom strahlen.
- **Brandung:** Schaumbänder am Klippenfuß und an den Felsnadeln (heutiger Schaum-Shader, weicher und mit Gischt-Streifen).
- **Felsnadeln:** wie die Faraglioni, heller Kalk mit Schichtung und Bewuchs oben, dazu ein Felsbogen.
- **Boote:** Motorboote, Holzboote (Gozzi), zwei Segelboote, eine Fähre. Das Kielwasser ist lang (Bild 3): ein Kelvin-Keil mit verwirbelter Mittelspur, der im Shader ausfranst und verblasst. Boote fahren auch Kurven.

### 8. Ferne

- **Gestaffelte Kulissen in vier Ebenen** (etwa 2, 5, 12 und 25 km), jede mit eigener Silhouette aus gratigem Rauschen, mit Steilabfällen ins Meer. Luftperspektive: Mit der Entfernung nehmen Kontrast und Sättigung ab, die Farbe geht ins Himmelblau über (Bild 1 und 3). Die heutigen Tafelberge (`landmasse`) werden ersetzt.
- **Vordere Landzunge:**
  - helle Kalkwände, grüne Hänge, Zitronenterrassen;
  - ein Dorf wie Positano: Pastellhäuser mit Fensterpunkten, flachen Dächern und Terrassen, übereinander am Hang, dazu eine Kirchenkuppel mit grün-gelber Majolika;
  - Serpentinenstraße mit weißer Mauer (heutiger Shader-Trick, verfeinert).
- **Sarazenenturm** auf einer Landzunge, dazu ein zweiter auf der Gegenseite.
- **Abends:** Fensterlichter und Laternenketten gehen nach und nach an.

### 9. Himmel und Wolken

- **Grundlage:** physikalischer Himmel (`Sky` liegt im Bündel), nachbearbeitet: Zenit tiefblau, Horizont milchig hell, ein Dunstband über dem Meer, in dem Meer und Himmel verschmelzen (Bild 2).
- **Wolken:** wenige Haufenwolken über den Bergen (Bild 3), abends dünne Zirren. Gerendert als Wolkenschicht im Himmels-Shader mit Rauschen, von der Sonne beleuchtet, mit Silberrand im Gegenlicht. Sie ziehen langsam.
- **Abend:** Die Sonne steht knapp über dem Meer, der Himmel geht von Gold über Rosa nach Violett, Wolken werden von unten angestrahlt. Die Sonnenscheibe hat einen Hof und eine dezente Blendung.
- **Würfel:** Der Himmel wird wie heute in einen Würfel gerendert, für Dunst und Umgebungslicht, nur beim Wechsel der Stimmung.

### 10. Leben und Kleinigkeiten

- Möwen mit richtiger Silhouette (abgewinkelte Flügel, Schwanz), die meist gleiten. Abends Mauersegler.
- Parkende Kleinwagen und Roller (einfache Modelle aus Grundkörpern, ohne Marken).
- Bildstock, Zitronenstand, Verkehrsschilder (Kurve, Steinschlag), ein Verkehrsspiegel, Laternen in der Galerie.
- Staubteilchen in den Lichtfächern der Galerie.
- Keine Schrift, keine Logos, keine echten Ortsnamen auf Schildern.

### 11. Licht und Bild

**Stimmungen** (in `STIMMUNGEN`, Richtung relativ zur mittleren Fahrtrichtung der Strecke):

| | hell | dunkel |
| --- | --- | --- |
| Sonne | 26° hoch, 40° links voraus über dem Meer | 3° hoch, 10° links voraus |
| Sonnenlicht | warmweiß #fff0dc | orange #ff9a55 |
| Himmel | Zenit #1f5fbf, Horizont #cfe3ef | Zenit #2a3a7a, Mitte #c0708a, Horizont #ffb070 |
| Meer | nah #19a7b8, fern #0f3f8c | #2a3470 mit goldenem Pfad |
| Sicht im Dunst | etwa 25 km | etwa 15 km, wärmer |
| Lichter | aus | Scheinwerfer, Dorf, Galerie |

Mit der Sonne vorn links fallen die Schatten von Mauer, Zypressen und Galeriebögen schräg auf die Kamera zu quer über die Fahrbahn, wie in Bild 1, und die Wand rechts steht voll im Licht. Das Auto steht im Gegenlicht: Seine Kanten leuchten, die Flanke zur Kamera bekommt Licht von der sonnigen Wand (Umgebung) und vom Aufheller. Wirkt das zu dunkel, die Sonne bis 70° zur Seite drehen.

**Schatten in drei Teilen** (passen zusammen, weil alle dieselbe Sonne nehmen):
1. **Schattenkarte jedes Bild:** enger Ausschnitt von etwa 70 m um das Auto, nach vorn versetzt, 2048 px auf dem Mac und 1024 px auf dem iPhone, weicher Rand. Darin: Auto, Mauer, Zypressen, Überhänge, Galerie und Tunnel. So huschen Schatten über das Auto, und im Tunnel liegt es im Dunkeln.
2. **Eingebacken für alles Fernere:** Weil die Sonne fest zur Landschaft steht (Entscheidung 3), rechnet der Worker pro Kachel einmal eine Schattenmaske für Fahrbahn und Mauer (10 cm pro Bildpunkt, R8) und Schatten pro Vertex für Wand und Pflanzen, per Strahltest gegen Kachel und Nachbarn. Zwischen 50 und 70 m wird weich auf die Schattenkarte übergeblendet. Beim Wechsel der Stimmung wird neu gebacken und überblendet.
3. **Verdeckung:** pro Vertex eingebacken (Wand, Mauer, Pflanzen), dazu Kontaktdunkel an Fugen, unter Pflanzen und am Mauerfuß.

**Umgebungslicht:** PMREM aus Himmel und einer Stellvertreter-Szene (helle Wand rechts, Meer links, Straße), in drei Fassungen: offen, Galerie, Tunnel. Beim Abschnittswechsel wird über die Intensität überblendet. Der Lack spiegelt so die sonnige Wand, und im Tunnel verschwindet das Himmelslicht.

**Bild-Durchgang (eigener Shader, kein Zusatz im Bündel):**
- Die Szene rendert linear in ein HalfFloat-Ziel mit 4× MSAA.
- Bloom in 1/2 bis 1/16 Auflösung für Glitzer, Sonne und Chrom.
- Danach in einem Durchgang: Tonemapping (Neutral; AgX nahm dem Himmel zu viel Farbe), Farbgebung wie ein Foto (Lichter leicht warm, Schatten leicht kühl, sanfte S-Kurve), leichte Vignette, feines Korn und Ausgabe in sRGB.
- **Belichtung:** folgt dem Abschnitt (aus der Streckentabelle bekannt). Im Tunnel wird um +1,3 Blenden aufgeblendet, bei der Ausfahrt ist es kurz überstrahlt und regelt dann zurück, wie eine Kamera. Im Ruhe-Modus ohne Sprünge.

**Dunst:** Luftperspektive nach Weite und Höhe (dichter knapp über dem Meer), Farbe aus dem Himmelswürfel (heutiges `mitDunst`), dazu ein Mie-Schein in Richtung Sonne.

### 12. Texturen auf der GPU

Beim Start wird jede Textur einmal in Render-Targets gerechnet (Shader mit Rauschen, Voronoi und Schichtung) und mit Mipmaps versehen. Kanäle: Farbe (sRGB) und gepackt R = Verdeckung, G = Rauheit, B = Höhe, dazu eine Normal-Map aus der Höhe. Alle Texturen sind kachelbar.

| Textur | Größe Mac / iPhone | Inhalt |
| --- | --- | --- |
| Kalkfels | 2048 / 1024 | Schichtbänke, Klüfte, Lösungsnäpfchen, Körnung |
| Felsdetail | 1024 / 512 | feine Normale für die Nähe |
| Asphalt | 2048 / 1024 (18 m × 9 m) | Korn, Flicken, Rissbahnen, Markierung |
| Bruchstein | 1024 / 512 | Steine mit Fugen, Flechten |
| Putz | 512 / 512 | Verwitterung, Abplatzungen |
| Laubkarten | 1024 / 512 Atlas | Zypressen-, Kiefern-, Macchia- und Graskarten mit Alpha |
| Drahtnetz | 512 / 256 | Geflecht mit Alpha |

Budget für Grafikspeicher: unter 150 MB auf dem iPhone, sonst droht iOS den Kontext zu verlieren.

### 13. Technik und Dateien

- Die neue Szene steht in `kapsel/js/kueste/szene.js` (Klasse `Kueste`, Kamera, Schleife). Das Auto liegt seit Phase 0 in `kueste/auto.js`, die kleinen Helfer in `kueste/helfer.js`; alte und neue Küste nutzen beide. In Phase 9 fällt `kueste.js` weg, und der Stil `kueste` lädt `kueste/szene.js`.
- Weitere Dateien unter `kapsel/js/kueste/`:

| Datei | Inhalt |
| --- | --- |
| `strecke.js` | Verlauf, Abschnittstabelle, Form von Wand und Klippe, Umrechnung aus dem Bild des Autos auf die Strecke |
| `kamera.js` | Bildaufbau quer und hochkant (Werte, die auch das Prüfskript nutzt) |
| `kacheln.js` | Ring, Detailstufen, Auf- und Abbau, Worker-Anbindung |
| `bau-worker.js` | Geometrie, Verdeckung und eingebackene Schatten je Kachel |
| `wand.js`, `fahrbahn.js`, `bruestung.js`, `pflanzen.js`, `bauwerke.js` | Bausteine |
| `meer.js`, `ferne.js`, `himmel.js` | Hintergrund-Ebenen |
| `material.js` | Triplanar, Kachelbruch, Dunst, Wind, Schatten-Mix, Rimlicht |
| `texturen.js` | GPU-Texturen |
| `licht.js` | Sonne, Schatten, Umgebung, Stimmungen |
| `bild.js` | Bild-Durchgang, Belichtung |

- Pflege: Jede neue Datei kommt in `HUELLE` in `sw.js`, `VERSION` zählt bei jedem PR hoch, und die Schleife in `.github/workflows/kapsel.yml` prüft künftig auch die Unterordner.
- **Programme teilen:** `customProgramCacheKey` je Materialart, wie heute. Instanzen pro Kachel als Bereiche großer `InstancedMesh`, damit es wenige Draw Calls bleiben. Frustum-Culling pro Kachel.
- **Aufräumen:** Freigegebene Kacheln geben Geometrie und Masken frei (`dispose`). Kontextverlust baut alles neu, wie heute.

**Leistungsbudget:**

| | Mac (Retina 2×) | iPhone 13 und neuer |
| --- | --- | --- |
| Bildrate | 60 fps, Skala bleibt 2 | 60 fps, Skala ≥ 1,0 nach 60 s |
| Dreiecke im Bild | ≤ 600 000 | ≤ 300 000 |
| Draw Calls | ≤ 150 | ≤ 120 |
| Schattenkarte | 2048, jedes Bild | 1024, jedes Bild (bei Last jedes zweite) |
| Start bis erstes Bild | ≤ 1 s | ≤ 1,5 s (nach dem Laden von three.js und Modell) |
| Zusätzlicher Download | 0 (Texturen auf der GPU) | 0 |

**Stufen:** „hoch“ und „mittel“ nach Gerät (`pointer: fine`). Bleibt die Last hoch, sinkt die Stufe weiter: Detailstufen näher, weniger Laubkarten, Schatten jedes zweite Bild. Die adaptive Auflösung aus `hintergrund.js` bleibt zusätzlich.

**Standbild-Modus für Screenshots:** Mit `?stil=kueste-neu&bild=<weg>,<zeit>,<hell|dunkel>` stehen Fahrt und Zeit fest, und die Einfahrt entfällt. Dazu kommt `scripts/kapsel-kueste-bilder.mjs` (Playwright, liegt in der Cloud bereit): 8 Streckenpunkte (je Abschnitt einer) × hell/dunkel × Mac 1440 × 900 und iPhone 390 × 844. Ohne festen Zeitpunkt sind Screenshots in der Cloud unbrauchbar; dort rendert SwiftShader nur wenige Bilder pro Sekunde, und das Auto steckt dann noch in der Einfahrt.

### 14. Phasen

Jede Phase ist ein eigener PR (Draft gegen `main`) mit Screenshots aus dem Standbild-Modus, vorher und nachher. `main` bleibt dabei immer lauffähig, weil die neue Küste bis Phase 9 nur über den URL-Parameter läuft.

| Phase | Inhalt | Abnahme im PR |
| --- | --- | --- |
| 0 | Gerüst: Stil `kueste-neu`, Ordner, Auto als eigenes Modul, Standbild-Modus, Bilder-Skript, CI-Schleife | alte und neue Küste per Parameter umschaltbar, Bilder entstehen |
| 1 | Strecke, Kacheln, Worker, Kamera; Wand, Straße und Mauer als graue Rohformen; `scripts/kapsel-kueste-pruefen.mjs` in der CI | Bildaufbau stimmt hochkant und quer; keine Fugen, kein Ruckeln beim Kachelwechsel |
| 2 | Licht: Wechsel auf PBR, Himmel, Sonne mit der Welt gedreht, Schattenkarte jedes Bild, eingebackene Schatten, Bild-Durchgang, Dunst. Umgesetzt: Sonne und Himmelslicht je Ecke im Worker eingebacken (Strahl zur Sonne gegen Wand und Brüstung, Verdeckung durch Überhänge, Pfeiler, Wandfuß), ab 30 bis 45 m vom Auto übergeblendet; Himmel mit Rayleigh 1,3 (mehr Streuung machte den Horizont weißer) | Schon die graue Rohform sieht nach Foto aus |
| 3 | Felswand vollständig: Form, GPU-Textur, Sinter, Verdeckung, Bewuchs, Netz. Umgesetzt: Kalkstein-Textur auf der GPU (`texturen.js`), triplanar in zwei Maßstäben plus Detailnormale, Sinter und frischer Bruch je Ecke aus dem Worker, Flechten, Feuchte, Boden auf Krone und Hang, kantige Brocken in der Wandform (56 statt 40 Zeilen), Büsche als `InstancedMesh` je Kachel, Netz mit Maschen im Shader. Efeu und Kapernsträucher kommen mit Phase 5 | Nahaufnahme der Wand hält dem Vergleich mit Bild 1 stand |
| 4 | Fahrbahn und alle drei Brüstungen | lange Schatten quer über die Fahrbahn wie Bild 1 |
| 5 | Pflanzen: Zypressen mit Detailstufen, Pinien, Macchia, Agaven, Kakteen | Zypressenreihe wie Bild 1, kein Aufpoppen näher als 150 m |
| 6 | Meer, Ferne, Wolken, Boote, Felsnadeln | Staffelung der Berge wie Bild 1 und 3, Glitzerpfad |
| 7 | Sonderabschnitte: Galerie, Tunnel mit Belichtung, Parkbucht, Nische, Turm | Tunnel-Ein- und Ausfahrt wirken wie gefilmt |
| 8 | Abend vollständig: Sonnenuntergang, Lichter im Dorf, Laternen, Scheinwerfer | hell und dunkel gleich gut |
| 9 | Leistung und Abschluss: auf Geräten messen, Budget einhalten; `kueste-neu` wird `kueste`, alte Dateien raus; README, `sw.js`, Einstellungen-Fußnote | alle Kriterien unten erfüllt |

**Prüfpunkt nach Phase 2:** Screenshots auf deinem iPhone (Safari, `?stil=kueste-neu`), hell und dunkel. Wirkt die graue Rohform mit Licht, Schatten und Dunst schon nach Foto, geht es fotografisch weiter. Wenn nicht, wechselt die Umgebung auf den gemalten Stil; Strecke, Kamera, Bildaufbau, Abschnitte und Schatten bleiben, nur die Materialien ändern sich.

**Offen aus Phase 1 und 2:** 226 Draw Calls pro Bild (Budget 150): Teile einer Kachel mit gleichem Material zusammenlegen (Phase 9). Das Meer ist von der Straße aus blass, weil es im flachen Blick fast nur den hellen Horizont spiegelt; das löst Phase 6 (Wasserfarbe, Wellen, Sonnenpfad). Eine Kachel der feinsten Stufe braucht im Worker gut 100 ms (Desktop) für Form und eingebackenes Licht. Bei sehr flachem Blick verschmiert die Felstextur entlang der Wand (in SwiftShader stärker als auf echten Grafikkarten mit anisotroper Filterung); im Feinschliff prüfen. Bewuchs: eine Draw Call mehr je Kachel.

Phasen 3 bis 6 hängen nur von 1 und 2 ab und können parallel laufen (bis zu 3 Sessions nach den Regeln des Repos), wenn jede in ihren eigenen Dateien bleibt.

## Abnahme

- [ ] Bildaufbau wie in den Vorlagen: Wand rechts, Meer links, Straße bis zum Fluchtpunkt, Auto in der freien Fläche. Hochkant und quer, hell und dunkel (mindestens 8 Screenshots im letzten PR, neben den Vorlagen).
- [ ] Lange Schatten von Mauer und Zypressen liegen quer über der Fahrbahn; Überhänge, Galerie und Tunnel beschatten das Auto; Schatten huschen über den Lack.
- [ ] In Kurven bleibt die Sonne fest zur Landschaft; Licht und Spiegelungen wandern über das Auto.
- [ ] Die Strecke wiederholt sich frühestens nach 2 km. Kein Sprung am Umlauf, keine Fugen zwischen Kacheln, kein Aufpoppen näher als 150 m.
- [ ] In Bewegung flimmert nichts (Meer, Asphalt, Netz, Geländer, Markierung).
- [ ] Die Kamera steckt an keiner Stelle der Strecke im Fels (automatischer Test über den ganzen Umlauf in 1-m-Schritten).
- [ ] Leistung: Mac (Apple Silicon, 1440 × 900, Retina) hält 60 fps bei Skala 2; iPhone 13 hält 60 fps bei Skala ≥ 1,0 nach 60 s Fahrt; erstes Bild nach höchstens 1,5 s; kein Kontextverlust nach 10 min.
- [ ] Ruhe-Modus, Neigung, Maus, hell/dunkel-Wechsel und Kontextverlust funktionieren wie bisher.
- [ ] Offline: Nach einmaligem Laden läuft die Küste ohne Netz.
- [ ] CI grün (`node --check` für alle Dateien, auch `kapsel/js/kueste/`, Manifest).
- [ ] README aktualisiert (Zeile „Hintergrund“, Aufbau-Tabelle), `VERSION` in `sw.js` hochgezählt, Lizenzangaben stimmen (Auto unverändert CC BY-SA, keine fremden Texturen ohne Eintrag).

## Risiken

- **iPhone-Leistung:** Schattenkarte in jedem Bild, Bild-Durchgang und mehr Geometrie. Gegenmittel: Stufen, Impostor, Schatten jedes zweite Bild, Bloom in kleiner Auflösung. In Phase 2 früh auf einem echten Gerät messen, nicht erst in Phase 9.
- **Speicher auf iOS:** Texturen und Kacheln klein halten und sauber freigeben, sonst verliert Safari den WebGL-Kontext.
- **Bauzeit:** Geometrie und Backen laufen im Worker. Auf dem Hauptthread bleiben pro Bild höchstens 2 ms für neue Kacheln.
- **Unheimlich echt:** Lieber Licht und Komposition perfekt als jedes Blatt. Details gehören dorthin, wo der Blick liegt: nahe Wand, Mauer, Fahrbahn vor dem Auto.
- **Texturen:** Wirken die GPU-Texturen in Phase 3 zu künstlich, Foto-Scans (CC0) nachrüsten. Das braucht freigegebene Hosts oder hochgeladene Dateien, etwa 3 MB im Dauer-Cache und einen Eintrag in `kapsel/texturen/LIZENZ.md`.
- **Prüfen in der Cloud:** SwiftShader ist langsam. Screenshots nur im Standbild-Modus; Bildraten nur auf echten Geräten messen.

## Regeln

Draft-PR gegen main, je Phase einer. Branch nach Schema `claude/auftrag-<nr>-kueste-neu` (Phasen als `…-p<n>`). Vor jedem Push `node --check` für alle Kapsel-Dateien und das Bilder-Skript laufen lassen; Screenshots vorher und nachher in den PR. Keine Modellnamen in Commits oder PRs. PR abonnieren und auf grün bringen. Merge bei grüner CI (Regel des Repos). Stand melden. Bei Blockade abgeben mit Stand, Branch und offenen Punkten.

## Übergabe (beim Abgeben ausfüllen)

Stand · Branch und Commit · Offene Punkte · Fallen · Nächster Schritt
