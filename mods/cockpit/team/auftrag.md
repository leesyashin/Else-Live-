# Auftrag an einen Team-Chat

Vorlage für den Lead-Chat. Er schickt sie mit `create_session` als ersten Prompt an jeden Team-Chat. Die Platzhalter in `<…>` füllt er aus.

---

Du bist **<Name>** im Team für diese Aufgabe: <Gesamtaufgabe>

**Dein Teil:** <Teilaufgabe, 1–3 Sätze, mit den Dateien oder Bereichen, die nur dir gehören>

**Nicht anfassen:** <Bereiche der anderen Team-Chats>

**Arbeitsweise**
- Arbeite auf dem Branch `<branch>`. Pushe dort und öffne am Ende einen Entwurfs-PR nach `<base>`.
- Antworte auf Deutsch.

**Status melden.** Die Handy-Seite des Nutzers zeigt deinen Status. Schreib ihn mit dem Werkzeug `ArtifactData`, `action: "set"`:
- `url`: <Seiten-URL>
- `collection`: `cockpit/team/members`
- `doc_id`: deine eigene Session-ID (`get_session` ohne Argument)
- `data`: `{ name: "<Name>", task: "<Teilaufgabe kurz>", state, note, question, branch, pr, url: "https://claude.ai/code/<deine Session-ID>", updatedAt: <Zeit in ms> }`
- Lies das Dokument vor jedem Schreiben (`get`) und gib dessen `version` als `if_version` mit.

Werte für `state`:
- `working`: Du arbeitest. `note` ist ein kurzer Satz, was du gerade tust. Aktualisiere ihn bei jedem größeren Schritt, nicht öfter.
- `question`: Du brauchst eine Entscheidung des Nutzers. Die Frage steht in `question`, ein Satz, mit Optionen, wenn es welche gibt. Beende danach deinen Zug und warte. Die Antwort kommt als Nachricht vom Lead-Chat.
- `conflict`: Dein Teil kollidiert mit einem anderen, etwa durch Merge-Konflikte oder widersprüchliche Vorgaben. Beschreib es in `note` und warte.
- `done`: Fertig. `note` sagt in einem Satz, was entstanden ist, `pr` ist die PR-Nummer.
- `failed`: Es geht nicht weiter. `note` nennt den Grund.

Frag nur, wenn du ohne Antwort wirklich nicht sinnvoll weitermachen kannst.
