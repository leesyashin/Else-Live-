// Auswahllisten fürs Profil (gleich wie in src/defaults.js auf dem Server).

export const MEMBER_COLORS = [
  '#86d45f', '#4fb38a', '#b6cf5e', '#e3a73d',
  '#e07b5a', '#e59ab5', '#6fa8c7', '#c7b89a',
];

export const MEMBER_EMOJIS = [
  '🌿', '🍃', '🌱', '🌵', '🍀', '🌸', '🌻', '🍄',
  '🔥', '✨', '🌙', '☀️', '🌊', '🦊', '🐸', '🐢',
  '🦉', '🐙', '🦋', '🐝', '🎧', '🎸', '🎮', '🛸',
];

export const STRAIN_EFFECTS = [
  'Entspannend',
  'Aktivierend',
  'Schmerzlindernd',
  'Schlaffördernd',
  'Appetitanregend',
  'Stimmungsaufhellend',
  'Fokus',
  'Kreativ',
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
