# Floor plan source — 2015 W. Potomac, Unit #3

Dimensions transcribed from the scanned architectural drawing. These feed
`js/floorplan.js`. If the model looks off, edit the numbers there.

## Labeled dimensions read from the drawing

| Room | Width | Depth | Confidence |
|------|-------|-------|------------|
| Den | 8′1″ | 7′5″ | high |
| Living Room | 12′7″ | 13′6″ | high (east wall shows bay segments 4′4″ / 3′4″ / 2′10″) |
| Dining Room | 12′6″ | 14′6″ | high |
| Bedroom 1 | 7′5″ | 14′6″ | high |
| Bedroom 2 | 7′4″ | 10′6″ | high |
| Kitchen | 12′5″ | 14′10″ | high |
| Bath | — | — | **estimated** (~6′ × 6′6″, no printed dims) |
| Deck | 11′ | 6′9″ | high |
| Windows | 2′9″, 2′10″ | — | noted, not modeled yet |

## Interpretation

- Long, narrow railroad-style unit, roughly **20′6″ wide × ~43′ long** interior,
  plus a **~6′9″** rear deck.
- Layout runs front (north) to back (south):
  - **West side:** Den → Stairwell → Bedroom 1 → Bedroom 2
  - **East side:** Living → Dining → Kitchen (open railroad run)
  - **Bath** tucked into the east side between dining and kitchen.

## Modeling decisions (approximations)

1. West rooms straightened to a common **8′ width** so the central spine wall is
   a clean line and there are no gaps (drawing shows 7′4″–8′1″; the difference is
   wall/closet thickness).
2. The outer **east wall is left slightly jagged** (12′7″ / 12′6″ / 12′5″) to
   preserve the bay as drawn.
3. Stairwell depth (~10′5″) derived so the west and east columns share the same
   overall length.
4. **Not yet modeled:** door openings, window cutouts, wall bay geometry, stair
   treads, ceiling. Walls are solid; use the "Walls: Half / Off" view control to
   see inside. These are good candidates for a later pass.
