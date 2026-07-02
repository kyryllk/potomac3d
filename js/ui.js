// Wires the DOM chrome to the editor and scene.
import { catalogByCategory } from './furniture.js';
import { ftToStr, ftToIn, inToFt, radToDeg, degToRad } from './units.js';
import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);

export function initUI(app) {
  const { editor, shell } = app;
  buildPalette(editor, app.getDropPoint);
  bindInspector(editor);
  bindTools(editor);
  bindView(shell, app);
  bindLayout(editor);
  bindKeys(editor);
  $('palette-collapse').addEventListener('click', () => $('palette').classList.toggle('is-collapsed'));
}

// ── Palette ─────────────────────────────────────────────────────────────────
function buildPalette(editor, getDropPoint) {
  const body = $('palette-body');
  for (const [cat, items] of Object.entries(catalogByCategory())) {
    const wrap = document.createElement('div');
    wrap.className = 'cat';
    wrap.innerHTML = `<div class="cat__label">${cat}</div>`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button';
      b.title = `${it.label} · ${ftToStr(it.w)} × ${ftToStr(it.d)} × ${ftToStr(it.h)}`;
      b.innerHTML = `<span class="dot" style="background:${it.color}"></span>${it.label}`;
      b.addEventListener('click', () => editor.addItem(it.type, getDropPoint()));
      chips.appendChild(b);
    }
    wrap.appendChild(chips);
    body.appendChild(wrap);
  }
}

// ── Inspector (furniture / door / room / empty) ──────────────────────────────
function bindInspector(editor) {
  const empty = $('sel-empty'), furn = $('sel-furniture'), door = $('sel-door'), room = $('sel-room');
  const wIn = $('dim-w'), dIn = $('dim-d'), hIn = $('dim-h');
  const wFt = $('w-ft'), dFt = $('d-ft'), hFt = $('h-ft');
  const dwIn = $('door-w'), dhIn = $('door-h'), dwFt = $('door-w-ft'), dhFt = $('door-h-ft');
  const rot = $('rot'), color = $('color');
  const set = (el, v) => { if (document.activeElement !== el) el.value = v; };

  editor.onSelect = (info) => {
    empty.hidden = furn.hidden = door.hidden = room.hidden = true;
    if (!info) { empty.hidden = false; return; }

    if (info.kind === 'furniture') {
      furn.hidden = false;
      $('furn-name').textContent = info.label;
      set(wIn, ftToIn(info.w)); wFt.textContent = ` (${ftToStr(info.w)})`;
      set(dIn, ftToIn(info.d)); dFt.textContent = ` (${ftToStr(info.d)})`;
      set(hIn, ftToIn(info.h)); hFt.textContent = ` (${ftToStr(info.h)})`;
      set(rot, radToDeg(info.ry || 0));
      set(color, info.color);
    } else if (info.kind === 'door') {
      door.hidden = false;
      set(dwIn, ftToIn(info.w)); dwFt.textContent = ` (${ftToStr(info.w)})`;
      set(dhIn, ftToIn(info.h)); dhFt.textContent = ` (${ftToStr(info.h)})`;
    } else if (info.kind === 'room') {
      room.hidden = false;
      $('room-name').textContent = info.name;
      $('room-dims').textContent = `${ftToStr(info.w)} × ${ftToStr(info.d)}`;
      $('room-area').textContent = `≈ ${Math.round(info.w * info.d)} sq ft`;
    }
  };

  const onDim = () => {
    editor.setDimensions({
      w: inToFt(Math.max(1, +wIn.value || 1)),
      d: inToFt(Math.max(1, +dIn.value || 1)),
      h: inToFt(Math.max(1, +hIn.value || 1)),
    });
    wFt.textContent = ` (${ftToStr(inToFt(+wIn.value || 1))})`;
    dFt.textContent = ` (${ftToStr(inToFt(+dIn.value || 1))})`;
    hFt.textContent = ` (${ftToStr(inToFt(+hIn.value || 1))})`;
  };
  [wIn, dIn, hIn].forEach((el) => el.addEventListener('input', onDim));
  rot.addEventListener('input', () => editor.setRotation(degToRad(+rot.value || 0)));
  color.addEventListener('input', () => editor.setColor(color.value));
  $('furn-delete').addEventListener('click', () => editor.deleteSelected());

  const onDoor = () => {
    editor.setDoorSize({ w: inToFt(Math.max(12, +dwIn.value || 12)), h: inToFt(Math.max(12, +dhIn.value || 12)) });
    dwFt.textContent = ` (${ftToStr(inToFt(+dwIn.value || 12))})`;
    dhFt.textContent = ` (${ftToStr(inToFt(+dhIn.value || 12))})`;
  };
  [dwIn, dhIn].forEach((el) => el.addEventListener('input', onDoor));
  $('door-delete').addEventListener('click', () => editor.deleteSelected());
}

// ── Tools (add door) ──────────────────────────────────────────────────────────
function bindTools(editor) {
  const btn = $('add-door'), hint = $('door-hint');
  btn.addEventListener('click', () => editor.setAddDoorMode(!editor.addDoorMode));
  editor.onModeChange = (on) => { btn.classList.toggle('is-on', on); btn.textContent = on ? 'Click a wall…' : 'Add a door'; hint.hidden = !on; };
}

// ── View ──────────────────────────────────────────────────────────────────────
function bindView(shell, app) {
  $('wall-seg').querySelectorAll('.seg__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      shell.setWallMode(btn.dataset.mode);
      btn.parentElement.querySelectorAll('.seg__btn').forEach((b) => b.classList.remove('is-on'));
      btn.classList.add('is-on');
    });
  });
  $('toggle-dims').addEventListener('change', (e) => app.setDims(e.target.checked));
  $('toggle-labels').addEventListener('change', (e) => shell.setLabelsVisible(e.target.checked));
  $('toggle-grid').addEventListener('change', (e) => app.setGrid(e.target.checked));
  $('view-reset').addEventListener('click', () => app.resetView());
  $('view-top').addEventListener('click', () => app.topView());
}

// ── Layout ──────────────────────────────────────────────────────────────────
function bindLayout(editor) {
  $('layout-export').addEventListener('click', () => storage.exportFile(editor.getState()));
  const fileInput = $('import-file');
  $('layout-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { editor.loadState(await storage.importFile(file)); }
    catch { alert('That file could not be read as a layout.'); }
    fileInput.value = '';
  });
  $('layout-clear').addEventListener('click', () => {
    if (confirm('Remove all furniture and doors? The apartment shell stays.')) editor.clearAll();
  });
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function bindKeys(editor) {
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.deleteSelected(); }
    else if (e.key === 'Escape') { if (editor.addDoorMode) editor.setAddDoorMode(false); else editor.deselect(); }
  });
}
