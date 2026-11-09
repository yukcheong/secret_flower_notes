import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotebook, apply, createHistory, commit, undo, redo, findSlot } from '../js/state.js';

const base = () => createNotebook({ playerCount: 4, difficulty: 'simple', names: ['Ann', '', 'Cy', 'Di'], startSeat: 2, ownerSeat: 0 });

test('creates players clockwise with correct slot counts from start seat', () => {
  const s = base();
  assert.equal(s.players.length, 4);
  assert.deepEqual(s.players.map((p) => p.name), ['Ann', 'Player 2', 'Cy', 'Di']);
  assert.deepEqual(s.players.map((p) => p.slots.length), [2, 2, 1, 1]);
  assert.equal(s.startPlayerId, s.players[2].id);
  assert.equal(s.ownerId, s.players[0].id);
  const ids = s.players.flatMap((p) => p.slots.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(s.players[0].slots.map((x) => x.position), [1, 2]);
});

test('flower marking toggles and clears', () => {
  let s = base();
  s = apply(s, { type: 'markFlower', n: 5, tool: 'x' });
  assert.equal(s.flowers[5], 'x');
  s = apply(s, { type: 'markFlower', n: 5, tool: 's' });
  assert.equal(s.flowers[5], 's');
  s = apply(s, { type: 'markFlower', n: 5, tool: 's' });
  assert.equal(s.flowers[5], undefined);
  s = apply(s, { type: 'markFlower', n: 6, tool: 'x' });
  s = apply(s, { type: 'markFlower', n: 6, tool: 'clear' });
  assert.equal(s.flowers[6], undefined);
});

test('slot marks never propagate; only an exact number crosses out its candidate', () => {
  let s = base();
  const slot = s.players[1].slots[0];
  s = apply(s, { type: 'markSlot', slotId: slot.id, n: 14, tool: 'x' });
  s = apply(s, { type: 'setSlot', slotId: slot.id, field: 'exact', value: 9 });
  assert.equal(findSlot(s, slot.id).slot.marks[14], 'x');
  assert.deepEqual(s.flowers, { 9: 'x' });
  assert.deepEqual(s.players[1].slots[1].marks, {});
});

test('private knowledge is never automatically marked revealed', () => {
  let s = base();
  const slot = s.players[2].slots[0];
  s = apply(s, { type: 'setSlot', slotId: slot.id, field: 'exact', value: 3 });
  s = apply(s, { type: 'setSlot', slotId: slot.id, field: 'status', value: 'private' });
  assert.equal(findSlot(s, slot.id).slot.status, 'private');
  s = apply(s, { type: 'setSlot', slotId: slot.id, field: 'status', value: 'revealed' });
  assert.equal(findSlot(s, slot.id).slot.status, 'revealed');
});

test('renaming keeps ids and notes attached', () => {
  let s = base();
  const p = s.players[3];
  s = apply(s, { type: 'setSlot', slotId: p.slots[0].id, field: 'note', value: 'range 13-16' });
  s = apply(s, { type: 'renamePlayer', playerId: p.id, name: 'Dee' });
  assert.equal(s.players[3].name, 'Dee');
  assert.equal(s.players[3].slots[0].note, 'range 13-16');
});

test('clues: multiple per slot, edit, delete', () => {
  let s = base();
  const p = s.players[0];
  s = apply(s, { type: 'addClue', playerId: p.id, slotId: p.slots[1].id, text: 'range 13-16', kind: 'public' });
  s = apply(s, { type: 'addClue', playerId: p.id, slotId: p.slots[1].id, text: 'maybe 14', kind: 'private' });
  assert.equal(s.clues.length, 2);
  assert.deepEqual(s.clues.map((c) => c.seq), [1, 2]);
  s = apply(s, { type: 'updateClue', clueId: s.clues[0].id, text: 'range 13–16 (Bo asked)' });
  assert.equal(s.clues[0].text, 'range 13–16 (Bo asked)');
  s = apply(s, { type: 'deleteClue', clueId: s.clues[1].id });
  assert.equal(s.clues.length, 1);
});

test('apply does not mutate the input', () => {
  const s = base();
  const snap = JSON.stringify(s);
  apply(s, { type: 'markFlower', n: 1, tool: 'x' });
  assert.equal(JSON.stringify(s), snap);
});

test('undo restores accidental cross-out, redo reapplies', () => {
  let h = createHistory(base());
  h = commit(h, { type: 'markFlower', n: 7, tool: 'x' });
  assert.equal(h.present.flowers[7], 'x');
  h = undo(h);
  assert.equal(h.present.flowers[7], undefined);
  h = redo(h);
  assert.equal(h.present.flowers[7], 'x');
});

test('text edits with the same group key coalesce into one undo step', () => {
  let h = createHistory(base());
  h = commit(h, { type: 'setNotes', value: 'a' }, 'notes');
  h = commit(h, { type: 'setNotes', value: 'ab' }, 'notes');
  h = commit(h, { type: 'setNotes', value: 'abc' }, 'notes');
  assert.equal(h.past.length, 1);
  h = undo(h);
  assert.equal(h.present.notes, '');
});

test('history is bounded', () => {
  let h = createHistory(base());
  for (let i = 0; i < 120; i++) h = commit(h, { type: 'markFlower', n: (i % 16) + 1, tool: 'x' });
  assert.ok(h.past.length <= 60);
});

test('setStart re-rotates card counts and keeps existing card data; setOwner changes "you"', () => {
  let s = createNotebook({ playerCount: 4, difficulty: 'simple' }); // hidden 1,1,2,2
  s = apply(s, { type: 'setSlot', slotId: s.players[2].slots[0].id, field: 'note', value: 'keep me' });
  s = apply(s, { type: 'setStart', playerId: s.players[2].id }); // seat 2 starts -> 2,2,1,1
  assert.deepEqual(s.players.map((p) => p.slots.length), [2, 2, 1, 1]);
  assert.equal(s.players[2].slots[0].note, 'keep me');
  assert.equal(s.startPlayerId, s.players[2].id);
  s = apply(s, { type: 'setOwner', playerId: s.players[3].id });
  assert.equal(s.ownerId, s.players[3].id);
  assert.throws(() => apply(s, { type: 'setOwner', playerId: 'nope' }));
});

test('exact number crosses out candidate; un-crossing unsets exact', () => {
  let s = base();
  const a = s.players[0].slots[0].id, b = s.players[1].slots[0].id;
  s = apply(s, { type: 'setSlot', slotId: a, field: 'exact', value: '7' });
  assert.equal(s.flowers[7], 'x');
  s = apply(s, { type: 'setSlot', slotId: a, field: 'exact', value: '9' });
  assert.equal(s.flowers[7], undefined);
  assert.equal(s.flowers[9], 'x');
  s = apply(s, { type: 'setSlot', slotId: b, field: 'exact', value: '9' });
  s = apply(s, { type: 'setSlot', slotId: a, field: 'exact', value: null });
  assert.equal(s.flowers[9], 'x'); // still claimed by b
  s = apply(s, { type: 'markFlower', n: 9, tool: 'x' }); // undo cross in candidates
  assert.equal(s.flowers[9], undefined);
  assert.equal(findSlot(s, b).slot.exact, null);
});
