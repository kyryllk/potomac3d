# Changelog

## 2026-07-01 (v3 — multiplayer)

Added: Real-time multiplayer. Share the link and everyone lands in the same room; adding, moving, resizing, or deleting furniture and doors shows up live for everyone, and the room is saved in the cloud (Supabase). A status pill in the header shows Live / Local only.
Added: Rooms via the URL — `?room=potomac-3` is the default; use `?room=something-else` for a separate shared space.
Note: To turn multiplayer on, set your Supabase URL + publishable key in `js/config.js` and run `supabase/schema.sql` once. With no key set, it runs local-only (saves to your browser) exactly as before.

## 2026-07-01 (v2)

Added: Door tool — click "Add a door," then click any wall to drop an opening (eyeball the spot). Doors cut a real gap in the wall with a header above, and you can slide them along the wall and set width/height.
Added: Dimensions toggle — shows each room's size and each object's size floating in the scene. Clicking any room also shows its dimensions and area in the panel.
Added: Quarter-height wall option (Full / Half / ¼ / Off) for an even lower, see-over-everything view.
Changed: Moving furniture is now direct — press and hold a piece and drag it on the floor. The rotate ring stays on the selected piece, so there's no more switching between move and rotate modes.
Changed: Every object now carries a small label showing its size.

## 2026-07-01

Added: First version of the 3D apartment sandbox for 2015 W. Potomac, Unit #3.
- 3D model of the apartment built from the floor-plan dimensions, which you can
  spin, zoom, and pan.
- Furniture you can add from a side panel (beds, sofas, tables, kitchen pieces,
  desks, and more) at real-world sizes.
- Click a piece to move and rotate it with an on-screen handle, or set its exact
  size (in inches), rotation, and color.
- View controls: lower or hide walls to see inside, a top-down floor-plan view,
  room-label and grid toggles, and a reset-view button.
- Layouts save to your browser automatically, and can be exported/imported as a
  file to share.
- Runs as a plain website (no install) so it can be hosted on GitHub Pages.
