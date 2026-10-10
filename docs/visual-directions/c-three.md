# Direction C — True 3D orthographic (three.js)

![DM view](shots/c-three-dm.png)
![Player view](shots/c-three-player.png)

Live: `mockups/c-three.html` (`?view=player`). Real geometry: every tile is an extruded block (pits are
shorter blocks), walls are tall boxes, ramps are wedges, and lights are real point lights with shadow
maps. The camera is **orthographic** (distant tiles are not smaller, so the grid stays measurable) and
**locked** to a tactical angle, with a top-down toggle for when the DM needs the plan view.

## Elevation

- **Platforms, pits, cliffs, ledges, ramps**: all literal. Height is read the way you read a model on a
  table. Shadows under lips and on the floor behind a platform come for free from the lights.
- **Multiple levels**: three touching levels at the +15/+10/+5 corner look like a staircase.
- **Exact heights**: the same one-chip-per-plateau and `on +10 ft` tags, projected into the view.
- **High ground vs flying**: the flier is lifted in 3D above a dark shadow decal, on a dashed tether with
  ticks every 5 ft and a `▲ 15 ft` chip; the camera angle makes "hanging in space" obvious.
- **Honest trade-offs**:
  - The camera hides the north and west faces; some edges only read from their shadow, and anything
    behind a tall wall or platform is hidden (the hornet's tether disappears behind the +15 ft corner from
    some angles). Mitigations: ghosting (render occluded units as outlines through geometry), the
    top-down toggle, a configurable angle.
  - Tiles are not screen-aligned squares, so the players' mental grid is weaker than in A/B until they
    get used to it; gridlines must be strong (they are).
  - Hit-testing is a raycast against cell meshes; fine, but more code than A/B.

## Lighting

- Real `PointLight`s with the dim radius as their range, shadow maps on, so **height physically blocks
  light** and the platform throws a true shadow. Bright/dim/dark levels are still computed on the grid
  (needed for hiding tokens from players); the rendering just looks continuous.
- Groups and transitions are trivial (tween intensity); attached lights follow the token mesh.
- DM reveal = a low ambient/hemisphere light so dark areas stay legible; the player view has almost none,
  so unlit rooms are black and tokens in them are not rendered.
- Cost: every shadow-casting point light is six depth renders per frame. Up to ~8 is fine; 20 lights
  means static-shadow caching and a budget per scene. The mockup already uses PCF soft shadows.

## Board and tokens

Same token identity rules, but **drawn as 2D billboards over the 3D bodies** (initials, side ring, HP arc,
selected/active rings) so they stay crisp and TV-readable regardless of angle; the 3D body gives the side
colour and casts the shadow. Tiles use the same facility/arboretum texture sets as the 2D directions, as
PBR materials with a little metalness so the lights read on them. The board fills the viewport.

## Library and performance

three.js (r186). More complex than Pixi in every dimension: materials, shadow budgets, raycasting, camera
UX, and keeping 60 fps on a 25×25 board with 40 tokens and 20 lights needs instancing and shadow caching
from day one. It is the richest-looking option and the most work.
