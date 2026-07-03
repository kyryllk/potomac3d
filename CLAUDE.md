# CLAUDE.md — potomac-3d

Personal project (Kyryll's own, **not** HatchMed). A browser-based 3D model of
the apartment at 2015 W. Potomac, Unit #3, with a furniture sandbox for size and
layout experimentation. Meant to be hosted on personal GitHub Pages and shared.

## GitHub / accounts

- **Personal repo → `kyryllk` account.** Never push to HatchMed. Run
  `gh auth switch --user kyryllk` before any push.
- No remote is set up yet. Create it under Kyryll's personal GitHub when he asks.

## Stack

- Plain static site: HTML + CSS + ES-module JavaScript. **No build step, no npm.**
- **Three.js** via CDN importmap (pinned `0.160.0` in `index.html`). Don't add a
  bundler or framework without asking.
- Everything renders client-side so it hosts on GitHub Pages as-is.

## Architecture (source of truth = one array)

- `js/floorplan.js` — **the apartment dimensions**, in feet. Edit here to reshape
  the model. Walls/floors/labels are generated from it (`js/builder.js`).
- `js/furniture.js` — the furniture catalog (real-world sizes in feet).
- `js/editor.js` — owns scene state as `items` (furniture) + `doors`, one mesh
  per object. These arrays are the single source of truth; storage and
  multiplayer just mirror them. `applyRemote`/`removeRemote` apply other people's
  changes without emitting `onChange` (so they never echo back).
- `js/storage.js` — localStorage + JSON export/import (local-only fallback).
- `js/sync.js` — multiplayer over Supabase: one row per object in table
  `objects`, realtime both ways, client-side room filter, echo suppression via a
  canonical signature per object. Loaded lazily; only active when a key is set.
- `js/config.js` — Supabase URL + **publishable** key (public, safe to commit)
  and the default room. Empty key ⇒ local-only mode.
- `supabase/schema.sql` — run once to create the `objects` table + open RLS +
  realtime. Rooms are per `?room=` URL param (default `potomac-3`).
- `js/ui.js`, `js/main.js`, `js/units.js` — DOM wiring, bootstrap, unit helpers.
- **Never commit the Supabase `sb_secret_…` key.** Only the publishable key ships.

## Conventions

- **Units:** model in decimal feet (1 world unit = 1 ft). Display feet+inches via
  `units.js` (`6.667 → 6′8″`). Resize inputs are in whole inches.
- **Coordinates:** origin at front-left (NW). `x` = west→east (short ~20′),
  `z` = north→south (long ~43′), `y` = up.
- Match the existing glass-panel UI (see design note below). Reuse the CSS
  variables in `css/style.css`; don't hardcode colors.
- Keep `floorplan.js` and `furniture.js` friendly to non-coders — they're the
  files collaborators will edit.

## Design

Follow the global design principles (`~/.claude/design/principles.md`). Aesthetic
is Apple-flavored (Layer 1 `taste.md`): system font, translucent floating chrome,
comfortable spacing, one accent, semantic light/dark. No Layer 2 brand tokens —
this is personal, so Layer 1 governs appearance.

## Verify before "done"

Serve locally (`python3 -m http.server`) and confirm it renders with no console
errors, furniture adds/moves/deletes, and layouts persist. Never say "should work."
