# 🌿 Else Live

Eure gemeinsame, private Übersicht über medizinisches Cannabis in der Gruppe – live auf allen Geräten, im Glassmorphism-Design, installierbar als App (PWA) mit Push-Benachrichtigungen.

> Prototyp für den privaten Gebrauch innerhalb einer geschlossenen Gruppe. Keine kommerzielle oder öffentliche Nutzung.

## Funktionen

| Bereich | Was geht |
| --- | --- |
| **Bestand** | Sorten mit Name, Typ (Sativa/Indica/Hybrid), THC-%, CBD-%, Menge, Hersteller/Apotheke, Besitzer:in und Notiz. Füllstandsbalken, Warnung „wird knapp“, Nachfüllen, Korrigieren, Archiv, Verlauf jeder Buchung. |
| **Joint gerollt** | Sorte(n) und Menge frei wählbar (Schnellwahl 0,2 – 1 g, Stepper, beliebige Eingabe mit Komma), Mischungen aus mehreren Sorten, Tabak (oder „pur“), Aktivkohlefilter ja/nein + Marke, Notiz. Der Bestand wird automatisch abgezogen, geschätzte THC-Menge in mg wird angezeigt. |
| **Rotation** | Wer rollt, ist #1. Alle anderen sichern sich Platz #2 bis #5 (einstellbar bis 12). „Anzünden“ → „Weitergeben“: Die nächste Person bekommt „Du bist dran!“. |
| **Anfragen** | Eine Person (oder alle) bitten, mal wieder einen zu rollen – optional mit Wunschsorte und -menge. Annehmen, ablehnen, zurückziehen, oder direkt „Jetzt rollen“: Der Joint wird mit der Anfrage verknüpft und die anfragende Person bekommt automatisch Platz #2. |
| **Push** | Web-Push bei neuen Joints, Anfragen, Rotation und „Du bist dran“. Pro Person einzeln abschaltbar. Zusätzlich live In-App-Hinweise für alle, die die App gerade offen haben. |
| **Übersicht** | Gesamtbestand, Joints heute/7 Tage, offene Anfragen, aktive Joints, Verbrauchsdiagramm der letzten 7 Tage, knappe Sorten, Aktivitäts-Feed, wer gerade online ist. |
| **Gruppe** | Beitritt per Gruppencode oder Einladungslink, Profile mit Emoji, Farbe und optionaler PIN. Tabak- und Filterlisten in der App bearbeitbar. |

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) ab Version 22.

```bash
npm install
npm start
```

Dann <http://localhost:3000> öffnen. Die erste Person richtet die Gruppe ohne Code ein; danach steht der **Gruppencode** im Profil (und im Server-Log). Mit dem Code bzw. dem Einladungslink (`https://eure-adresse/#code=XXXXXX`) treten die anderen bei.

Tests: `npm test`

**Vorschau ohne Server:** `npm run build:demo` baut `dist/else-live-preview.html`, eine einzelne Datei mit derselben Oberfläche und Logik, aber mit Beispieldaten im Browser und simulierten Mitgliedern (zum Herzeigen, nicht für den echten Betrieb).

## Konfiguration

Alles optional, per Umgebungsvariable:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `3000` | Port des Servers |
| `HOST` | `0.0.0.0` | Adresse, auf der gelauscht wird |
| `DATA_DIR` | `./data` | Hier liegen `db.json` (alle Daten) und `vapid.json` (Push-Schlüssel) |
| `GROUP_CODE` | zufällig | Fester Gruppencode. Ohne diese Variable wird beim ersten Start ein Code erzeugt, der sich in der App neu würfeln lässt. |
| `VAPID_SUBJECT` | `mailto:else-live@example.com` | Kontaktadresse für die Push-Dienste – am besten eure echte E-Mail als `mailto:` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | automatisch | Eigene Push-Schlüssel (sonst werden sie in `data/vapid.json` erzeugt) |
| `TRUST_PROXY` | private Netze | Express-`trust proxy`-Einstellung, falls ein Reverse-Proxy davor sitzt |

**Backup:** Einfach den Ordner `data/` sichern. Ändert `vapid.json` nicht, sonst müssen alle Push neu aktivieren.

## Online stellen (damit alle es nutzen können)

Push-Nachrichten funktionieren nur über **HTTPS** (Ausnahme: `localhost`). Möglichkeiten:

- **Eigener Server / Raspberry Pi** mit [Caddy](https://caddyserver.com) als Reverse-Proxy – Caddy besorgt das HTTPS-Zertifikat automatisch:
  ```
  else.eure-domain.de {
    reverse_proxy localhost:3000
  }
  ```
- **Docker:**
  ```bash
  docker build -t else-live .
  docker run -d -p 3000:3000 -v else-live-data:/app/data -e GROUP_CODE=GEHEIM1 else-live
  ```
- **Hosting-Dienste** mit dauerhaftem Speicher (z. B. Fly.io, Railway, Render mit Disk): `DATA_DIR` auf das gemountete Volume zeigen lassen.

Nur im Heimnetz ohne HTTPS läuft alles außer Push; neue Joints und Anfragen erscheinen dann trotzdem live, solange die App offen ist.

## Push aufs Handy

- **Android (Chrome, Edge, Firefox):** Seite öffnen → Profil → „Push aktivieren“. Optional über das Browser-Menü „App installieren“.
- **iPhone/iPad (ab iOS 16.4):** In Safari öffnen → Teilen → **„Zum Home-Bildschirm“** → die App über das neue Symbol starten → Profil → „Push aktivieren“. (Apple erlaubt Web-Push nur für installierte Web-Apps.)
- Mit „Test“ im Profil schickt ihr euch selbst eine Probe-Nachricht.

## Tabak- und Filtermarken anpassen

In der App unter **Profil → Listen & Regeln** lassen sich Tabaksorten und Aktivkohlefilter hinzufügen und entfernen – gilt sofort für die ganze Gruppe. Die Voreinstellung für neue Gruppen steht in [`src/defaults.js`](src/defaults.js).

## Technik

- **Server:** Node.js + Express 5, Daten als JSON-Datei (atomar geschrieben), Live-Updates über Server-Sent Events, Web-Push mit VAPID (`web-push`).
- **Frontend:** Vanilla-JavaScript-Module ohne Build-Schritt, PWA mit Service Worker, Inter als lokal eingebundene Schrift (keine externen Anfragen), Icons von [Lucide](https://lucide.dev).
- **Sicherheit:** Gruppencode als Zugang, optionale PIN pro Profil (scrypt-Hash), Sitzungs-Token (nur als Hash gespeichert), Sperre bei zu vielen Fehlversuchen, strikte Content-Security-Policy.

```
server.js            Start & Konfiguration
src/app.js           HTTP-API, Live-Events, Push-Versand
src/domain.js        Geschäftslogik (Bestand, Joints, Rotation, Anfragen)
src/store.js         JSON-Datenspeicher
public/              Frontend (PWA)
  js/views/          Übersicht, Bestand, Joints, Anfragen, Profil, Login
  js/sheets/         Eingabemasken (Joint rollen, Sorte, Anfrage, …)
test/                Tests für Logik und API
```

## Ideen für später

- Eigene Marken-Listen mit Bildern, Lieblingssorten pro Person
- Statistik pro Person und Sorte, Export als CSV
- Mehrere Gruppen pro Installation, Admin-Rolle
- Erinnerung, wenn eine Sorte leer wird oder ein Rezept ausläuft
