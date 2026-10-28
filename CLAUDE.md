# Else-Live-

In diesem Repo entsteht „Cockpit“: eine Mod für Claude Code und eine Handy-Seite dazu. Der Nutzer schreibt Deutsch; antworte auf Deutsch.

**Lies vor jeder Arbeit `PLAN.md`, Abschnitt „Übergabe“.** Dort stehen der Stand, wie die Teile zusammenspielen, die nächsten Schritte und die schon gelösten Stolpersteine.

- **Wo was liegt:** Mod in `mods/cockpit`, Quelltext der Handy-Seite in `apps/cockpit-web`. Live-Seite: https://claude.ai/artifact/3mAJQLuy66EZ9EoNiqAgT8
- **Nur eine Session handelt:** Jeder Auftrag vom Handy weckt alle Sessions, die die Seite beobachten. Mit geladener Mod steht nach dem Lesen des Threads eine Zuteilung im Ergebnis („gehört DIESER/NICHT dieser Session“), daran halten. Ohne Mod: Passt `Session: <ID>` nicht zu `$CLAUDE_CODE_SESSION_ID`, still bleiben. Sonst zuerst `cockpit/jobs/threads/<Thread-ID>` per `ArtifactData set` ohne `if_version` anlegen; wird das abgelehnt, still bleiben.
- **Aufträge vom Handy:** Kommentare mit „Cockpit · Skill laden“ oder „Cockpit · Skill installieren“ schickt der Nutzer über die Seite. Bearbeiten wie in `PLAN.md` beschrieben: Skill starten, im Thread antworten, `cockpit/status` aktualisieren.
- **Skills installieren heißt global:** nach `mods/cockpit/skills/<name>/` mit Link `.claude/skills/<name>`, als PR, plus Eintrag in `cockpit/skills`. Nie nur nach `~/.claude/skills` dieser Session.
- **Merge vom Handy:** Kommentare „Cockpit · Merge“, „Cockpit · PR prüfen“, „Cockpit · Setup prüfen“, „Cockpit · Team“ und „Cockpit · Antwort“ bearbeiten wie in `PLAN.md` beschrieben. `cockpit/pr` und `cockpit/status` schreibt die Mod selbst. Ohne geladene Mod nach jedem Push von Hand.
- **Memory:** Was ein Repo braucht, steht in `mods/cockpit/memory/<repo>.md`. Nach jedem Merge dort eine Zeile unter `## Merges` ergänzen.
- **Merges:** per Squash auf `main`, nur bei grünem CI und ohne Konflikte. Ein „Cockpit · Merge“ mit Zeile `Session: <ID>` führt nur die Session aus, deren `$CLAUDE_CODE_SESSION_ID` passt; alle anderen bleiben still.
- **Vor jedem Push der Mod:** `claude plugin validate mods/cockpit` und `claude plugin test mods/cockpit`.
