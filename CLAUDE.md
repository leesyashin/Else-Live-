# Else-Live-

In diesem Repo entsteht „Cockpit“: eine Mod für Claude Code und eine Handy-Seite dazu. Der Nutzer schreibt Deutsch; antworte auf Deutsch.

**Lies vor jeder Arbeit `PLAN.md`, Abschnitt „Übergabe“.** Dort stehen der Stand, wie die Teile zusammenspielen, die nächsten Schritte und die schon gelösten Stolpersteine.

- **Wo was liegt:** Mod in `mods/cockpit`, Quelltext der Handy-Seite in `apps/cockpit-web`. Live-Seite: https://claude.ai/artifact/3mAJQLuy66EZ9EoNiqAgT8
- **Aufträge vom Handy:** Kommentare mit „Cockpit · Skill laden“ oder „Cockpit · Skill installieren“ schickt der Nutzer über die Seite. Bearbeiten wie in `PLAN.md` beschrieben: Skill starten, im Thread antworten, `cockpit/status` aktualisieren.
- **Merges:** per Squash auf `main`, nur bei grünem CI und ohne Konflikte.
- **Vor jedem Push der Mod:** `claude plugin validate mods/cockpit` und `claude plugin test mods/cockpit`.
