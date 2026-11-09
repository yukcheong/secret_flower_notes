// Reference data transcribed from The Secret Flower rulebook (p3 setup table)
// and the player note-sheet templates (numbered grid, groupings, outlines).

export const FLOWERS = Array.from({ length: 16 }, (_, i) => i + 1);
export const GRID_ROWS = [0, 1, 2, 3].map((r) => FLOWERS.slice(r * 4, r * 4 + 4));

// Columns 1-2 of the sheet are Herbaceous, columns 3-4 are Woody.
export function categoryOf(n) {
  return (n - 1) % 4 < 2 ? 'herbaceous' : 'woody';
}

// Four matching outline groups on the sheet. Neutral names (A-D) because the
// supplied material gives no official terminology for them.
const SHAPE_GROUPS = { a: [1, 4, 6, 7], b: [2, 3, 5, 8], c: [9, 12, 14, 15], d: [10, 11, 13, 16] };
const SHAPE_BY_FLOWER = {};
for (const [k, list] of Object.entries(SHAPE_GROUPS)) for (const n of list) SHAPE_BY_FLOWER[n] = k;
export function shapeOf(n) {
  return SHAPE_BY_FLOWER[n];
}
// Names describe the outline drawn on the official note template.
export const SHAPE_LABELS = { a: 'stepped', b: 'notched', c: 'hexagon', d: 'square' };

// Counts are listed from the starting player, clockwise.
const SIMPLE = {
  2: { hidden: [3, 4], question: [4, 4] },
  3: { hidden: [2, 2, 3], question: [3, 3, 2] },
  4: { hidden: [1, 1, 2, 2], question: [3, 2, 2, 2] },
  5: { hidden: [1, 1, 1, 2, 2], question: [2, 2, 2, 1, 1] },
};
const REGULAR = {
  2: { hidden: [4, 4], question: [4, 3] },
  3: { hidden: [3, 3, 3], question: [2, 2, 2] },
  4: { hidden: [1, 2, 2, 2], question: [2, 2, 2, 2] },
  5: { hidden: [1, 1, 2, 2, 2], question: [2, 2, 1, 1, 1] },
};
export const SETUPS = { simple: SIMPLE, regular: REGULAR, expert: REGULAR };
export const DIFFICULTIES = ['simple', 'regular', 'expert'];
export const PLAYER_COUNTS = [2, 3, 4, 5];

function rotate(list, count, startSeat) {
  // list[i] belongs to the i-th player clockwise from the starter.
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[(startSeat + i) % count] = list[i];
  return out;
}

function lookup(count, difficulty, startSeat) {
  const table = SETUPS[difficulty];
  if (!table) throw new Error(`Unknown difficulty: ${difficulty}`);
  const row = table[count];
  if (!row) throw new Error(`Unsupported player count: ${count}`);
  if (!Number.isInteger(startSeat) || startSeat < 0 || startSeat >= count) throw new Error('Invalid starting seat');
  return row;
}

/** Hidden cards per seat, indexed by clockwise seat (not by start order). */
export function hiddenCountsBySeat(count, difficulty, startSeat) {
  return rotate(lookup(count, difficulty, startSeat).hidden, count, startSeat);
}
export function questionCountsBySeat(count, difficulty, startSeat) {
  return rotate(lookup(count, difficulty, startSeat).question, count, startSeat);
}

export function winCondition(count, difficulty) {
  if (difficulty === 'expert') return 'Everyone must name the Secret Flower correctly.';
  return `At least ${count === 5 ? 3 : 2} players must name the Secret Flower correctly.`;
}
