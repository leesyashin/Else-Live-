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

export const MEMBER_COLORS = [
  '#34d399', '#22d3ee', '#818cf8', '#c084fc',
  '#f472b6', '#fb923c', '#facc15', '#a3e635',
];

export const MEMBER_EMOJIS = [
  '🌿', '🍃', '🌱', '🌵', '🍀', '🌸', '🌻', '🍄',
  '🔥', '✨', '🌙', '☀️', '🌊', '🦊', '🐸', '🐢',
  '🦉', '🐙', '🦋', '🐝', '🎧', '🎸', '🎮', '🛸',
];
