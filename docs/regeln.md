# Regeln pro Repo

Was ein Repo ohne Nachfrage erlaubt, in Worten. Der Chef vom Dienst trägt sie auf dein Kommando in `regeln/<repo>` auf der Büro-Seite ein (oder du setzt sie dort im Formular); die Mod liest sie beim Holen von Sessions und bei Merges aus Auftrags-Sessions.

| Repo | Merge | Modelle (CvD / Mitarbeiter / Prüfer) | Branch-Schema | Prüfbefehle | Nach Merge archivieren | Parallel | Freigaben |
| --- | --- | --- | --- | --- | --- | --- | --- |
| leesyashin/Else-Live- | bei grüner CI | opus-5-5 / opus-5-5 / sonnet-5-5 | claude/auftrag-{nr}-{name} | `claude plugin validate .claude/skills/buero`, `claude plugin test .claude/skills/buero` | ja | 3 | Claude darf eigene PRs mergen, sobald Validierung und Tests grün sind (Vincent, 20.10.2026) |
| neinkob12/asker | nie automatisch (Standard); pro Auftrag „bei grün“, wie bei Auftrag 44 und 46 | opus-5-5 / opus-5-5 / sonnet-5-5 | claude/auftrag-{nr}-{name} | `npm run check`, `npm run build` | ja | 4 | Kind-Sessions mit Opus starten; Auto-Merge bei grün, wenn der Diff dem Plan entspricht (Auftrag 46) |
| leesyashin/Tycoon- | nach dem Loop in docs/PLAN.md des Repos | opus-5-5 / opus-5-5 / sonnet-5-5 | session/s{nr}-{name} | `pnpm check`, `pnpm e2e`, `pnpm sim --hours 1` | ja | 1 | Session-Loop mergt eigenen PR bei grüner CI (Squash) |
| leesyashin/Webseiten-Optimierung | nie automatisch | opus-5-5 / opus-5-5 / sonnet-5-5 | claude/auftrag-{nr}-{name} | `tools/visual` (Desktop 1440×900, Handy 390×844) | nein | 1 | Feinschliff-Runden dürfen auf claude/hopeful-wright-f60t2a pushen |

Fehlt ein Repo, gelten die Standardwerte der Mod: Merge nie automatisch, Modelle opus-5-5 / opus-5-5 / sonnet-5-5, Branch-Schema `claude/auftrag-{nr}-{name}`, nach Merge archivieren, höchstens 4 parallele Auftrags-Sessions.
