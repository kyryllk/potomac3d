// The editor: owns scene state (furniture + doors), and handles
// select / drag-to-move / rotate / resize / delete, plus room picking.
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { catalogItem } from './furniture.js';
import { makeLabel } from './builder.js';
import { ftToStr } from './units.js';
import { ft, WALL_THICKNESS, ROOMS, BATH } from './floorplan.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let idSeq = 1;
const nextId = () => `f${(idSeq++).toString(36)}${Math.floor(performance.now()).toString(36)}`;
const snap = (v) => Math.round(v / 0.25) * 0.25;   // 3-inch grid

const furnLabel = (i) => `${ftToStr(i.w)} × ${ftToStr(i.d)} × ${ftToStr(i.h)}`;
const doorLabel = (d) => `${ftToStr(d.w)} w × ${ftToStr(d.h)} h`;

export class Editor {
  constructor(scene, camera, renderer, orbit, shell) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.orbit = orbit; this.shell = shell;

    this.items = [];                 // furniture data
    this.doors = [];                 // door data
    this.measures = [];              // measurement markers
    this.meshes = new Map();         // id → group (furniture + door panels + measures)
    this.selectedId = null;
    this.selectedKind = null;        // 'furniture' | 'door' | 'room' | null
    this.selectedRoom = null;
    this.dimsVisible = false;
    this.addDoorMode = false;
    this.addMeasureMode = false;
    this._pendingP1 = null;          // first click of a measurement in progress
    this.boundariesOn = false;       // keep furniture inside its room when dragging
    this.history = null;             // set by main.js; records undoable edits

    this.itemsGroup = new THREE.Group(); this.itemsGroup.name = 'furniture'; scene.add(this.itemsGroup);
    this.doorsGroup = new THREE.Group(); this.doorsGroup.name = 'doors'; scene.add(this.doorsGroup);
    this.measuresGroup = new THREE.Group(); this.measuresGroup.name = 'measures'; scene.add(this.measuresGroup);

    this.onChange = () => {};
    this.onSelect = () => {};
    this.onModeChange = () => {};    // notify UI when add-door mode flips
    this.onMeasureModeChange = () => {};

    this._ray = new THREE.Raycaster();
    this._floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._drag = null;
    this._down = null;

    this._setupGizmo();
    this._setupPointer();
  }

  // ── rotate ring (furniture only, always shown while selected) ──────────────
  _setupGizmo() {
    const t = new TransformControls(this.camera, this.renderer.domElement);
    t.setSize(0.85);
    t.setMode('rotate');
    t.showX = false; t.showZ = false; t.showY = true;
    t.setRotationSnap(THREE.MathUtils.degToRad(5));
    t.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      if (e.value) { this._rotBefore = this._snapshot([this.selectedId]); }
      else if (this._rotBefore) { this._record('rotate', [this.selectedId], this._rotBefore, this._snapshot([this.selectedId])); this._rotBefore = null; }
    });
    t.addEventListener('objectChange', () => {
      const item = this._byId(this.selectedId);
      if (item && this.selectedKind === 'furniture') {
        item.ry = this.meshes.get(item.id).rotation.y;
        this.onSelect(this._selInfo());
        this._changed();
      }
    });
    this.scene.add(t);
    this.gizmo = t;
  }

  // ── pointer: press object = grab/move, press ring = rotate, press room = info
  _setupPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this._onDown(e));
    el.addEventListener('pointermove', (e) => this._onMove(e));
    el.addEventListener('pointerup', (e) => this._onUp(e));
  }

  _ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  _floorPoint(e) {
    this._ray.setFromCamera(this._ndc(e), this.camera);
    const p = new THREE.Vector3();
    return this._ray.ray.intersectPlane(this._floorPlane, p) ? p : null;
  }
  _pick(objs) {
    const hits = this._ray.intersectObjects(objs, true);
    return hits.length ? hits[0] : null;
  }
  _pickObject(e) {
    this._ray.setFromCamera(this._ndc(e), this.camera);
    const hit = this._pick([...this.itemsGroup.children, ...this.doorsGroup.children, ...this.measuresGroup.children]);
    if (!hit) return null;
    const part = hit.object.name;
    let o = hit.object;
    while (o && o.userData.id === undefined) o = o.parent;
    return o ? { id: o.userData.id, kind: o.userData.kind, part } : null;
  }

  _onDown(e) {
    this._down = { x: e.clientX, y: e.clientY };
    if (this.addDoorMode || this.addMeasureMode || this.gizmo.axis != null) return;
    const hit = this._pickObject(e);
    if (!hit) return;
    this.select(hit.id);
    const fp = this._floorPoint(e);
    const g = this.meshes.get(hit.id);
    if (hit.kind === 'measure') {
      const m = this.measures.find((x) => x.id === hit.id);
      this._drag = {
        id: hit.id, kind: 'measure', part: hit.part, moved: false,
        before: this._snapshot([hit.id]),
        baseP1: { ...m.p1 }, baseP2: { ...m.p2 }, startFloor: fp ? { x: fp.x, z: fp.z } : null,
      };
    } else {
      this._drag = {
        id: hit.id, kind: hit.kind, moved: false,
        offX: g.position.x - (fp?.x ?? g.position.x), offZ: g.position.z - (fp?.z ?? g.position.z),
        before: this._snapshot([hit.id]),
        room: hit.kind === 'furniture' ? this._roomAt(g.position.x, g.position.z) : null,
      };
    }
    this.orbit.enabled = false;
  }

  _onMove(e) {
    if (this.addMeasureMode && this._pendingP1) { this._updatePreview(e); return; }
    if (!this._drag) return;
    if (Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > 3) this._drag.moved = true;
    if (!this._drag.moved) return;
    const fp = this._floorPoint(e);
    if (!fp) return;
    const g = this.meshes.get(this._drag.id);
    if (this._drag.kind === 'furniture') {
      const item = this._byId(this._drag.id);
      let nx = snap(fp.x + this._drag.offX), nz = snap(fp.z + this._drag.offZ);
      if (this.boundariesOn && this._drag.room) ({ x: nx, z: nz } = this._clampToRoom(nx, nz, item, this._drag.room));
      item.x = g.position.x = nx;
      item.z = g.position.z = nz;
    } else if (this._drag.kind === 'door') {
      const d = this.doors.find((x) => x.id === this._drag.id);
      d.along = d.ax === 'x' ? fp.x + this._drag.offX : fp.z + this._drag.offZ;
      this.shell.rebuildWalls(this.doors);
      this._syncDoorMesh(d);
    } else {
      const m = this.measures.find((x) => x.id === this._drag.id);
      if (this._drag.part === 'p1') m.p1 = { x: snap(fp.x), z: snap(fp.z) };
      else if (this._drag.part === 'p2') m.p2 = { x: snap(fp.x), z: snap(fp.z) };
      else {
        const dx = fp.x - this._drag.startFloor.x, dz = fp.z - this._drag.startFloor.z;
        m.p1 = { x: snap(this._drag.baseP1.x + dx), z: snap(this._drag.baseP1.z + dz) };
        m.p2 = { x: snap(this._drag.baseP2.x + dx), z: snap(this._drag.baseP2.z + dz) };
      }
      this._updateMeasure(g, m);
      this.onSelect(this._selInfo());
    }
  }

  _onUp(e) {
    const moved = this._down ? Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) : 99;
    if (this.addMeasureMode) {
      if (moved < 5) {
        const fp = this._floorPoint(e);
        if (fp) {
          const pt = { x: snap(fp.x), z: snap(fp.z) };
          if (!this._pendingP1) { this._pendingP1 = pt; this._showPreview(pt); }
          else { this._createMeasure(this._pendingP1, pt); this._pendingP1 = null; this._clearPreview(); this.setAddMeasureMode(false); }
        }
      }
      this._down = null; return;
    }
    if (this.addDoorMode) {
      this._ray.setFromCamera(this._ndc(e), this.camera);
      const hit = this._pick(this.shell.walls.children);
      if (hit) this._createDoor(hit);
      this.setAddDoorMode(false);
      this._down = null; return;
    }
    if (this._drag) {
      this.orbit.enabled = true;
      if (this._drag.moved) {
        this.onSelect(this._selInfo());
        this._changed();
        this._record('move', [this._drag.id], this._drag.before, this._snapshot([this._drag.id]));
      }
      this._drag = null; this._down = null; return;
    }
    if (moved < 5) {                                     // a click on empty space or a room
      this._ray.setFromCamera(this._ndc(e), this.camera);
      const hit = this._pick(this.shell.floors.children);
      if (hit) this.selectRoom(hit.object);
      else this.deselect();
    }
    this._down = null;
  }

  // ── mesh factories ─────────────────────────────────────────────────────────
  _buildFurniture(item) {
    const g = new THREE.Group();
    g.userData = { id: item.id, kind: 'furniture' };
    const geo = new THREE.BoxGeometry(item.w, item.h, item.d);
    const box = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.65, metalness: 0.05 }));
    box.name = 'box'; box.position.y = item.h / 2; box.castShadow = box.receiveShadow = true;
    g.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1c1c1e, transparent: true, opacity: 0.28 }));
    edges.name = 'edges'; edges.position.y = item.h / 2;
    g.add(edges);
    const label = makeLabel(item.label, { sub: furnLabel(item), size: 1.15 });
    label.name = 'label'; label.position.set(0, item.h + 1.1, 0); label.visible = this.dimsVisible;
    g.add(label);
    g.position.set(item.x, 0, item.z); g.rotation.y = item.ry || 0;
    return g;
  }

  _buildDoor(d) {
    const g = new THREE.Group();
    g.userData = { id: d.id, kind: 'door' };
    const th = WALL_THICKNESS + 0.06;
    const geo = d.ax === 'x' ? new THREE.BoxGeometry(d.w, d.h, th) : new THREE.BoxGeometry(th, d.h, d.w);
    const panel = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b5793f', roughness: 0.6, transparent: true, opacity: 0.55 }));
    panel.name = 'box'; panel.position.y = d.h / 2; panel.castShadow = true;
    g.add(panel);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1c1c1e, transparent: true, opacity: 0.4 }));
    edges.name = 'edges'; edges.position.y = d.h / 2;
    g.add(edges);
    const label = makeLabel('Door', { sub: doorLabel(d), size: 1.0 });
    label.name = 'label'; label.position.set(0, d.h + 1.0, 0); label.visible = this.dimsVisible;
    g.add(label);
    this._placeDoor(g, d);
    return g;
  }

  _placeDoor(g, d) {
    g.position.set(d.ax === 'x' ? d.along : d.cross, 0, d.ax === 'x' ? d.cross : d.along);
  }
  _syncDoorMesh(d) { this._placeDoor(this.meshes.get(d.id), d); }

  // ── measurement markers ─────────────────────────────────────────────────────
  _buildMeasure(m) {
    const g = new THREE.Group();
    g.userData = { id: m.id, kind: 'measure' };
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5871f, toneMapped: false });
    g.userData.mat = mat;
    const line = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.12), mat);
    line.name = 'body'; line.position.y = 0.1;
    g.add(line);
    for (const name of ['p1', 'p2']) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 16), mat);
      h.name = name; h.position.y = 0.1;
      g.add(h);
    }
    this._updateMeasure(g, m);
    return g;
  }

  _updateMeasure(g, m) {
    const dx = m.p2.x - m.p1.x, dz = m.p2.z - m.p1.z;
    const len = Math.hypot(dx, dz);
    const mx = (m.p1.x + m.p2.x) / 2, mz = (m.p1.z + m.p2.z) / 2;
    const line = g.getObjectByName('body');
    line.geometry.dispose();
    line.geometry = new THREE.BoxGeometry(Math.max(len, 0.01), 0.03, 0.12);
    line.position.set(mx, 0.1, mz);
    line.rotation.y = Math.atan2(-dz, dx);
    g.getObjectByName('p1').position.set(m.p1.x, 0.1, m.p1.z);
    g.getObjectByName('p2').position.set(m.p2.x, 0.1, m.p2.z);
    const old = g.getObjectByName('label');
    if (old) { old.material.map.dispose(); old.material.dispose(); g.remove(old); }
    const label = makeLabel(ftToStr(len), { size: 1.3, color: '#f5871f' });
    label.name = 'label'; label.position.set(mx, 0.7, mz);
    g.add(label);
  }

  _createMeasure(p1, p2) {
    const m = { id: nextId(), kind: 'measure', p1: { ...p1 }, p2: { ...p2 } };
    this.measures.push(m);
    const g = this._buildMeasure(m);
    this.measuresGroup.add(g); this.meshes.set(m.id, g);
    this.select(m.id);
    this._changed();
    this._record('add', [m.id], [], this._snapshot([m.id]));
  }

  setAddMeasureMode(on) {
    this.addMeasureMode = on;
    if (!on) { this._pendingP1 = null; this._clearPreview(); }
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
    this.onMeasureModeChange(on);
  }

  _showPreview(pt) {
    this._clearPreview();
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5871f, toneMapped: false, transparent: true, opacity: 0.55 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.1), mat);
    line.position.set(pt.x, 0.1, pt.z);
    this._preview = { line, mat };
    this.measuresGroup.add(line);
  }
  _updatePreview(e) {
    if (!this._preview) return;
    const fp = this._floorPoint(e);
    if (!fp) return;
    const p1 = this._pendingP1, dx = fp.x - p1.x, dz = fp.z - p1.z, len = Math.hypot(dx, dz);
    const line = this._preview.line;
    line.geometry.dispose();
    line.geometry = new THREE.BoxGeometry(Math.max(len, 0.01), 0.03, 0.1);
    line.position.set((p1.x + fp.x) / 2, 0.1, (p1.z + fp.z) / 2);
    line.rotation.y = Math.atan2(-dz, dx);
  }
  _clearPreview() {
    if (this._preview) { this.measuresGroup.remove(this._preview.line); this._preview.line.geometry.dispose(); this._preview.mat.dispose(); this._preview = null; }
  }

  _rebuildBox(g, w, h, dep) {   // furniture geometry after resize
    const box = g.getObjectByName('box'), edges = g.getObjectByName('edges');
    box.geometry.dispose(); edges.geometry.dispose();
    const geo = new THREE.BoxGeometry(w, h, dep);
    box.geometry = geo; edges.geometry = new THREE.EdgesGeometry(geo);
    box.position.y = edges.position.y = h / 2;
    g.getObjectByName('label').position.y = h + 1.1;
  }

  _relabel(g, title, sub) {
    const old = g.getObjectByName('label');
    const wasVisible = old.visible, y = old.position.y;
    old.material.map.dispose(); old.material.dispose();
    g.remove(old);
    const label = makeLabel(title, { sub, size: g.userData.kind === 'door' ? 1.0 : 1.15 });
    label.name = 'label'; label.position.y = y; label.visible = wasVisible;
    g.add(label);
  }

  // ── public API ──────────────────────────────────────────────────────────────
  addItem(type, at = { x: 10, z: 20 }) {
    const c = catalogItem(type);
    if (!c) return;
    const item = { id: nextId(), kind: 'furniture', type: c.type, label: c.label, x: at.x, z: at.z, ry: 0, w: c.w, d: c.d, h: c.h, color: c.color };
    this.items.push(item);
    const g = this._buildFurniture(item);
    this.itemsGroup.add(g); this.meshes.set(item.id, g);
    this.select(item.id);
    this._changed();
    this._record('add', [item.id], [], [{ ...item }]);
    return item;
  }

  setAddDoorMode(on) {
    this.addDoorMode = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
    this.onModeChange(on);
  }

  _createDoor(hit) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const ax = Math.abs(n.z) >= Math.abs(n.x) ? 'x' : 'z';
    const door = {
      id: nextId(), kind: 'door', ax,
      cross: ax === 'x' ? hit.object.position.z : hit.object.position.x,
      along: ax === 'x' ? hit.point.x : hit.point.z,
      w: ft(3), h: ft(6, 8),
    };
    this.doors.push(door);
    this.shell.rebuildWalls(this.doors);
    const g = this._buildDoor(door);
    this.doorsGroup.add(g); this.meshes.set(door.id, g);
    this.select(door.id);
    this._changed();
    this._record('add', [door.id], [], [{ ...door }]);
  }

  select(id) {
    if (this.selectedId === id && this.selectedKind !== 'room') return;
    this.deselect();
    const g = this.meshes.get(id);
    if (!g) return;
    this.selectedId = id;
    this.selectedKind = g.userData.kind;
    if (this.selectedKind === 'measure') {
      g.userData.mat.color.set(0x2b6cff);
    } else {
      g.getObjectByName('label').visible = true;
      const edges = g.getObjectByName('edges');
      edges.material.color.set('#2b6cff'); edges.material.opacity = 0.95;
      if (this.selectedKind === 'furniture') this.gizmo.attach(g);
    }
    this.onSelect(this._selInfo());
  }

  selectRoom(mesh) {
    this.deselect();
    this.selectedKind = 'room';
    this.selectedRoom = mesh.userData.room;
    this.shell.highlightRoom(mesh);
    this.onSelect(this._selInfo());
  }

  deselect() {
    if (this.selectedId) {
      const g = this.meshes.get(this.selectedId);
      if (g) {
        if (g.userData.kind === 'measure') {
          g.userData.mat.color.set(0xf5871f);
        } else {
          g.getObjectByName('label').visible = this.dimsVisible;
          const edges = g.getObjectByName('edges');
          edges.material.color.set(0x1c1c1e); edges.material.opacity = g.userData.kind === 'door' ? 0.4 : 0.28;
        }
      }
    }
    this.shell.highlightRoom(null);
    this.gizmo.detach();
    this.selectedId = null; this.selectedKind = null; this.selectedRoom = null;
    this.onSelect(null);
  }

  deleteSelected() {
    if (!['furniture', 'door', 'measure'].includes(this.selectedKind)) return;
    const id = this.selectedId;
    const before = this._snapshot([id]);
    this._removeObject(id);              // disposes mesh, updates state, deselects, rebuilds walls
    this._changed();
    this._record('delete', [id], before, []);
  }

  setDimensions({ w, d, h }) {
    const item = this._byId(this.selectedId);
    if (!item || this.selectedKind !== 'furniture') return;
    const before = this._snapshot([item.id]);
    if (w != null) item.w = w; if (d != null) item.d = d; if (h != null) item.h = h;
    const g = this.meshes.get(item.id);
    this._rebuildBox(g, item.w, item.h, item.d);
    this._relabel(g, item.label, furnLabel(item));
    this._changed();
    this._record('size', [item.id], before, this._snapshot([item.id]), true);
  }

  setDoorSize({ w, h }) {
    const dr = this.doors.find((x) => x.id === this.selectedId);
    if (!dr) return;
    const before = this._snapshot([dr.id]);
    if (w != null) dr.w = w; if (h != null) dr.h = h;
    this.shell.rebuildWalls(this.doors);
    const g = this.meshes.get(dr.id);
    const th = WALL_THICKNESS + 0.06;
    this._rebuildDoorGeo(g, dr, th);
    this._relabel(g, 'Door', doorLabel(dr));
    this._changed();
    this._record('size', [dr.id], before, this._snapshot([dr.id]), true);
  }
  _rebuildDoorGeo(g, d, th) {
    const box = g.getObjectByName('box'), edges = g.getObjectByName('edges');
    box.geometry.dispose(); edges.geometry.dispose();
    const geo = d.ax === 'x' ? new THREE.BoxGeometry(d.w, d.h, th) : new THREE.BoxGeometry(th, d.h, d.w);
    box.geometry = geo; edges.geometry = new THREE.EdgesGeometry(geo);
    box.position.y = edges.position.y = d.h / 2;
    g.getObjectByName('label').position.y = d.h + 1.0;
  }

  setRotation(ry) {
    const item = this._byId(this.selectedId);
    if (!item || this.selectedKind !== 'furniture') return;
    const before = this._snapshot([item.id]);
    item.ry = ry; this.meshes.get(item.id).rotation.y = ry;
    this._changed();
    this._record('rotate', [item.id], before, this._snapshot([item.id]), true);
  }
  setColor(hex) {
    const item = this._byId(this.selectedId);
    if (!item || this.selectedKind !== 'furniture') return;
    const before = this._snapshot([item.id]);
    item.color = hex; this.meshes.get(item.id).getObjectByName('box').material.color.set(hex);
    this._changed();
    this._record('color', [item.id], before, this._snapshot([item.id]), true);
  }

  setBoundaries(on) { this.boundariesOn = on; }
  undo() { this.history?.undo(); }
  redo() { this.history?.redo(); }

  setDimsVisible(v) {
    this.dimsVisible = v;
    for (const [id, g] of this.meshes) {
      if (g.userData.kind === 'measure') continue;   // measure labels always show their distance
      g.getObjectByName('label').visible = v || id === this.selectedId;
    }
  }

  clearAll() {
    this.deselect();
    for (const g of this.meshes.values()) {
      this._groupFor(g.userData.kind).remove(g);
      g.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
    }
    this.meshes.clear(); this.items = []; this.doors = []; this.measures = [];
    this.shell.rebuildWalls([]);
    this.history?.clear();
    this._changed();
  }

  _groupFor(kind) { return kind === 'door' ? this.doorsGroup : kind === 'measure' ? this.measuresGroup : this.itemsGroup; }

  loadState(state) {
    this.clearAll();
    for (const raw of state?.items || []) {
      const item = { ...raw, kind: 'furniture', id: raw.id || nextId(), ry: raw.ry || 0 };
      this.items.push(item);
      const g = this._buildFurniture(item);
      this.itemsGroup.add(g); this.meshes.set(item.id, g);
    }
    for (const raw of state?.doors || []) {
      const d = { ...raw, kind: 'door', id: raw.id || nextId() };
      this.doors.push(d);
      const g = this._buildDoor(d);
      this.doorsGroup.add(g); this.meshes.set(d.id, g);
    }
    for (const raw of state?.measures || []) {
      const m = { id: raw.id || nextId(), kind: 'measure', p1: { ...raw.p1 }, p2: { ...raw.p2 } };
      this.measures.push(m);
      const g = this._buildMeasure(m);
      this.measuresGroup.add(g); this.meshes.set(m.id, g);
    }
    this.shell.rebuildWalls(this.doors);
    this._changed();
  }

  // ── low-level primitives (no onChange, no history) ──────────────────────────
  _upsertObject(o) {   // create-or-update one furniture/door/measure from plain data
    const g = this.meshes.get(o.id);
    if (o.kind === 'measure') {
      const m = { id: o.id, kind: 'measure', p1: { ...o.p1 }, p2: { ...o.p2 } };
      if (g) { const cur = this.measures.find((x) => x.id === o.id); cur.p1 = m.p1; cur.p2 = m.p2; this._updateMeasure(g, m); }
      else { this.measures.push(m); const ng = this._buildMeasure(m); this.measuresGroup.add(ng); this.meshes.set(o.id, ng); }
      return;
    }
    if (o.kind === 'furniture') {
      const item = { ...o, kind: 'furniture', ry: o.ry || 0 };
      if (g) {
        Object.assign(this.items.find((i) => i.id === o.id), item);
        g.position.set(item.x, 0, item.z); g.rotation.y = item.ry;
        this._rebuildBox(g, item.w, item.h, item.d);
        g.getObjectByName('box').material.color.set(item.color);
        this._relabel(g, item.label, furnLabel(item));
      } else {
        this.items.push(item);
        const ng = this._buildFurniture(item);
        this.itemsGroup.add(ng); this.meshes.set(o.id, ng);
      }
    } else {
      const d = { ...o, kind: 'door' };
      if (g) Object.assign(this.doors.find((x) => x.id === o.id), d);
      else { this.doors.push(d); const ng = this._buildDoor(d); this.doorsGroup.add(ng); this.meshes.set(o.id, ng); }
      this.shell.rebuildWalls(this.doors);
      const gg = this.meshes.get(o.id);
      this._rebuildDoorGeo(gg, d, WALL_THICKNESS + 0.06);
      this._placeDoor(gg, d);
      this._relabel(gg, 'Door', doorLabel(d));
    }
  }

  _removeObject(id) {
    const g = this.meshes.get(id);
    if (!g) return;
    const kind = g.userData.kind;
    if (this.selectedId === id) this.deselect();
    this._groupFor(kind).remove(g);
    g.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
    this.meshes.delete(id);
    if (kind === 'door') { this.doors = this.doors.filter((x) => x.id !== id); this.shell.rebuildWalls(this.doors); }
    else if (kind === 'measure') this.measures = this.measures.filter((x) => x.id !== id);
    else this.items = this.items.filter((i) => i.id !== id);
  }

  // ── remote apply (multiplayer) — no onChange, so it never echoes back ────────
  applyRemote(id, kind, data) { this._upsertObject({ ...data, id, kind }); }
  removeRemote(id) { this._removeObject(id); }

  // ── history support ─────────────────────────────────────────────────────────
  _snapshot(ids) {
    return ids.map((id) => this._byId(id)).filter(Boolean)
      .map((o) => o.kind === 'measure' ? { ...o, p1: { ...o.p1 }, p2: { ...o.p2 } } : { ...o });
  }
  _record(op, ids, before, after, coalesce = false) {
    this.history?.record({ op, ids, before, after, coalesce });
  }
  // restore the given ids to `objs` (used by undo/redo). Pushes to sync/save.
  _restore(objs, ids) {
    for (const id of ids) {
      const t = objs.find((o) => o.id === id);
      if (t) this._upsertObject(t); else this._removeObject(id);
    }
    const first = ids[0];
    if (objs.find((o) => o.id === first)) this.select(first); else this.deselect();
    this._changed();
  }

  // ── boundaries ──────────────────────────────────────────────────────────────
  _roomAt(x, z) {
    return [...ROOMS, BATH].find((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) || null;
  }
  _clampToRoom(x, z, item, room) {
    const c = Math.abs(Math.cos(item.ry || 0)), s = Math.abs(Math.sin(item.ry || 0));
    const hx = (item.w / 2) * c + (item.d / 2) * s;     // rotated footprint half-extents
    const hz = (item.w / 2) * s + (item.d / 2) * c;
    // The room rect is the wall CENTERLINE; walls are WALL_THICKNESS thick centered
    // on it. Inset by half the wall (plus a hair to avoid z-fighting) so a piece
    // stops flush against the inner wall face, not overlapping into the wall.
    const inset = WALL_THICKNESS / 2 + 0.02;
    const minX = room.x + inset + hx, maxX = room.x + room.w - inset - hx;
    const minZ = room.z + inset + hz, maxZ = room.z + room.d - inset - hz;
    return {
      x: minX <= maxX ? clamp(x, minX, maxX) : room.x + room.w / 2,
      z: minZ <= maxZ ? clamp(z, minZ, maxZ) : room.z + room.d / 2,
    };
  }

  getState() {
    return {
      items: this.items.map((i) => ({ ...i })),
      doors: this.doors.map((d) => ({ ...d })),
      measures: this.measures.map((m) => ({ ...m, p1: { ...m.p1 }, p2: { ...m.p2 } })),
    };
  }

  _byId(id) {
    return this.items.find((i) => i.id === id) || this.doors.find((d) => d.id === id) || this.measures.find((m) => m.id === id) || null;
  }
  _selInfo() {
    if (this.selectedKind === 'room') return { kind: 'room', ...this.selectedRoom };
    const o = this._byId(this.selectedId);
    if (!o) return null;
    if (o.kind === 'measure') return { kind: 'measure', dist: Math.hypot(o.p2.x - o.p1.x, o.p2.z - o.p1.z) };
    return { ...o };
  }
  _changed() { this.onChange(this.getState()); }
}
