# 2015 W. Potomac · Unit #3 — 3D reference space

**Live:** https://kyryllk.github.io/potomac3d/

A little 3D model of the apartment you can spin around, plus a furniture
sandbox for trying out sizes and layouts. Runs entirely in the browser — no
install, no build step.

## Run it locally

It's a static site, but browsers block ES modules loaded from `file://`, so
serve it over a tiny local web server:

```bash
cd potomac-3d
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any static server works — `npx serve`, VS Code Live Server, etc.)

## Use it

- **Orbit** — drag to rotate, scroll to zoom, right-drag to pan.
- **Add furniture** — click any piece in the left panel; it drops into view.
- **Edit a piece** — click it, then move/rotate with the on-screen gizmo, or set
  exact size, rotation, and color in the right panel. `Del` removes it.
- **See inside** — the "Walls" control lowers or hides walls; "Top-down" gives a
  floor-plan view.
- **Layouts save automatically** to your browser. Export/Import moves a layout
  as a `.json` file.

## Edit the apartment itself

Every dimension lives in [`js/floorplan.js`](js/floorplan.js) as plain numbers in
feet. Change a room's size and the walls, floors, and labels regenerate. The
furniture catalog is in [`js/furniture.js`](js/furniture.js) — copy a line to add
your own item.

See [`specs/floorplan-source.md`](specs/floorplan-source.md) for what was read off
the drawing and which parts are estimates.

## Host it (GitHub Pages)

Push this folder to a GitHub repo, then Settings → Pages → deploy from `main` /
root. The site is fully static, so the Pages URL just works and you can share the
link.

## Multiplayer (optional)

Set your Supabase Project URL and **publishable** key in
[`js/config.js`](js/config.js), and run [`supabase/schema.sql`](supabase/schema.sql)
once in the Supabase SQL Editor. Then everyone who opens the link shares the same
room and edits live. Rooms are set by the URL: `?room=potomac-3` is the default;
`?room=anything` makes a separate shared space. The header shows a **Live** pill
when connected, or **Local only** when no key is set (saves to your browser).

The publishable key is a public browser key — safe to commit. The shared room is
open (anyone with the link can edit); add a room password or sign-in later if you
want it locked down.

## Roadmap

- **Phase 1:** single-player 3D sandbox — done.
- **Phase 2:** real-time multiplayer — done (Supabase, one row per object).
- **Next ideas:** presence (who else is here / live cursors), doors & windows
  modeled from the drawing, per-room locking.
