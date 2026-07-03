// Multiplayer sync over Supabase. One row per object in table `objects`.
// The editor's scene is the source of truth locally; this mirrors it to the DB
// and applies other people's changes back, keyed by a shared `room`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DEFAULT_ROOM } from './config.js';

const r = (n, p = 2) => Number(n).toFixed(p);

// canonical signature of an object, order-stable, so a round-trip through the DB
// compares equal and never re-pushes / echoes forever
function sig(o) {
  return o.kind === 'door'
    ? `d|${o.id}|${o.ax}|${r(o.cross)}|${r(o.along)}|${r(o.w)}|${r(o.h)}`
    : `f|${o.id}|${o.type}|${r(o.x)}|${r(o.z)}|${r(o.ry, 3)}|${r(o.w)}|${r(o.d)}|${r(o.h)}|${o.color}`;
}

// the fields we store in the row's `data` column (everything but id/kind/room)
function payload(o) {
  if (o.kind === 'door') return { ax: o.ax, cross: o.cross, along: o.along, w: o.w, h: o.h };
  return { type: o.type, label: o.label, x: o.x, z: o.z, ry: o.ry, w: o.w, d: o.d, h: o.h, color: o.color };
}

export class Sync {
  constructor(editor, cfg, onStatus = () => {}) {
    this.editor = editor;
    this.onStatus = onStatus;
    this.room = new URLSearchParams(location.search).get('room') || DEFAULT_ROOM;
    this.sb = createClient(cfg.url, cfg.key, { realtime: { params: { eventsPerSecond: 20 } } });
    this.snap = new Map();   // id → last-known signature
    this.applying = false;
  }

  async start() {
    this.onStatus('connecting', this.room);
    const { data, error } = await this.sb.from('objects').select('*').eq('room', this.room);
    if (error) { console.warn('Supabase load failed:', error.message); this.onStatus('error', this.room); return; }

    const items = [], doors = [];
    for (const row of data) (row.kind === 'door' ? doors : items).push({ ...row.data, id: row.id, kind: row.kind });
    this.applying = true;
    this.editor.loadState({ items, doors });
    this.applying = false;
    this._reseed();

    // No server-side room filter: DELETE events only carry the primary key
    // (not `room`) under the default replica identity, so a room filter would
    // drop them. We filter by room client-side instead.
    this.sb.channel(`room-${this.room}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objects' }, (p) => this._remote(p))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.onStatus('live', this.room);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.onStatus('error', this.room);
      });
  }

  _reseed() {
    this.snap.clear();
    for (const o of [...this.editor.items, ...this.editor.doors]) this.snap.set(o.id, sig(o));
  }

  _remote(p) {
    // DELETE: old carries only the primary key. removeRemote is a no-op if the
    // id isn't in our scene, so this is safe even without a room check.
    if (p.eventType === 'DELETE') {
      const id = p.old?.id;
      if (id == null) return;
      this.applying = true;
      try { this.editor.removeRemote(id); this.snap.delete(id); } finally { this.applying = false; }
      return;
    }
    // INSERT / UPDATE: full row available — ignore other rooms and our own echoes.
    const row = p.new;
    if (!row || row.room !== this.room) return;
    const s = sig({ ...row.data, id: row.id, kind: row.kind });
    if (this.snap.get(row.id) === s) return;
    this.applying = true;
    try { this.editor.applyRemote(row.id, row.kind, row.data); this.snap.set(row.id, s); } finally { this.applying = false; }
  }

  // called on every local change (debounced by main.js)
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
}
