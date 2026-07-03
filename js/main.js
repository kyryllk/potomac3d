import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildApartment, footprint } from './builder.js';
import { Editor } from './editor.js';
import { initUI } from './ui.js';
import * as storage from './storage.js';
import { BOUNDS } from './floorplan.js';
import { SUPABASE } from './config.js';

// ── Renderer ────────────────────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// ── Scene ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(
  matchMedia('(prefers-color-scheme: dark)').matches ? '#1c1e22' : '#eef1f4',
);

const fp = footprint();

// ── Camera + controls ───────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 3000);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.maxPolarAngle = Math.PI / 2 - 0.02;   // don't go below the floor
orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

function resetView() {
  orbit.target.set(fp.center.x, 2, fp.center.z);
  camera.position.set(fp.center.x + 22, 42, BOUNDS.maxZ + 20);
  orbit.update();
}
function topView() {
  orbit.target.set(fp.center.x, 0, fp.center.z);
  camera.position.set(fp.center.x, 78, fp.center.z + 0.01);
  orbit.update();
}
resetView();

// ── Lights ──────────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8f93, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(fp.center.x - 24, 60, fp.center.z - 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
const s = 40;
Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
sun.shadow.bias = -0.0004;
sun.target.position.copy(fp.center);
scene.add(sun);
scene.add(sun.target);

// ── Ground + grid ───────────────────────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(fp.center.x, -0.02, fp.center.z);
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(120, 120, 0xaab0b8, 0xccd1d7);
grid.position.set(fp.center.x, 0.005, fp.center.z);
grid.material.opacity = 0.5;
grid.material.transparent = true;
scene.add(grid);

// ── Apartment shell + editor ────────────────────────────────────────────────
const shell = buildApartment(scene);
const editor = new Editor(scene, camera, renderer, orbit, shell);

// on any change: save locally (debounced) and, if online, push to the shared room
let sync = null;
let saveTimer = null;
editor.onChange = (state) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { storage.save(state); sync?.push(state); }, 300);
};

// connection status pill in the titlebar
function setNetStatus(state, room) {
  const el = document.getElementById('netstatus');
  if (!el) return;
  const map = {
    connecting: ['is-connecting', `Connecting… · ${room || ''}`],
    live: ['is-live', `Live · ${room}`],
    error: ['is-error', 'Offline (sync error)'],
    offline: ['is-offline', 'Local only'],
  };
  const [cls, text] = map[state] || map.offline;
  el.className = `netstatus ${cls}`;
  el.textContent = text;
  el.hidden = false;
}

// ── UI ──────────────────────────────────────────────────────────────────────
initUI({
  editor,
  shell,
  resetView,
  topView,
  setGrid: (v) => { grid.visible = v; },
  setDims: (v) => { shell.setDimsVisible(v); editor.setDimsVisible(v); },
  getDropPoint: () => ({
    x: THREE.MathUtils.clamp(orbit.target.x, BOUNDS.minX + 1, BOUNDS.maxX - 1),
    z: THREE.MathUtils.clamp(orbit.target.z, BOUNDS.minZ + 1, BOUNDS.maxZ - 1),
  }),
});

// ── Resize + loop ─────────────────────────────────────────────────────────────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

renderer.setAnimationLoop(() => {
  orbit.update();
  renderer.render(scene, camera);
});

// ── Multiplayer (if configured) or local-only restore — non-blocking ──────────
(async () => {
  if (SUPABASE.url && SUPABASE.key) {
    try {
      const { Sync } = await import('./sync.js');
      sync = new Sync(editor, SUPABASE, setNetStatus);
      await sync.start();
    } catch (e) {
      console.warn('Multiplayer unavailable, falling back to local-only:', e);
      setNetStatus('error');
      const saved = storage.load();
      if (saved.items.length || saved.doors.length) editor.loadState(saved);
    }
  } else {
    const saved = storage.load();
    if (saved.items.length || saved.doors.length) editor.loadState(saved);
    setNetStatus('offline');
  }
})();
