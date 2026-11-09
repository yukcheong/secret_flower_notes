import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotebook, apply } from '../js/state.js';
import { STORAGE_KEY, save, load, exportJSON, parseImport, validateNotebook } from '../js/storage.js';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const nb = () => {
  let s = createNotebook({ playerCount: 3, difficulty: 'regular', names: ['A', 'B', 'C'], startSeat: 0, ownerSeat: 1 });
  s = apply(s, { type: 'markFlower', n: 3, tool: 'x' });
  s = apply(s, { type: 'setNotes', value: '<img src=x onerror=alert(1)>' });
  return s;
};

test('save/load round trip', () => {
  const st = memStore();
  const s = nb();
  assert.deepEqual(save(st, s), { ok: true });
  const r = load(st);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.notebook, s);
});

test('empty storage reports empty', () => {
  assert.equal(load(memStore()).status, 'empty');
});

test('save failure is reported, not swallowed', () => {
  const st = { setItem() { throw new DOMException('full', 'QuotaExceededError'); }, getItem: () => null };
  const r = save(st, nb());
  assert.equal(r.ok, false);
  assert.match(r.error, /full|quota/i);
});

test('corrupt saved data is kept for recovery, not overwritten', () => {
  const st = memStore();
  st.setItem(STORAGE_KEY, '{not json');
  const r = load(st);
  assert.equal(r.status, 'corrupt');
  assert.equal(r.raw, '{not json');
});

test('export/import round trip', () => {
  const s = nb();
  const r = parseImport(exportJSON(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.notebook, s);
  assert.equal(r.notebook.notes, '<img src=x onerror=alert(1)>');
});

test('rejects invalid imports', () => {
  assert.equal(parseImport('nope').ok, false);
  assert.equal(parseImport('x'.repeat(2_000_001)).ok, false);
  const s = nb();
  for (const bad of [
    { ...s, schemaVersion: 99 },
    { ...s, playerCount: 9 },
    { ...s, flowers: { 17: 'x' } },
    { ...s, flowers: { 3: 'zzz' } },
    { ...s, ownerId: 'ghost' },
    { ...s, players: s.players.slice(1) },
    { ...s, clues: [{ id: 'c', playerId: 'ghost', slotId: null, text: '', kind: 'public', seq: 1 }] },
  ]) assert.equal(validateNotebook(bad).ok, false, JSON.stringify(bad).slice(0, 80));
});

test('rejects slot counts inconsistent with setup', () => {
  const s = nb();
  s.players[0].slots.pop();
  assert.equal(validateNotebook(s).ok, false);
});
