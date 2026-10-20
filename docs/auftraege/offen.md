# Offene Aufträge aus dem Plan

Stand 20.10.2026, nach der Umsetzung der Phasen 1 bis 6 (siehe docs/PLAN.md, Abschnitt „Stand der Umsetzung“).

| Nr | Auftrag | Warum offen |
| --- | --- | --- |
| 6.4 | Mod-Fenster und PC | Die Desktop-App zeigt Mod-Fenster in Cloud-Sessions noch nicht; der PC-Modus liest die Seite noch nicht. Beides wartet auf die Plattform. |
| 5.4 (Teil) | Kosten pro Tag | Die Cloud liefert Kosten nur je Session, nicht als Verlauf; die Seite summiert pro Repo und gesamt. Ein Tagesverlauf braucht ein Logbuch der Kosten (Desk-Snapshots), offen. |
| 3.3 (Prüfung) | Push aufs Handy | `PushNotification` ist eingebaut; ob es ohne Remote Control aufs iPhone kommt, zeigt der erste Betrieb. Fällt es aus, bleibt die Benachrichtigung des Weckers. |
| 1.6 (Grenze) | Verteilung aus Git | Das Setup-Skript läuft nur beim Bau des Umgebungs-Abbilds (erster Start nach einer Änderung, sonst etwa alle sieben Tage), und dort ohne GitHub-Zugang; die Cloud erlaubt außerdem pro Session nur das eigene Repo. Jede Version wird darum einmal von Hand eingefügt (`buero-cloud-setup.sh` von main, die Cloud baut sofort neu). Der GitHub-Abruf im Skript bleibt als Versuch drin. |
