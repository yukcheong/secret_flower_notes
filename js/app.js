// UI layer: rendering, events, persistence wiring, offline support.
import { GRID_ROWS, categoryOf, shapeOf, SHAPE_LABELS, PLAYER_COUNTS, DIFFICULTIES, hiddenCountsBySeat, questionCountsBySeat, winCondition } from './game-data.js';
import { createNotebook, createHistory, commit, endGroup, undo, redo, findSlot } from './state.js';
import { STORAGE_KEY, RECOVERY_KEY, save, load, clear, exportJSON, exportFilename, parseImport } from './storage.js';
import { rulesSections } from './rules.js';

const $ = (sel) => document.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

// Outlines traced from the note template PDF (100x100 box).
const SHAPES = {
  a: '<path d="M35 7h30v11h15v15h13v34H80v15H65v11H35V82H20V67H7V33h13V18h15Z"/>',
  b: '<path d="M8 10 50 24 92 10v80L50 76 8 90Z"/>',
  c: '<path d="M50 4 91 27v46L50 96 9 73V27Z"/>',
  d: '<rect x="11" y="11" width="78" height="78" rx="2"/>',
};
const STATUS_LABELS = {
  unknown: 'Unknown',
  private: 'Known privately',
  deduced: 'My deduction',
  revealed: 'Revealed at the table',
};
const TOOLS = [
  { id: 'x', label: 'Cross out', ico: '✕' },
  { id: 's', label: 'Suspect', ico: '?' },
  { id: 'clear', label: 'Erase', ico: '⌫' },
];
const TOOL_HINTS = {
  x: 'Tap a flower to cross it out. Tap again to undo.',
  s: 'Tap a flower to mark it as suspected. Tap again to undo.',
  clear: 'Tap a marked flower to remove its mark.',
};
const DIFF_LABEL = { simple: 'Simple', regular: 'Regular', expert: 'Expert' };

// ---------------- app state ----------------
let H = null; // history
let storageOK = true;
let lastWritten = null;
let dirtyTimer = null;
let tab = 'flowers';
const tools = { flowers: 'x', slot: 'x' };
let openSlotId = null;
let clueKind = 'public';

const store = (() => {
  try {
    const k = '__sf_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    storageOK = false;
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  }
})();

// ---------------- persistence ----------------
function setStatus(text, bad = false) {
  const el = $('#save-status');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}
function persistNow() {
  clearTimeout(dirtyTimer);
  dirtyTimer = null;
  if (!H) return;
  const r = save(store, H.present);
  if (r.ok && storageOK) {
    lastWritten = JSON.stringify(H.present);
    setStatus('Saved on this device');
  } else setStatus('Not saved on this device — export a backup', true);
}
function schedulePersist(delay) {
  setStatus('Saving…');
  clearTimeout(dirtyTimer);
  if (delay) dirtyTimer = setTimeout(persistNow, delay);
  else persistNow();
}
function flush() {
  if (dirtyTimer) persistNow();
  if (H) H = endGroup(H);
}

function act(action, groupKey = null) {
  try {
    H = commit(H, action, groupKey);
  } catch (e) {
    console.error(e);
    return;
  }
  schedulePersist(groupKey ? 400 : 0);
  render();
}

// ---------------- generic pieces ----------------
function segmented(container, options, value, onPick) {
  container.replaceChildren(
    ...options.map((o) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.value === value), onclick: () => onPick(o.value) }, o.label),
    ),
  );
}
function toolbar(container, key) {
  let hint = container.nextElementSibling;
  if (!hint || !hint.classList.contains('tool-hint')) {
    hint = h('p', { class: 'tool-hint hint', 'aria-live': 'polite' });
    container.after(hint);
  }
  hint.textContent = TOOL_HINTS[tools[key]];
  container.replaceChildren(
    ...TOOLS.map((t) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(tools[key] === t.id), onclick: () => { tools[key] = t.id; render(); } },
        h('span', { class: `tool-ico ${t.id}`, 'aria-hidden': 'true' }, t.ico), t.label),
    ),
  );
}
function flowerGrid(container, marks, onTap, exact = null) {
  const cells = [];
  for (const row of GRID_ROWS) for (const n of row) {
    const m = marks[n];
    const state = m === 'x' ? 'crossed out' : m === 's' ? 'suspected' : 'possible';
    const btn = h('button', {
      type: 'button',
      class: `flower ${categoryOf(n)} shape-${shapeOf(n)} ${m ? 'mark-' + m : ''} ${exact === n ? 'exact' : ''}`,
      'aria-label': `${n}, ${categoryOf(n)}, ${SHAPE_LABELS[shapeOf(n)]}: ${state}${exact === n ? ', exact number' : ''}`,
      onclick: () => onTap(n),
    });
    btn.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${SHAPES[shapeOf(n)]}</svg>`;
    btn.append(h('span', { class: 'num', 'aria-hidden': 'true' }, n), h('span', { class: 'badge', 'aria-hidden': 'true' }, m === 'x' ? '✕' : m === 's' ? '?' : ''));
    cells.push(btn);
  }
  container.replaceChildren(
    h('div', { class: 'grid-head', 'aria-hidden': 'true' }, h('span', { class: 'h' }, 'Herbaceous'), h('span', { class: 'w' }, 'Woody')),
    h('div', { class: 'flower-cells' }, cells),
  );
}
// Flowers crossed out in Secret Flower candidates show as crossed out on every hidden card.
function slotView(s, slot) {
  const m = { ...slot.marks };
  for (const [n, v] of Object.entries(s.flowers)) if (v === 'x') m[n] = 'x';
  // The card's own exact number is crossed in candidates, but on this card it's the answer, not a cross.
  if (slot.exact && m[slot.exact] === 'x' && slot.marks[slot.exact] !== 'x') delete m[slot.exact];
  return m;
}
function slotLabel(slot, total) {
  if (total === 1) return 'Card 1 (only)';
  if (slot.position === 1) return 'Card 1 (lowest)';
  if (slot.position === total) return `Card ${total} (highest)`;
  return `Card ${slot.position}`;
}
function setValueIfIdle(el, v) {
  if (document.activeElement !== el && el.value !== v) el.value = v;
}

// ---------------- game creation ----------------
const DEFAULT_GAME = { count: 4, difficulty: 'simple' };
function makeGame(count, difficulty, names = []) {
  const nb = createNotebook({ playerCount: count, difficulty, names: Array.from({ length: count }, (_, i) => names[i] || `Player ${i + 1}`), startSeat: 0, ownerSeat: 0 });
  H = createHistory(nb);
  openSlotId = null;
  tab = 'flowers';
  persistNow();
}

// ---------------- main views ----------------
function render() {
  if (!H) makeGame(DEFAULT_GAME.count, DEFAULT_GAME.difficulty);
  for (const v of ['flowers', 'players', 'notes']) $(`#view-${v}`).hidden = tab !== v;
  document.querySelectorAll('#tabs button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#btn-undo').disabled = !H.past.length;
  $('#btn-redo').disabled = !H.future.length;
  const s = H.present;

  // Flowers
  flowerGrid($('#flower-grid'), s.flowers, (n) => act({ type: 'markFlower', n, tool: 'x' }));
  const crossed = Object.values(s.flowers).filter((m) => m === 'x').length;
  $('#flower-count').textContent = `${16 - crossed} of 16 still possible`;

  // Players
  const startIdx = s.players.findIndex((p) => p.id === s.startPlayerId);
  $('#player-list').replaceChildren(...s.players.map((p, seat) =>
    h('li', { class: 'player' },
      h('div', { class: 'player-head' },
        h('button', { type: 'button', class: 'player-name rename', title: 'Rename', 'aria-label': `Rename ${p.name}`, onclick: () => renamePlayers(seat) }, `${seat + 1}. ${p.name} ✎`),
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(p.id === s.ownerId), onclick: () => { if (p.id !== s.ownerId) act({ type: 'setOwner', playerId: p.id }); } }, 'You'),
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(seat === startIdx), onclick: () => { if (seat !== startIdx) act({ type: 'setStart', playerId: p.id }); } }, 'Starts'),
      ),
      h('p', { class: 'dir' }, p.slots.length > 1 ? `${p.name}'s left → right` : ''),
      h('div', { class: 'slots' }, p.slots.map((sl) => {
        const vm = slotView(s, sl);
        const sus = Object.keys(vm).filter((k) => vm[k] === 's').map(Number).sort((a, b) => a - b);
        const val = sl.exact ? String(sl.exact) : sus.length ? sus.join(' / ') : '?';
        const meta = sl.note ? sl.note.slice(0, 60) : '';
        const valDesc = sl.exact ? `, exactly ${sl.exact}` : sus.length ? `, suspected ${sus.join(', ')}` : '';
        return h('button', { type: 'button', class: `slot ${sl.exact ? 'st-exact' : sus.length ? 'st-suspect' : 'st-unknown'}`, onclick: () => openSlot(sl.id), 'aria-label': `${p.name}, ${slotLabel(sl, p.slots.length)}${valDesc}. ${meta || 'No notes'}` },
          h('span', { class: 'slot-pos' }, slotLabel(sl, p.slots.length)),
          h('span', { class: `slot-val ${!sl.exact && sus.length > 2 ? 'many' : ''}` }, val),
          h('span', { class: 'slot-meta' }, meta || 'Tap to add notes'));
      })),
    )));

  // Notes
  setValueIfIdle($('#general-notes'), s.notes);

  if (openSlotId) renderSlotDialog();
}

function renderClueForm() {
  const s = H.present;
  const pSel = $('#clue-player');
  const prevP = pSel.value;
  pSel.replaceChildren(h('option', { value: '' }, 'General'), ...s.players.map((p) => h('option', { value: p.id }, p.name)));
  pSel.value = s.players.some((p) => p.id === prevP) ? prevP : '';
  const sSel = $('#clue-slot');
  const prevS = sSel.value;
  const p = s.players.find((x) => x.id === pSel.value);
  sSel.replaceChildren(h('option', { value: '' }, 'Any / not specific'), ...(p ? p.slots.map((sl) => h('option', { value: sl.id }, slotLabel(sl, p.slots.length))) : []));
  sSel.value = p && p.slots.some((x) => x.id === prevS) ? prevS : '';
  sSel.disabled = !p;
  segmented($('#clue-kind'), [{ value: 'public', label: 'Public information' }, { value: 'private', label: 'Private deduction' }], clueKind, (v) => { clueKind = v; renderClueForm(); });
}

function clueWhere(c) {
  const s = H.present;
  if (!c.playerId) return 'General';
  const p = s.players.find((x) => x.id === c.playerId);
  const f = c.slotId && findSlot(s, c.slotId);
  return f ? `${p.name} · ${slotLabel(f.slot, p.slots.length)}` : p.name;
}
function renderClueList(container, clues, showWhere) {
  if (!clues.length) {
    container.replaceChildren(h('li', { class: 'empty' }, 'No clues yet.'));
    return;
  }
  container.replaceChildren(...[...clues].reverse().map((c) =>
    h('li', { class: `clue ${c.kind}` },
      h('span', { class: 'clue-meta' }, `#${c.seq} · ${c.kind === 'public' ? 'Public' : 'Private deduction'}${showWhere ? ' · ' + clueWhere(c) : ''}`),
      h('span', { class: 'clue-actions' },
        c.slotId && showWhere && h('button', { type: 'button', 'aria-label': `Open card for clue ${c.seq}`, onclick: () => openSlot(c.slotId) }, '↗'),
        h('button', { type: 'button', 'aria-label': `Edit clue ${c.seq}`, onclick: () => editClue(c.id) }, '✎'),
        h('button', { type: 'button', 'aria-label': `Delete clue ${c.seq}`, onclick: () => act({ type: 'deleteClue', clueId: c.id }) }, '🗑'),
      ),
      h('span', { class: 'clue-text' }, c.text || '(empty)'),
    )));
}

// ---------------- slot dialog ----------------
function openSlot(slotId) {
  flush();
  openSlotId = slotId;
  const d = $('#slot-dialog');
  renderSlotDialog();
  if (!d.open) d.showModal();
  d.querySelector('.sheet-body').scrollTop = 0;
}
function renderSlotDialog() {
  const s = H.present;
  const f = findSlot(s, openSlotId);
  if (!f) {
    $('#slot-dialog').close();
    return;
  }
  const { player, slot } = f;
  $('#slot-title').textContent = `${player.name} · ${slotLabel(slot, player.slots.length)}`;
  $('#slot-sub').textContent = `${player.slots.length} hidden card${player.slots.length > 1 ? 's' : ''}, lowest → highest from ${player.name}'s left to right. Marks here only affect this card.`;
  flowerGrid($('#slot-grid'), slotView(s, slot), (n) => { if (s.flowers[n] !== 'x') act({ type: 'markSlot', slotId: slot.id, n, tool: 's' }); }, slot.exact);
  const ex = $('#slot-exact');
  // Only offer numbers still possible in Secret Flower candidates (plus this card's own exact,
  // which setting it crosses out of the candidates).
  ex.replaceChildren(h('option', { value: '' }, '— not set —'));
  for (let n = 1; n <= 16; n++) {
    if (s.flowers[n] === 'x' && slot.exact !== n) continue;
    ex.append(h('option', { value: n }, n));
  }
  ex.value = slot.exact ? String(slot.exact) : '';
  setValueIfIdle($('#slot-note'), slot.note);
}

// ---------------- info dialog helper ----------------
function showInfo({ title, body, actions = [], closeLabel = 'Close', onOpen }) {
  const d = $('#info-dialog');
  $('#info-title').textContent = title;
  $('#info-close').textContent = closeLabel;
  $('#info-body').replaceChildren(...[].concat(body));
  $('#info-foot').replaceChildren(...actions.map((a) =>
    h('button', { type: 'button', class: `btn ${a.cls || ''}`, onclick: async () => { if ((await a.onClick?.()) !== false) d.close(); } }, a.label)));
  if (!d.open) d.showModal();
  onOpen?.();
}

function editClue(id) {
  const c = H.present.clues.find((x) => x.id === id);
  if (!c) return;
  const ta = h('textarea', { rows: '4', maxlength: '2000', 'aria-label': 'Clue text' });
  ta.value = c.text;
  let kind = c.kind;
  const seg = h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': 'Clue type' });
  const paint = () => segmented(seg, [{ value: 'public', label: 'Public information' }, { value: 'private', label: 'Private deduction' }], kind, (v) => { kind = v; paint(); });
  paint();
  showInfo({
    title: `Edit clue #${c.seq}`,
    body: [h('p', { class: 'hint' }, clueWhere(c)), ta, h('div', { style: 'margin-top:.5rem' }, seg)],
    closeLabel: 'Cancel',
    actions: [{ label: 'Save', cls: 'primary', onClick: () => act({ type: 'updateClue', clueId: id, text: ta.value, kind }) }],
  });
}

// ---------------- export / import / new ----------------
function downloadExport() {
  flush();
  const blob = new Blob([exportJSON(H.present)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: exportFilename(H.present) });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function downloadRaw(raw) {
  const blob = new Blob([raw], { type: 'text/plain' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'secret-flower-recovered-data.txt' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function handleImport(file) {
  if (!file) return;
  if (file.size > 2_000_000) {
    showInfo({ title: 'Import failed', body: h('p', {}, 'File is too large to be a notebook backup.') });
    return;
  }
  const r = parseImport(await file.text());
  if (!r.ok) {
    showInfo({ title: 'Import failed', body: [h('p', {}, 'This file is not a valid notebook backup. Your current notes are unchanged.'), h('p', { class: 'hint' }, r.errors.join(' '))] });
    return;
  }
  const nb = r.notebook;
  const preview = h('div', {},
    h('p', {}, `${nb.playerCount} players · ${DIFF_LABEL[nb.difficulty]} · last edited ${new Date(nb.updatedAt).toLocaleString()}`),
    h('p', {}, `Players: ${nb.players.map((p) => p.name).join(', ')}`),
    h('p', {}, `${nb.clues.length} clues, ${Object.keys(nb.flowers).length} flower marks.`),
    H && h('p', { class: 'hint' }, 'Importing replaces your current notebook on this device.'),
  );
  showInfo({
    title: 'Import this notebook?',
    body: preview,
    closeLabel: 'Cancel',
    actions: [
      H && { label: 'Export current first', onClick: () => { downloadExport(); return false; } },
      { label: 'Replace', cls: 'primary', onClick: () => { H = createHistory(nb); persistNow(); render(); } },
    ].filter(Boolean),
  });
}

function newGame() {
  const pick = { count: H?.present.playerCount || DEFAULT_GAME.count, difficulty: H?.present.difficulty || DEFAULT_GAME.difficulty };
  const segCount = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Number of players' });
  const segDiff = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Difficulty' });
  const win = h('p', { class: 'hint' });
  const keep = h('input', { type: 'checkbox' }); keep.checked = true;
  const paint = () => {
    segmented(segCount, PLAYER_COUNTS.map((n) => ({ value: n, label: String(n) })), pick.count, (v) => { pick.count = v; paint(); });
    segmented(segDiff, DIFFICULTIES.map((d) => ({ value: d, label: DIFF_LABEL[d] })), pick.difficulty, (v) => { pick.difficulty = v; paint(); });
    win.textContent = winCondition(pick.count, pick.difficulty);
  };
  paint();
  showInfo({
    title: 'New game',
    body: [
      h('p', { class: 'field-label' }, h('strong', {}, 'Players')), segCount,
      h('p', { class: 'field-label' }, h('strong', {}, 'Difficulty')), segDiff, win,
      h('label', { class: 'check' }, keep, ' Keep the same player names'),
      h('p', { class: 'hint' }, 'This clears the current notebook on this device. Tap a name, “You” or “Starts” on the Players tab to change them any time.'),
    ],
    closeLabel: 'Cancel',
    actions: [
      { label: 'Export first', onClick: () => { downloadExport(); return false; } },
      { label: 'Start new game', cls: 'danger', onClick: () => {
        const names = keep.checked && H ? H.present.players.map((p) => p.name) : [];
        clear(store);
        lastWritten = null;
        makeGame(pick.count, pick.difficulty, names);
        render();
        window.scrollTo(0, 0);
      } },
    ],
  });
}

function renamePlayers(focusSeat) {
  const s = H.present;
  const inputs = s.players.map((p, i) => {
    const inp = h('input', { type: 'text', maxlength: '40', 'aria-label': `Seat ${i + 1} name` });
    inp.value = p.name;
    return inp;
  });
  showInfo({
    title: 'Rename players',
    body: h('div', { class: 'rename-list' }, inputs.map((inp, i) => h('label', { class: 'field' }, h('span', {}, `Seat ${i + 1}`), inp))),
    closeLabel: 'Cancel',
    onOpen: () => { if (focusSeat != null) { inputs[focusSeat].focus(); inputs[focusSeat].select(); } },
    actions: [{ label: 'Save', cls: 'primary', onClick: () => {
      inputs.forEach((inp, i) => {
        const name = inp.value.trim() || `Player ${i + 1}`;
        if (name !== H.present.players[i].name) act({ type: 'renamePlayer', playerId: H.present.players[i].id, name });
      });
    } }],
  });
}

function showRules() {
  const nb = H?.present;
  const body = rulesSections().map((sec) =>
    h('section', { class: 'rules' },
      h('h3', {}, sec.title, ' ', h('span', { class: 'src' }, `(rulebook ${sec.src})`)),
      sec.body.map((t) => h('p', {}, t)),
      (sec.tables || []).map((t) => h('div', {},
        h('p', {}, h('strong', {}, t.caption)),
        h('table', { class: 'deal-table' },
          h('thead', {}, h('tr', {}, ['Players', 'Hidden', 'Question'].map((c) => h('th', {}, c)))),
          h('tbody', {}, t.rows.map((r) => h('tr', {},
            h('td', {}, String(r.n)), h('td', {}, String(r.hidden)), h('td', {}, String(r.question)))))))),
    ));
  if (nb) body.unshift(h('p', { class: 'hint' }, `This game: ${nb.playerCount} players, ${DIFF_LABEL[nb.difficulty]}. ${winCondition(nb.playerCount, nb.difficulty)}`));
  showInfo({ title: 'Rules reminders', body });
}

// ---------------- banners ----------------
function banner(msg, actions = [], kind = '') {
  const b = $('#banner');
  b.className = `banner ${kind}`;
  b.replaceChildren(h('span', { style: 'flex:1 1 12rem' }, msg), ...actions.map((a) => h('button', { type: 'button', class: 'btn', onclick: a.onClick }, a.label)));
  b.hidden = false;
}
function hideBanner() {
  $('#banner').hidden = true;
}

// ---------------- offline ----------------
function setupServiceWorker() {
  const el = $('#offline-status');
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    el.textContent = 'Offline mode is not available in this browser/context. Notes still save on this device.';
    return;
  }
  el.textContent = 'Preparing offline mode…';
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ready = () => (el.textContent = 'Offline ready: this notebook works without a connection.');
    if (reg.active) ready();
    navigator.serviceWorker.ready.then(ready);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          banner('A new version is available.', [
            { label: 'Update now', onClick: () => { flush(); w.postMessage('skipWaiting'); } },
            { label: 'Later', onClick: hideBanner },
          ]);
        }
      });
    });
  }).catch(() => (el.textContent = 'Offline mode could not be enabled. Notes still save on this device.'));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    flush();
    location.reload();
  });
}

// ---------------- wiring ----------------
function init() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    flush();
    tab = b.dataset.tab;
    render();
    window.scrollTo({ top: 0 });
  });
  $('#btn-undo').onclick = () => { flush(); H = undo(H); schedulePersist(0); render(); };
  $('#btn-redo').onclick = () => { flush(); H = redo(H); schedulePersist(0); render(); };
  $('#btn-hide').onclick = () => { flush(); $('#cover').hidden = false; $('#btn-unhide').focus(); };
  $('#btn-unhide').onclick = () => { $('#cover').hidden = true; $('#btn-hide').focus(); };
  $('#btn-more').onclick = () => $('#more-dialog').showModal();
  $('#btn-rules').onclick = () => { $('#more-dialog').close(); showRules(); };
  $('#btn-export').onclick = () => downloadExport();
  $('#btn-rename').onclick = () => { $('#more-dialog').close(); renamePlayers(); };
  $('#btn-new').onclick = () => { $('#more-dialog').close(); newGame(); };
  $('#file-import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    $('#more-dialog').close();
    handleImport(f);
  });

  $('#general-notes').addEventListener('input', (e) => act({ type: 'setNotes', value: e.target.value }, 'notes'));
  $('#general-notes').addEventListener('blur', flush);

  $('#slot-note').addEventListener('input', (e) => act({ type: 'setSlot', slotId: openSlotId, field: 'note', value: e.target.value }, 'note:' + openSlotId));
  $('#slot-note').addEventListener('blur', flush);
  $('#slot-exact').addEventListener('change', (e) => act({ type: 'setSlot', slotId: openSlotId, field: 'exact', value: e.target.value || null }));
  $('#slot-dialog').addEventListener('close', () => { flush(); openSlotId = null; render(); });

  // Keep focused inputs visible above the on-screen keyboard.
  document.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea, select')) setTimeout(() => e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
  });

  // Flush pending text when the page is backgrounded/closed.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  // Another tab changed the notebook.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue === lastWritten) return;
    banner('This notebook was changed in another tab or window.', [
      { label: 'Load latest', onClick: () => {
        const r = load(store);
        H = r.status === 'ok' ? createHistory(r.notebook) : null;
        lastWritten = r.status === 'ok' ? JSON.stringify(r.notebook) : null;
        hideBanner();
        render();
      } },
      { label: 'Keep mine', onClick: () => { persistNow(); hideBanner(); } },
    ]);
  });

  // Ctrl/Cmd+Z shortcuts (outside text fields).
  document.addEventListener('keydown', (e) => {
    if (!H || !(e.ctrlKey || e.metaKey) || e.target.matches('input, textarea')) return;
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#btn-redo') : $('#btn-undo')).click(); }
    if (e.key.toLowerCase() === 'y') { e.preventDefault(); $('#btn-redo').click(); }
  });

  // Load saved notebook.
  const r = load(store);
  if (!storageOK) {
    banner('This browser is blocking local storage (private mode?). Notes will be lost when the page closes — export a backup.', [], 'error');
  }
  if (r.status === 'ok') {
    H = createHistory(r.notebook);
    lastWritten = JSON.stringify(r.notebook);
  } else if (r.status === 'corrupt') {
    try { store.setItem(RECOVERY_KEY, r.raw); } catch { /* best effort */ }
    banner('Saved notes could not be read. They have been kept aside rather than overwritten.', [
      { label: 'Download raw data', onClick: () => downloadRaw(r.raw) },
    ], 'error');
  }
  render();
  if (H) setStatus('Saved on this device');
  setupServiceWorker();
}

init();
