// Persistence + import/export validation. Works with any Storage-like object.
import { SCHEMA_VERSION, MARKS, SLOT_STATUSES, CLUE_KINDS } from './state.js';
import { hiddenCountsBySeat, DIFFICULTIES, PLAYER_COUNTS } from './game-data.js';

export const STORAGE_KEY = 'secret-flower-notebook';
export const RECOVERY_KEY = 'secret-flower-notebook-recovery';
const MAX_IMPORT_BYTES = 2_000_000;

export function save(storage, notebook) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(notebook));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && (e.name + ': ' + e.message)) || 'Storage unavailable' };
  }
}

export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return { status: 'unavailable', error: String(e) };
  }
  if (raw == null) return { status: 'empty' };
  try {
    const data = JSON.parse(raw);
    const v = validateNotebook(data);
    if (!v.ok) return { status: 'corrupt', raw, errors: v.errors };
    return { status: 'ok', notebook: data };
  } catch {
    return { status: 'corrupt', raw };
  }
}

export function clear(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function exportJSON(notebook) {
  return JSON.stringify({ app: 'secret-flower-notebook', ...notebook }, null, 2);
}

export function exportFilename(notebook, date = new Date()) {
  const d = date.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `secret-flower-notes-${notebook.playerCount}p-${notebook.difficulty}-${d}.json`;
}

export function parseImport(text) {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) return { ok: false, errors: ['File is empty or too large.'] };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Not a valid JSON file.'] };
  }
  if (data && typeof data === 'object') delete data.app;
  const v = validateNotebook(data);
  return v.ok ? { ok: true, notebook: data } : { ok: false, errors: v.errors };
}

const isStr = (x, max) => typeof x === 'string' && x.length <= max;

function validMarks(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  return Object.entries(m).every(([k, v]) => /^(?:[1-9]|1[0-6])$/.test(k) && MARKS.includes(v));
}

export function validateNotebook(d) {
  const errors = [];
  const fail = (msg) => (errors.push(msg), { ok: false, errors });
  if (!d || typeof d !== 'object') return fail('Not a notebook object.');
  if (d.schemaVersion !== SCHEMA_VERSION) return fail(`Unsupported version ${d.schemaVersion}.`);
  if (!PLAYER_COUNTS.includes(d.playerCount)) return fail('Bad player count.');
  if (!DIFFICULTIES.includes(d.difficulty)) return fail('Bad difficulty.');
  if (!Array.isArray(d.players) || d.players.length !== d.playerCount) return fail('Player list does not match player count.');
  const ids = new Set();
  const slotIds = new Set();
  for (const p of d.players) {
    if (!p || !isStr(p.id, 100) || !isStr(p.name, 40) || !Array.isArray(p.slots)) return fail('Bad player entry.');
    if (ids.has(p.id)) return fail('Duplicate player id.');
    ids.add(p.id);
    for (const [i, s] of p.slots.entries()) {
      if (!s || !isStr(s.id, 120) || slotIds.has(s.id)) return fail('Bad slot id.');
      slotIds.add(s.id);
      if (s.position !== i + 1) return fail('Bad slot position.');
      if (!validMarks(s.marks)) return fail('Bad slot marks.');
      if (!(s.exact === null || (Number.isInteger(s.exact) && s.exact >= 1 && s.exact <= 16))) return fail('Bad exact value.');
      if (!SLOT_STATUSES.includes(s.status)) return fail('Bad slot status.');
      if (!isStr(s.note, 5000)) return fail('Bad slot note.');
    }
  }
  const startSeat = d.players.findIndex((p) => p.id === d.startPlayerId);
  if (startSeat < 0) return fail('Unknown starting player.');
  if (!ids.has(d.ownerId)) return fail('Unknown notebook owner.');
  const expected = hiddenCountsBySeat(d.playerCount, d.difficulty, startSeat);
  if (d.players.some((p, i) => p.slots.length !== expected[i])) return fail('Hidden-card slots do not match the setup.');
  if (!validMarks(d.flowers)) return fail('Bad flower marks.');
  if (!isStr(d.notes, 20000)) return fail('Bad notes.');
  if (!Array.isArray(d.clues) || d.clues.length > 1000) return fail('Bad clue list.');
  if (!Number.isInteger(d.clueSeq) || d.clueSeq < 0) return fail('Bad clue counter.');
  for (const c of d.clues) {
    if (!c || !isStr(c.id, 100) || !isStr(c.text, 2000) || !CLUE_KINDS.includes(c.kind) || !Number.isInteger(c.seq)) return fail('Bad clue.');
    if (c.playerId !== null && !ids.has(c.playerId)) return fail('Clue refers to unknown player.');
    if (c.slotId !== null && !slotIds.has(c.slotId)) return fail('Clue refers to unknown card.');
  }
  return { ok: true, errors };
}
