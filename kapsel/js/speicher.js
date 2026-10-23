// Kleiner Wrapper um localStorage. Im privaten Modus oder bei gesperrten
// Website-Daten wirft der Zugriff; dann gilt der Standardwert.
export function lesen(schluessel, standard) {
  try {
    const wert = localStorage.getItem(schluessel);
    return wert == null ? standard : JSON.parse(wert);
  } catch {
    return standard;
  }
}

export function schreiben(schluessel, wert) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    // Ohne Speicher läuft die App weiter, nur ohne Erinnerung.
  }
}
