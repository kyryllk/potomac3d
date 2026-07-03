// Multiplayer sync over Supabase. One row per object in table `objects`.
// The editor's scene is the source of truth locally; this mirrors it to the DB
// and applies other people's changes back, keyed by a shared `room`.
//
// Layouts reuse the same table: each layout is a `room`, and the list of layouts
// lives as `kind:'layout'` rows in a reserved registry room (REGISTRY). No extra
// table needed. Switching layouts = switching the active room.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DEFAULT_ROOM } from './config.js';

const REGISTRY = '__layouts__';
const r = (n, p = 2) => Number(n).toFixed(p);
let copySeq = 0;
const newObjId = () => `c${Date.now().toString(36)}${(copySeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const newSlug = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// order-stable signature so a round-trip through the DB compares equal (no echo loop)
function sig(o) {
  return o.kind === 'door'
    ? `d|${o.id}|${o.ax}|${r(o.cross)}|${r(o.along)}|${r(o.w)}|${r(o.h)}`
    : `f|${o.id}|${o.type}|${r(o.x)}|${r(o.z)}|${r(o.ry, 3)}|${r(o.w)}|${r(o.d)}|${r(o.h)}|${o.color}`;
}

// the fields stored in the row's `data` column (everything but id/kind/room)
function payload(o) {
  if (o.kind === 'door') return { ax: o.ax, cross: o.cross, along: o.along, w: o.w, h: o.h };
  return { type: o.type, label: o.label, x: o.x, z: o.z, ry: o.ry, w: o.w, d: o.d, h: o.h, color: o.color };
}

export class Sync {
  constructor(editor, cfg, onStatus = () => {}) {
    this.editor = editor;
    this.onStatus = onStatus;
    this.onLayouts = () => {};          // (layouts[], currentSlug) — set by main
    this.onLayoutSwitched = () => {};   // (slug)
    this.room = new URLSearchParams(location.search).get('room') || DEFAULT_ROOM;
    this.sb = createClient(cfg.url, cfg.key, { realtime: { params: { eventsPerSecond: 20 } } });
    this.snap = new Map();
    this.applying = false;
    this.layouts = [];
    this._layoutSlugs = new Set();
  }

  async start() {
    this.onStatus('connecting', this.room);
    await this._loadRoom();
    await this._loadLayouts();
    // Table-wide subscription (no server room filter — DELETE events omit `room`).
    this.sb.channel('objects-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objects' }, (p) => this._remote(p))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.onStatus('live', this.room);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.onStatus('error', this.room);
      });
  }

  async _loadRoom() {
    const { data, error } = await this.sb.from('objects').select('*').eq('room', this.room);
    if (error) { console.warn('Supabase load failed:', error.message); this.onStatus('error', this.room); return; }
    const items = [], doors = [];
    for (const row of data) {
      if (row.kind === 'layout') continue;
      (row.kind === 'door' ? doors : items).push({ ...row.data, id: row.id, kind: row.kind });
    }
    this.applying = true;
    this.editor.loadState({ items, doors });
    this.applying = false;
    this._reseed();
  }

  _reseed() {
    this.snap.clear();
    for (const o of [...this.editor.items, ...this.editor.doors]) this.snap.set(o.id, sig(o));
  }

  _remote(p) {
    if (p.eventType === 'DELETE') {
      const id = p.old?.id;
      if (id == null) return;
      this.applying = true;
      try { this.editor.removeRemote(id); } finally { this.applying = false; }
      this.snap.delete(id);
      if (this._layoutSlugs.has(id)) this._loadLayouts();   // a layout was deleted elsewhere
      return;
    }
    const row = p.new;
    if (!row) return;
    if (row.kind === 'layout' || row.room === REGISTRY) { this._loadLayouts(); return; }
    if (row.room !== this.room) return;                     // another layout's object
    const s = sig({ ...row.data, id: row.id, kind: row.kind });
    if (this.snap.get(row.id) === s) return;                // our own echo
    this.applying = true;
    try { this.editor.applyRemote(row.id, row.kind, row.data); this.snap.set(row.id, s); } finally { this.applying = false; }
  }

  // local change (debounced by main.js)
  async push(state) {
    if (this.applying) return;
    const cur = new Map();
    for (const o of [...state.items, ...state.doors]) cur.set(o.id, o);
    const upserts = [];
    for (const [id, o] of cur) {
      const s = sig(o);
      if (this.snap.get(id) !== s) { upserts.push({ id, room: this.room, kind: o.kind, data: payload(o) }); this.snap.set(id, s); }
    }
    const deletes = [];
    for (const id of [...this.snap.keys()]) if (!cur.has(id)) { deletes.push(id); this.snap.delete(id); }
    try {
      if (upserts.length) { const { error } = await this.sb.from('objects').upsert(upserts); if (error) console.warn('upsert:', error.message); }
      if (deletes.length) { const { error } = await this.sb.from('objects').delete().eq('room', this.room).in('id', deletes); if (error) console.warn('delete:', error.message); }
    } catch (e) { console.warn('sync push failed:', e); }
  }

  // ── layouts ───────────────────────────────────────────────────────────────
  async _loadLayouts() {
    const { data, error } = await this.sb.from('objects').select('id,data').eq('room', REGISTRY).eq('kind', 'layout');
    let layouts = error ? [] : (data || []).map((row) => ({ slug: row.id, name: row.data?.name || row.id, created: row.data?.created || 0 }));
    if (!layouts.some((l) => l.slug === this.room)) {
      const name = this.room === DEFAULT_ROOM ? 'Layout 1' : this.room;
      await this._ensureLayout(this.room, name);
      layouts.push({ slug: this.room, name, created: 0 });
    }
    layouts.sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
    this.layouts = layouts;
    this._layoutSlugs = new Set(layouts.map((l) => l.slug));
    this.onLayouts(layouts, this.room);
  }

  _ensureLayout(slug, name) {
    return this.sb.from('objects').upsert({ id: slug, room: REGISTRY, kind: 'layout', data: { name, created: Date.now() } });
  }

  // create a layout, optionally copying source objects (with fresh ids) into it
  async createLayout(name, sourceObjs = null) {
    const slug = newSlug();
    await this.sb.from('objects').upsert({ id: slug, room: REGISTRY, kind: 'layout', data: { name, created: Date.now() } });
    if (sourceObjs && sourceObjs.length) {
      const rows = sourceObjs.map((o) => ({ id: newObjId(), room: slug, kind: o.kind, data: payload(o) }));
      const { error } = await this.sb.from('objects').insert(rows);
      if (error) console.warn('copy objects:', error.message);
    }
    await this._loadLayouts();
    return slug;
  }

  async renameLayout(slug, name) {
    const created = this.layouts.find((l) => l.slug === slug)?.created || Date.now();
    await this.sb.from('objects').update({ data: { name, created } }).eq('id', slug).eq('room', REGISTRY);
    await this._loadLayouts();
  }

  async deleteLayout(slug) {
    await this.sb.from('objects').delete().eq('id', slug).eq('room', REGISTRY);
    await this.sb.from('objects').delete().eq('room', slug);
    await this._loadLayouts();
  }

  async switchLayout(slug) {
    if (slug === this.room) return;
    this.room = slug;
    history.replaceState(null, '', `?room=${encodeURIComponent(slug)}`);
    await this._loadRoom();
    this.onLayoutSwitched(slug);
  }
}
