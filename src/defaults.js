// Voreinstellungen für eine neue Gruppe. Alles hier lässt sich später in der
// App unter „Profil → Gruppe & Listen“ ändern – die Listen sind nur ein Start.

export const DEFAULT_SETTINGS = {
  groupName: 'Else Live',
  // Position 1 ist immer die Person, die gerollt hat. Plätze 2 … rotationSize
  // können sich die anderen sichern.
  rotationSize: 5,
  // Ab dieser Restmenge (Gramm) wird eine Sorte als „wird knapp“ markiert.
  lowStockGrams: 2,
  tobaccos: ['Pueblo', 'Mac Baren Choice', 'Golden Virginia', 'American Spirit'],
  filters: ['Purize Xtra Slim', 'Purize Regular', 'ActiTube Slim', 'Tubo Slim'],
};

export const STRAIN_TYPES = ['sativa', 'indica', 'hybrid'];

// Wirkungen, die sich einer Sorte zuordnen lassen (Mehrfachauswahl).
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

// Brennt ein Joint länger als das, gilt er automatisch als aufgeraucht.
export const AUTO_FINISH_HOURS = 3;

// Natürliche, erdige Töne – passend zum grünen Look.
export const MEMBER_COLORS = [
  '#86d45f', '#4fb38a', '#b6cf5e', '#e3a73d',
  '#e07b5a', '#e59ab5', '#6fa8c7', '#c7b89a',
];

export const MEMBER_EMOJIS = [
  '🌿', '🍃', '🌱', '🌵', '🍀', '🌸', '🌻', '🍄',
  '🔥', '✨', '🌙', '☀️', '🌊', '🦊', '🐸', '🐢',
  '🦉', '🐙', '🦋', '🐝', '🎧', '🎸', '🎮', '🛸',
];
