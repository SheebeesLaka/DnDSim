# Direction B — 2.5D oblique (PixiJS)

![DM view](shots/b-oblique-dm.png)
![Player view](shots/b-oblique-player.png)

Live: `mockups/b-oblique.html` (`?view=player`). The grid stays a square top-down grid (so distance,
areas and clicks are exact), but every tile is lifted on screen by its height and gets a **real
south-facing side slab**. It is the direction the current Java renderer was reaching for, finished.

## Elevation

- **Stacked slabs**: a +10 ft platform shows two slab bands under its lip, +15 ft shows three. You count
  height like stairs. The slab is shaded darker than the top with a lit lip, panel ribs, and takes the
  darkness mask, so a lit platform face next to an unlit one reads immediately.
- **Pits**: the floor around a pit is higher than the pit floor, so the pit's inner walls appear
  automatically; hazard stripes on the rim. The unit inside is drawn last with a dark halo so the rim
  never hides it (the *cut-away rule*).
- **Cliffs & ledges**: slab height is proportional to the drop; a single long cliff is one tall wall.
- **Ramps / stairs**: a wedge tile whose top edge sits at the upper level and bottom edge at the lower,
  with treads; stairs = the same wedge with hard steps.
- **Three levels touching**: the +15/+10/+5 corner shows three slab heights next to each other.
- **Exact heights**: one chip per plateau on the top face; the slab bands are a visual ruler, so most of
  the time you don't read the chip at all.
- **High ground vs flying**: a token on a platform sits on the raised top face and casts its shadow there.
  A flier hangs **straight above its shadow** on a dashed tether with a tick every 5 ft and a `▲ 15 ft`
  chip; because the tether is vertical and ticked, "15 ft up" and "standing on a 15 ft platform" cannot be
  confused even from the far end of the room.
- **Honest trade-off**: a tall object hides part of the row behind it (a 3-step wall covers ~1.3 tiles).
  Mitigations: draw rows back-to-front (done), ghost units in pits (done), and in Phase 4 a hover
  cut-away that fades the slab in front of the tile under the cursor plus an "outline through walls" for
  any unit that is fully occluded. Hit-testing must test the lifted top faces front-row-first (the
  Java renderer's known bug of clicks ignoring lift goes away).

## Lighting

Same cell model and the same clipped additive pools as A, with two additions: the pools are drawn on the
*projected* top faces, and the slabs take the darkness mask too, so a lit face under a dark top (or the
reverse) shows where a light stops. Light groups, attached/placed lights, on/off, transitions and the
DM/player split are identical to A. In Pixi the slabs are part of the same tile mesh; the lighting pass is
one shader with a per-cell light buffer.

## Board and tokens

Identical token design to A (big initials, side ring, HP arc, selected/active rings). The facility style
puts panel ribs on the slabs; the arboretum style makes slabs soil/rock with moss on the lip. The board
fills the viewport with headroom for the tallest slab.

## Library and performance

PixiJS 8. One extra mesh layer for slabs; still one lighting shader. Same budget as A for all practical
sizes.

## Why I recommend this one

It is the only direction where height is visible as *shape* on a flat screen without changing the grid the
rules run on, it costs about what A costs, and its one real weakness (occlusion) is small (max ~1.3
tiles) and already has a plan.
