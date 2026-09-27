// Auswahllisten fürs Profil (gleich wie in src/defaults.js auf dem Server).

export const MEMBER_COLORS = [
  '#34d399', '#22d3ee', '#818cf8', '#c084fc',
  '#f472b6', '#fb923c', '#facc15', '#a3e635',
];

export const MEMBER_EMOJIS = [
  '🌿', '🍃', '🌱', '🌵', '🍀', '🌸', '🌻', '🍄',
  '🔥', '✨', '🌙', '☀️', '🌊', '🦊', '🐸', '🐢',
  '🦉', '🐙', '🦋', '🐝', '🎧', '🎸', '🎮', '🛸',
];

/** Schnellauswahl für Joint-Mengen in Gramm (frei eingeben geht immer). */
export const JOINT_QUICK_GRAMS = [0.2, 0.3, 0.5, 0.75, 1];

export const REQUEST_MESSAGES = [
  'Wär mal wieder Zeit 🌿',
  'Rollst du uns einen?',
  'Nach dem Essen?',
  'Heute Abend eine Runde?',
];

export const pressed = (value) => String(Boolean(value));
