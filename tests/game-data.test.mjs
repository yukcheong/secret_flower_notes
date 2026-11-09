import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLOWERS, GRID_ROWS, categoryOf, shapeOf, SETUPS, hiddenCountsBySeat, questionCountsBySeat } from '../js/game-data.js';

test('16 flowers in sheet order, 4 rows of 4', () => {
  assert.deepEqual(FLOWERS, Array.from({ length: 16 }, (_, i) => i + 1));
  assert.deepEqual(GRID_ROWS, [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]);
});

test('herbaceous / woody membership matches the note sheet', () => {
  const herb = FLOWERS.filter((n) => categoryOf(n) === 'herbaceous');
  const woody = FLOWERS.filter((n) => categoryOf(n) === 'woody');
  assert.deepEqual(herb, [1, 2, 5, 6, 9, 10, 13, 14]);
  assert.deepEqual(woody, [3, 4, 7, 8, 11, 12, 15, 16]);
});

test('outline groups match the note sheet', () => {
  const groups = {};
  for (const n of FLOWERS) (groups[shapeOf(n)] ||= []).push(n);
  assert.deepEqual(Object.values(groups).map((g) => g.join(',')).sort(),
    ['1,4,6,7', '10,11,13,16', '2,3,5,8', '9,12,14,15'].sort());
});

const EXPECTED = {
  simple: { 2: [[3, 4], [4, 4]], 3: [[2, 2, 3], [3, 3, 2]], 4: [[1, 1, 2, 2], [3, 2, 2, 2]], 5: [[1, 1, 1, 2, 2], [2, 2, 2, 1, 1]] },
  regular: { 2: [[4, 4], [4, 3]], 3: [[3, 3, 3], [2, 2, 2]], 4: [[1, 2, 2, 2], [2, 2, 2, 2]], 5: [[1, 1, 2, 2, 2], [2, 2, 1, 1, 1]] },
};

test('setup tables match the rulebook and total 16 with the Secret Flower', () => {
  for (const diff of ['simple', 'regular', 'expert']) {
    const src = EXPECTED[diff === 'expert' ? 'regular' : diff];
    for (const n of [2, 3, 4, 5]) {
      assert.deepEqual(SETUPS[diff][n].hidden, src[n][0], `${diff} ${n} hidden`);
      assert.deepEqual(SETUPS[diff][n].question, src[n][1], `${diff} ${n} question`);
      const total = src[n][0].reduce((a, b) => a + b) + src[n][1].reduce((a, b) => a + b) + 1;
      assert.equal(total, 16);
    }
  }
});

test('counts rotate from the starting seat clockwise', () => {
  // 4 players, simple: start player gets 1, then 1,2,2 clockwise
  assert.deepEqual(hiddenCountsBySeat(4, 'simple', 0), [1, 1, 2, 2]);
  assert.deepEqual(hiddenCountsBySeat(4, 'simple', 2), [2, 2, 1, 1]);
  assert.deepEqual(hiddenCountsBySeat(3, 'regular', 1), [3, 3, 3]);
  assert.deepEqual(hiddenCountsBySeat(5, 'expert', 4), [1, 2, 2, 2, 1]);
  assert.deepEqual(questionCountsBySeat(2, 'regular', 1), [3, 4]);
});

test('invalid setups throw', () => {
  assert.throws(() => hiddenCountsBySeat(6, 'simple', 0));
  assert.throws(() => hiddenCountsBySeat(3, 'nightmare', 0));
  assert.throws(() => hiddenCountsBySeat(3, 'simple', 3));
});
