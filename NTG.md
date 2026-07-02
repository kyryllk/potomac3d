# NTG — potomac-3d

## 2026-07-01 — Multiplayer approach
Decision: Ship single-player first (Phase 1); add real-time multiplayer as Phase 2 on top of Supabase.
Options considered:
- Pure GitHub Pages static (no shared state) — hostable + shareable link, but each viewer's layout is local only.
- GitHub Pages + Supabase (or Firebase) — static frontend, free hosted DB + realtime, shared rooms via `?room=` link.
- Own WebSocket backend on a free host — more infra to run and maintain.
- Yjs + WebRTC (serverless CRDT) — no durable shared persistence without a server, so "saved to this room" is weak.
Why this: The 3D core has to be solid regardless and works immediately with no account setup. Supabase gives shared persistence + realtime with no server to maintain, and the anon key is safe to ship in a static site. Scene state is already one plain array (`storage.js`), so Phase 2 is an add-on, not a rewrite.
Compromise / revisit: Multiplayer needs Kyryll to create a free Supabase project and hand over the project URL + anon key. An open room (anyone with the key can write) is fine for a personal share; revisit with a room password or Supabase Auth if it needs locking down.
