// Builds the apartment shell (floors, walls, labels) from floorplan.js data.
// Walls are rebuilt on demand so door openings can be cut into them.
import * as THREE from 'three';
import {
  ROOMS, BATH, DECK, BOUNDS,
  WALL_THICKNESS, WALL_HEIGHT,
} from './floorplan.js';
import { ftToStr } from './units.js';

const FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif';

// ── text label as a camera-facing sprite (optional second line) ──────────────
export function makeLabel(title, { sub = '', size = 1.3, color = '#1c1c1e' } = {}) {
  const S = 2;                       // supersample for crispness
  const tF = 54 * S, sF = 40 * S, pad = 18 * S, gap = sub ? 8 * S : 0;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `600 ${tF}px ${FONT}`;
  const tw = ctx.measureText(title).width;
  let sw = 0;
  if (sub) { ctx.font = `500 ${sF}px ${FONT}`; sw = ctx.measureText(sub).width; }
  c.width = Math.ceil(Math.max(tw, sw) + pad * 2);
  c.height = Math.ceil(tF + (sub ? sF + gap : 0) + pad * 2);

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `600 ${tF}px ${FONT}`; ctx.fillStyle = color;
  ctx.fillText(title, c.width / 2, pad);
  if (sub) { ctx.font = `500 ${sF}px ${FONT}`; ctx.fillStyle = '#6b6f76'; ctx.fillText(sub, c.width / 2, pad + tF + gap); }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((c.width / c.height) * size, size, 1);
  sprite.renderOrder = 999;
  return sprite;
}

// ── a dimension annotation drawn flat on the floor along a wall ──────────────
// ax 'x' → horizontal line at z=fixed from x=a to x=b; ax 'z' → vertical at x=fixed.
export function makeDimAnno(ax, fixed, a, b, text) {
  const g = new THREE.Group();
  const y = 0.06, lw = 0.09, tick = 0.6;
  const mat = new THREE.MeshBasicMaterial({ color: 0x2b6cff, toneMapped: false });
  const box = (sx, sz, px, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.02, sz), mat);
    m.position.set(px, y, pz);
    return m;
  };
  const mid = (a + b) / 2, len = b - a;
  if (ax === 'x') {
    g.add(box(len, lw, mid, fixed));
    g.add(box(lw, tick, a, fixed));
    g.add(box(lw, tick, b, fixed));
  } else {
    g.add(box(lw, len, fixed, mid));
    g.add(box(tick, lw, fixed, a));
    g.add(box(tick, lw, fixed, b));
  }
  const label = makeLabel(text, { size: 1.5, color: '#2b6cff' });
  label.position.set(ax === 'x' ? mid : fixed, 0.55, ax === 'x' ? fixed : mid);
  g.add(label);
  return g;
}

// ── one wall box between from→to along an axis, spanning yBottom→yTop ─────────
function wallBox(axis, fixed, from, to, yBottom, yTop, mat) {
  const len = to - from, h = yTop - yBottom;
  if (len <= 0.001 || h <= 0.001) return null;
  const geo = axis === 'x'
    ? new THREE.BoxGeometry(len, h, WALL_THICKNESS)
    : new THREE.BoxGeometry(WALL_THICKNESS, h, len);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(
    axis === 'x' ? (from + to) / 2 : fixed,
    (yBottom + yTop) / 2,
    axis === 'x' ? fixed : (from + to) / 2,
  );
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// unique edges of all rooms, de-duplicated so shared walls draw once
function collectEdges(rooms) {
  const edges = new Map();
  const add = (ax, az, bx, bz) => {
    const key = ax < bx || (ax === bx && az <= bz)
      ? `${ax.toFixed(2)},${az.toFixed(2)}|${bx.toFixed(2)},${bz.toFixed(2)}`
      : `${bx.toFixed(2)},${bz.toFixed(2)}|${ax.toFixed(2)},${az.toFixed(2)}`;
    edges.set(key, [ax, az, bx, bz]);
  };
  for (const r of rooms) {
    const x2 = r.x + r.w, z2 = r.z + r.d;
    add(r.x, r.z, x2, r.z); add(r.x, z2, x2, z2);
    add(r.x, r.z, r.x, z2); add(x2, r.z, x2, z2);
  }
  return [...edges.values()];
}

// ── main ─────────────────────────────────────────────────────────────────────
export function buildApartment(scene) {
  const group = new THREE.Group();
  group.name = 'apartment';

  const floorMat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, metalness: 0 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.9, metalness: 0, side: THREE.DoubleSide });

  // floors (rooms + bath + deck), each pickable and carrying its dimensions
  const floors = new THREE.Group();
  floors.name = 'floors';
  const floorList = [
    ...ROOMS.map((r) => ({ r, y: 0.04, t: 0.08 })),
    { r: BATH, y: 0.04, t: 0.08 },
    { r: DECK, y: 0.08, t: 0.16 },
  ];
  for (const { r, y, t } of floorList) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.w, t, r.d), floorMat(r.color || '#e7e2d8'));
    mesh.position.set(r.x + r.w / 2, y, r.z + r.d / 2);
    mesh.receiveShadow = true;
    mesh.userData.room = r;
    floors.add(mesh);
  }
  group.add(floors);

  // walls — rebuildable, so doors can cut openings
  const edges = collectEdges([...ROOMS, BATH]);
  const walls = new THREE.Group();
  walls.name = 'walls';
  group.add(walls);

  let wallScale = 1, wallsHidden = false;
  const EPS = 0.06;

  function rebuildWalls(doors = []) {
    for (const m of walls.children) m.geometry.dispose();
    walls.clear();
    for (const [ax, az, bx, bz] of edges) {
      const horizontal = Math.abs(az - bz) < 1e-3;
      const axis = horizontal ? 'x' : 'z';
      const fixed = horizontal ? az : ax;
      const from = horizontal ? Math.min(ax, bx) : Math.min(az, bz);
      const to = horizontal ? Math.max(ax, bx) : Math.max(az, bz);
      const cuts = doors
        .filter((d) => d.ax === axis && Math.abs(d.cross - fixed) < EPS && d.along > from - 0.01 && d.along < to + 0.01)
        .map((d) => ({ a: Math.max(from, d.along - d.w / 2), b: Math.min(to, d.along + d.w / 2), h: d.h }))
        .sort((p, q) => p.a - q.a);
      let cursor = from;
      for (const o of cuts) {
        if (o.a > cursor) walls.add(wallBox(axis, fixed, cursor, o.a, 0, WALL_HEIGHT, wallMat));
        if (o.h < WALL_HEIGHT) walls.add(wallBox(axis, fixed, o.a, o.b, o.h, WALL_HEIGHT, wallMat)); // header
        cursor = Math.max(cursor, o.b);
      }
      if (cursor < to) walls.add(wallBox(axis, fixed, cursor, to, 0, WALL_HEIGHT, wallMat));
    }
    walls.children.forEach((m) => m && (m.castShadow = m.receiveShadow = true));
    walls.scale.y = wallScale;
    walls.visible = !wallsHidden;
  }
  rebuildWalls([]);

  // room name labels + dimension labels (two toggleable groups)
  const nameLabels = new THREE.Group(); nameLabels.name = 'nameLabels';
  const dimLabels = new THREE.Group(); dimLabels.name = 'dimLabels';
  dimLabels.visible = false;
  for (const r of [...ROOMS, BATH, DECK]) {
    const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
    const nl = makeLabel(r.name, { size: 2.1 });
    nl.position.set(cx, 1.3, cz);
    nameLabels.add(nl);
    const wi = WALL_THICKNESS / 2, off = 0.9;
    dimLabels.add(makeDimAnno('x', r.z + off, r.x + wi, r.x + r.w - wi, ftToStr(r.w)));   // width along top wall
    dimLabels.add(makeDimAnno('z', r.x + off, r.z + wi, r.z + r.d - wi, ftToStr(r.d)));   // depth along left wall
  }
  group.add(nameLabels);
  group.add(dimLabels);

  scene.add(group);

  // room highlight (on click)
  let hlMesh = null;
  function highlightRoom(mesh) {
    if (hlMesh && hlMesh.material) hlMesh.material.emissiveIntensity = 0;
    hlMesh = mesh;
    if (mesh) { mesh.material.emissive = new THREE.Color('#2b6cff'); mesh.material.emissiveIntensity = 0.22; }
  }

  return {
    group, walls, floors, rebuildWalls, highlightRoom,
    setWallMode(mode) {
      wallsHidden = mode === 'hidden';
      wallScale = mode === 'quarter' ? 0.25 : mode === 'half' ? 0.5 : 1;
      walls.visible = !wallsHidden;
      walls.scale.y = wallScale;
    },
    setLabelsVisible(v) { nameLabels.visible = v; },
    setDimsVisible(v) { dimLabels.visible = v; },
  };
}

export function footprint() {
  return {
    center: new THREE.Vector3((BOUNDS.minX + BOUNDS.maxX) / 2, 0, (BOUNDS.minZ + BOUNDS.maxZ) / 2),
    width: BOUNDS.maxX - BOUNDS.minX,
    depth: BOUNDS.maxZ - BOUNDS.minZ,
  };
}
