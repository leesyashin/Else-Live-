# Memory pro Repo

Hier merkt sich das Cockpit, was ein Repo braucht. Eine Datei pro Repo, benannt nach dem Repo-Namen in Kleinbuchstaben: `else-live-.md` für `leesyashin/Else-Live-`.

Die Dateien liegen in der Mod. So kommen sie mit jeder Installation in jedes Repo. Eine Änderung erreicht andere Repos nach dem nächsten Update der Mod.

## Aufbau

```
---
repo: owner/name
base: main                  # Ziel der Merges; hier zu arbeiten ist rot
branch: claude/*            # erwartete Arbeits-Branches (Muster mit *)
connectors: github          # Pflicht, fehlt einer: rot
optional: figma, canva      # schön zu haben, fehlt einer: gelb
skills: plugin-authoring    # Pflicht, fehlt einer: rot
---

## Setup
- [x] Erledigter Schritt
- [ ] Offener Schritt

## Merges
- 2026-10-28 · #46 Titel des PR
```

Alles nach dem Kopf ist frei und nur für Menschen und Claude: Das Cockpit liest allein den Kopf.

## Wer schreibt hinein

- **Du oder Claude**, wenn ein Repo neue Connectors oder Skills braucht.
- **Claude nach jedem Merge** über die Handy-Seite: eine Zeile unter `## Merges`, neueste oben.
