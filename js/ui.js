// Wires the DOM chrome to the editor and scene.
import { catalogByCategory } from './furniture.js';
import { ftToStr, ftToIn, inToFt, radToDeg, degToRad } from './units.js';
import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initUI(app) {
  const { editor, shell, history } = app;
  buildPalette(editor, app.getDropPoint);
  bindInspector(editor);
  bindTools(editor);
  bindView(shell, app);
  bindLayout(editor);
  bindEdit(editor, history);
  bindKeys(editor);
  const layouts = bindLayouts();
  $('palette-collapse').addEventListener('click', () => $('palette').classList.toggle('is-collapsed'));
  return layouts;   // { updateLayouts, enableLayouts }
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
  $('toggle-bounds').addEventListener('change', (e) => app.setBoundaries(e.target.checked));
  $('toggle-dims').addEventListener('change', (e) => app.setDims(e.target.checked));
  $('toggle-labels').addEventListener('change', (e) => shell.setLabelsVisible(e.target.checked));
  $('toggle-grid').addEventListener('change', (e) => app.setGrid(e.target.checked));
  $('view-reset').addEventListener('click', () => app.resetView());
  $('view-top').addEventListener('click', () => app.topView());
}

// ── Layout (save / export / import / clear) ─────────────────────────────────
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

// ── Undo / redo ──────────────────────────────────────────────────────────────
function bindEdit(editor, history) {
  const undoBtn = $('undo'), redoBtn = $('redo');
  const refresh = () => { undoBtn.disabled = !history.canUndo(); redoBtn.disabled = !history.canRedo(); };
  history.onChange = refresh;
  undoBtn.addEventListener('click', () => editor.undo());
  redoBtn.addEventListener('click', () => editor.redo());
  refresh();
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function bindKeys(editor) {
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); editor.redo(); return; }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.deleteSelected(); }
    else if (e.key === 'Escape') { if (editor.addDoorMode) editor.setAddDoorMode(false); else editor.deselect(); }
  });
}

// ── Layouts (online only) ────────────────────────────────────────────────────
function bindLayouts() {
  let api = null, layouts = [], current = null, mode = null;

  const btn = $('layout-btn'), menu = $('layout-menu');
  const closeMenu = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const openMenu = () => { renderMenu(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); };

  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) closeMenu(); });

  function item(html, onClick, disabled = false) {
    const b = document.createElement('button');
    b.className = 'menu-item' + (disabled ? ' is-disabled' : '');
    b.innerHTML = html;
    if (!disabled) b.addEventListener('click', onClick);
    return b;
  }

  function renderMenu() {
    menu.innerHTML = '';
    for (const l of layouts) {
      menu.appendChild(item(
        `<span class="mi-check">${l.slug === current ? '✓' : ''}</span><span class="mi-name">${esc(l.name)}</span>`,
        () => { closeMenu(); if (l.slug !== current) api.switch(l.slug); },
      ));
    }
    const div = document.createElement('div'); div.className = 'menu-div'; menu.appendChild(div);
    menu.appendChild(item('<span class="mi-ic">＋</span> New layout', () => { closeMenu(); openModal('new-empty'); }));
    menu.appendChild(item('<span class="mi-ic">⧉</span> New from current…', () => { closeMenu(); openModal('new-from-current'); }));
    menu.appendChild(item('<span class="mi-ic">⧉</span> Duplicate', () => { closeMenu(); openModal('duplicate'); }));
    menu.appendChild(item('<span class="mi-ic">✎</span> Rename…', () => { closeMenu(); openModal('rename'); }));
    menu.appendChild(item('<span class="mi-ic">🗑</span> Delete', deleteCurrent, layouts.length <= 1));
  }

  async function deleteCurrent() {
    closeMenu();
    if (layouts.length <= 1) return;
    const cur = layouts.find((l) => l.slug === current);
    if (!confirm(`Delete “${cur?.name || 'this layout'}”? Its furniture is removed for everyone.`)) return;
    const target = layouts.find((l) => l.slug !== current);
    await api.remove(current);
    if (target) await api.switch(target.slug);
  }

  // modal
  const scrim = $('pick-scrim'), nameInput = $('pick-name'), list = $('pick-list'), sub = $('pick-sub');
  const closeModal = () => { scrim.hidden = true; mode = null; };

  function openModal(m) {
    mode = m;
    const cur = layouts.find((l) => l.slug === current);
    const titles = { 'new-empty': 'New layout', 'new-from-current': 'New layout from current', duplicate: 'Duplicate layout', rename: 'Rename layout' };
    $('pick-title').textContent = titles[m];
    nameInput.value = m === 'rename' ? (cur?.name || '') : m === 'duplicate' ? `${cur?.name || 'Layout'} copy` : '';
    if (m === 'new-from-current') {
      sub.hidden = false; list.hidden = false; list.innerHTML = '';
      const furn = api.currentFurniture();
      if (!furn.length) list.innerHTML = '<div class="pick-empty">No furniture in this layout yet.</div>';
      for (const f of furn) {
        const row = document.createElement('label');
        row.className = 'pick-row';
        row.innerHTML = `<input type="checkbox" checked data-id="${esc(f.id)}"><span>${esc(f.label)}</span>`;
        list.appendChild(row);
      }
    } else { sub.hidden = true; list.hidden = true; list.innerHTML = ''; }
    scrim.hidden = false;
    nameInput.focus(); nameInput.select();
  }

  async function createFromModal() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    if (mode === 'rename') { await api.rename(current, name); closeModal(); return; }
    let objs = null;
    if (mode === 'new-from-current') {
      const ids = [...list.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.dataset.id);
      objs = api.objectsByIds(ids);
    } else if (mode === 'duplicate') {
      objs = api.allObjects();
    }
    const slug = await api.create(name, objs);
    closeModal();
    if (slug) await api.switch(slug);
  }

  $('pick-create').addEventListener('click', createFromModal);
  $('pick-cancel').addEventListener('click', closeModal);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); createFromModal(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
  });

  return {
    enableLayouts(a) { api = a; $('layoutbar').hidden = false; },
    updateLayouts(list_, current_) {
      layouts = list_; current = current_;
      $('layout-name').textContent = layouts.find((l) => l.slug === current)?.name || 'Layout';
      if (!menu.hidden) renderMenu();
    },
  };
}
