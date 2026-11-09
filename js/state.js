// Notebook state: pure functions only (no DOM), so it can be unit-tested in Node.
import { hiddenCountsBySeat } from './game-data.js';

export const SCHEMA_VERSION = 1;
export const MARKS = ['x', 's']; // x = crossed out, s = suspect
export const SLOT_STATUSES = ['unknown', 'private', 'deduced', 'revealed'];
export const CLUE_KINDS = ['public', 'private'];
const HISTORY_LIMIT = 60;

let idCounter = 0;
export function uid(prefix) {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createNotebook({ playerCount, difficulty, names = [], startSeat = 0, ownerSeat = 0 }) {
  const counts = hiddenCountsBySeat(playerCount, difficulty, startSeat);
  if (!Number.isInteger(ownerSeat) || ownerSeat < 0 || ownerSeat >= playerCount) throw new Error('Invalid owner seat');
  const players = counts.map((n, seat) => {
    const id = uid('p');
    return {
      id,
      name: (names[seat] || '').trim().slice(0, 40) || `Player ${seat + 1}`,
      slots: Array.from({ length: n }, (_, i) => ({ id: `${id}-s${i + 1}`, position: i + 1, marks: {}, exact: null, status: 'unknown', note: '' })),
    };
  });
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('nb'),
    createdAt: now,
    updatedAt: now,
    playerCount,
    difficulty,
    startPlayerId: players[startSeat].id,
    ownerId: players[ownerSeat].id,
    players,
    flowers: {},
    notes: '',
    clues: [],
    clueSeq: 0,
  };
}

export function findSlot(state, slotId) {
  for (const player of state.players) {
    const slot = player.slots.find((s) => s.id === slotId);
    if (slot) return { player, slot };
  }
  return null;
}

function toggleMark(marks, n, tool) {
  if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error('Bad flower number');
  if (tool === 'clear') delete marks[n];
  else if (MARKS.includes(tool)) {
    if (marks[n] === tool) delete marks[n];
    else marks[n] = tool;
  } else throw new Error('Bad tool');
}

/** Returns a new state; never mutates the input. */
export function apply(state, action) {
  const s = structuredClone(state);
  switch (action.type) {
    case 'markFlower':
      toggleMark(s.flowers, action.n, action.tool);
      // Un-crossing a candidate un-sets any card's exact number that pointed at it.
      if (s.flowers[action.n] !== 'x') {
        for (const p of s.players) for (const sl of p.slots) if (sl.exact === action.n) sl.exact = null;
      }
      break;
    case 'markSlot': {
      const f = findSlot(s, action.slotId);
      if (!f) throw new Error('No such slot');
      toggleMark(f.slot.marks, action.n, action.tool);
      break;
    }
    case 'setSlot': {
      const f = findSlot(s, action.slotId);
      if (!f) throw new Error('No such slot');
      const { field, value } = action;
      if (field === 'note') f.slot.note = String(value).slice(0, 5000);
      else if (field === 'exact') {
        const prev = f.slot.exact;
        const next = value == null || value === '' ? null : Number(value);
        if (next !== null && !(Number.isInteger(next) && next >= 1 && next <= 16)) throw new Error('Bad flower number');
        f.slot.exact = next;
        // A card's exact number can't be the Secret Flower: cross it out of the candidates.
        if (next !== null) s.flowers[next] = 'x';
        // Clearing/changing the exact number restores the old candidate, unless another card still claims it.
        if (prev !== null && prev !== next && s.flowers[prev] === 'x' &&
            !s.players.some((p) => p.slots.some((sl) => sl.exact === prev))) delete s.flowers[prev];
      }
      else if (field === 'status' && SLOT_STATUSES.includes(value)) f.slot.status = value;
      else throw new Error('Bad slot field');
      break;
    }
    case 'setOwner': {
      if (!s.players.some((p) => p.id === action.playerId)) throw new Error('No such player');
      s.ownerId = action.playerId;
      break;
    }
    case 'setStart': {
      const seat = s.players.findIndex((p) => p.id === action.playerId);
      if (seat < 0) throw new Error('No such player');
      s.startPlayerId = action.playerId;
      // Hidden-card counts depend on who starts: resize each player's cards, keeping existing card notes by position.
      const counts = hiddenCountsBySeat(s.playerCount, s.difficulty, seat);
      s.players.forEach((p, i) => {
        const n = counts[i];
        p.slots = Array.from({ length: n }, (_, k) => p.slots[k] || { id: `${p.id}-s${k + 1}`, position: k + 1, marks: {}, exact: null, status: 'unknown', note: '' });
      });
      break;
    }
    case 'renamePlayer': {
      const p = s.players.find((x) => x.id === action.playerId);
      if (p) p.name = String(action.name).slice(0, 40);
      break;
    }
    case 'setNotes':
      s.notes = String(action.value).slice(0, 20000);
      break;
    case 'addClue': {
      s.clueSeq += 1;
      s.clues.push({
        id: uid('c'),
        seq: s.clueSeq,
        playerId: action.playerId || null,
        slotId: action.slotId || null,
        text: String(action.text || '').slice(0, 2000),
        kind: CLUE_KINDS.includes(action.kind) ? action.kind : 'public',
      });
      break;
    }
    case 'updateClue': {
      const c = s.clues.find((x) => x.id === action.clueId);
      if (c) {
        if ('text' in action) c.text = String(action.text).slice(0, 2000);
        if (CLUE_KINDS.includes(action.kind)) c.kind = action.kind;
      }
      break;
    }
    case 'deleteClue':
      s.clues = s.clues.filter((x) => x.id !== action.clueId);
      break;
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
  s.updatedAt = new Date().toISOString();
  return s;
}

// ---- undo / redo ----
export function createHistory(present) {
  return { past: [], present, future: [], lastKey: null };
}

/** groupKey: consecutive commits with the same key collapse into one undo step (typing). */
export function commit(h, action, groupKey = null) {
  const next = apply(h.present, action);
  if (groupKey && groupKey === h.lastKey) return { ...h, present: next, future: [] };
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: groupKey };
}
export function endGroup(h) {
  return h.lastKey ? { ...h, lastKey: null } : h;
}
export function undo(h) {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null };
}
export function redo(h) {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null };
}
