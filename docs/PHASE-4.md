# Phase 4: the HD-2D board (direction C)

The board is now a three.js scene in the style of Triangle Strategy / FF Resonance: 2D pixel-art
sprites standing in real 3D terrain under real lights. It is renderer-only. The engine, the rules
and the panels are untouched, and the new board implements the same `BoardRenderer` contract as the
Phase 2 Canvas2D board. That 2D fallback was removed after the Spotlight redesign; the board needs WebGL.

Screenshots of the shared test scene: `docs/progress/phase4-test-dm.png`, `-dm-selected.png`,
`-dm-top.png`, `-player.png`, and the stress scene `phase4-perf-dm.png`
(the script that made them targeted the pre-Spotlight UI and was removed; `design/scene/shoot-*.mjs`
shoot the current one).

## Where things live

| Path | What |
| --- | --- |
| `src/ui/sprites/slicer.ts` | pure TS port of `SpriteUtils.sliceSheet` (key colour, separator runs, bottom-centred frames, `#row` refs, 300 ms idle) |
| `src/ui/sprites/library.ts` | fetches `/api/sprites/*`, slices once, bakes one atlas canvas per sheet |
| `src/ui/renderer/three/ThreeRenderer.ts` | the board: mount, render(vm), picking, overlay, post, view options |
| `…/camera.ts` | locked tactical orthographic camera, integer texel zoom, pixel-grid snapping, top-down mode |
| `…/tiles.ts` | instanced 5 ft step boxes, wedge ramps, surface heights, tile picking |
| `…/units.ts` | sprite / token billboards, terrain blocks, ring decals, flier tether, ghosts |
| `…/lights.ts` | ambient / reveal / sun, engine lights → point lights, shadow budget and refresh |
| `…/marks.ts` | highlight decals, hover frame, per-unit rings |
| `…/overlay.ts`, `regions.ts` | 2D text overlay (chips, HP, floating numbers) and height-region chips |
| `…/occlusion.ts`, `post.ts` | hidden-unit test; bloom + band tilt-shift |
| `src/ui/viewPrefs.ts` (the toolbar moved to Field → TV → Camera in the Spotlight UI) | camera / blur / glow toggles for both windows (`board.*`, `board.player.*` in ui_prefs) |
| `server/src/app.ts` | read-only `GET /api/sprites/*` over `resources/sprites/` |

## The brief, item by item

| # | Brief | Done as | Verified by |
| --- | --- | --- | --- |
| 1 | Port the sheet slicer | `slicer.ts`: corner key, separator runs (irregular spacing), shared frame width ≥ 32, bottom-centred per-row canvas, `#row` refs, first two frames every 300 ms | `tests/ui/slicer.spec.ts` on the real `testsprites.png` (12 rows × 10 frames, bounds, feet on the bottom row) and synthetic sheets |
| 1 | Serve sprites | read-only `/api/sprites/*`, images only, no traversal, `_source/` hidden; the sheets live in `resources/sprites/` | `tests/server/api.spec.ts` |
| 1 | One atlas, crisp textures | one atlas canvas per sheet; every texture `NearestFilter`, no mipmaps, sRGB (the initials token alone is smooth) | — |
| 2 | Billboards | upright plane, origin at the feet, never tilted; azimuth is fixed so no rotation is needed; height × `1/cos(pitch)` | `renderer.spec.ts`: a stretched texel is exactly `zoom` px tall |
| 2 | Lit cut-out material | Lambert, `alphaTest 0.5`, opaque. A flat sprite lit by its own normal turns black when a torch is behind it, so it is lit like the ground it stands on (probe just above the feet, up normal) | screenshots |
| 2 | Silhouette shadows | `castShadow` + `customDepthMaterial` / `customDistanceMaterial` with the same map and alphaTest | `e2e/hd2d.spec.ts` checks every unit's depth/distance materials |
| 2 | Token fallback | the mockups' initials disc on the same billboard (party circle, enemy rounded square) | `e2e/hd2d.spec.ts` (NMB-15 beside sprite units) |
| 3 | Integer zoom, snapping, pixel ratio | zoom = whole px per texel; camera target snapped every frame; `setPixelRatio(floor(dpr))`; pitch `asin(0.75)` so a tile is 12 texels deep; a 5 ft step is sized to project to exactly 6 texels, so every tile edge and sprite base lands on a pixel | `renderer.spec.ts` (grid stays on whole pixels after arbitrary pans) and `e2e/hd2d.spec.ts` (after a 37×23 px drag the board is the same picture shifted, < 1 % pixels differ) |
| 3 | Pixel-art tiles | procedural 16×16 tops and 16×6 sides at sprite density, per theme | screenshots |
| 4 | Elevation, ramps, pits | instanced step boxes per cell, wedge ramps, pits as shorter stacks over a base | `renderer.spec.ts` tile heights |
| 4 | Fliers | always-on ground shadow decal, dashed tether with a tick per 5 ft, `▲ 15 ft` chip | screenshots |
| 4 | `on +10 ft` | chip under units on raised or sunken ground; plus one height chip per contiguous region and per ramp run | `renderer.spec.ts` (regions, chip placement) |
| 5 | Rings as floor decals | team ring (dashed for the DM when players can't see the unit), HP arc, orange double ring, gold active ring, on the tile top (fliers: on the shadow) | screenshots |
| 5 | 2D overlay text | chips, HP numbers, banner and floating numbers drawn in screen space at projected points | screenshots |
| 6 | Lights | engine lights → `PointLight`s; brightness from the lamp-height angle, cut off just past the dim radius; ≤ 8 shadowed; maps refresh only when something near them changes | `e2e/hd2d.spec.ts` (2 on, hangar group off; perf scene 20 lights / 8 shadowed; a change in a corner refreshes fewer than 8 maps) |
| 6 | Visibility source of truth | `lighting.ts` still decides what players see; 3D light is visual only | `e2e/hd2d.spec.ts` (hornet absent on the player board) |
| 6 | DM reveal / player darkness | reveal = low ambient + hemisphere for the DM; players get almost none | screenshots |
| 7 | Post | bloom on bulbs and hot spots; tilt-shift blur whose sharp band covers the whole projected board (only the backdrop blurs); both toggleable; player blur off by default | — |
| 8 | Picking | ray against tile tops and sides (instance id → cell) and sprite billboards; opaque sprite texels win, transparent padding is clicked through; a hidden unit's silhouette wins too, since it is drawn on top | `renderer.spec.ts` + `e2e/hd2d.spec.ts` (raised tiles, Dan's head over the tile behind him) |
| 8 | Hidden units, cut-away | units hidden behind taller ground or blocks get a see-through white silhouette; blocks between the hovered tile and the camera fade | `renderer.spec.ts` (occlusion) |
| 8 | Camera | locked tactical angle + top-down toggle, no free rotation | — |
| 9 | Scene coverage | `scenarios/test.json` has the +15/+10/+5 corner, the Puppet in the pit, the hornet at altitude 3, Henry/Dan sprites beside the NMB-15 token, the lamp on and the hangar group off | `e2e/hd2d.spec.ts` screenshots (attached to the test report) |
| 9 | Performance | see below | `e2e/hd2d.spec.ts` perf-scene shape test; `?bench=1` |

## Performance: what could and couldn't be measured

The container has no GPU. Chromium renders WebGL with SwiftShader on the CPU, which manages about
1 frame per second for this scene. A bare WebGL clear runs at 57 fps there, so the slowness is
software fragment shading, not the page. **The 60 fps target on a real GPU is therefore unverified
here.** Check it on your machine with `/?scenario=perf&bench=1`: the board redraws every frame and
shows fps, frame time and draw calls in its top-right corner.

What was measured (perf scene: 25×25, 40 units, 20 lights, 8 shadowed):

| Cost | Value |
| --- | --- |
| JS per drawn frame (camera, sprite snapping, overlay) | 0.4 ms |
| Renderer update on a board change | 1–2 ms |
| Hover over a new cell (view model + lighting rebuild, existing code) | ~12 ms |
| Click hit test | ~2 ms |
| Draw calls per frame | ~320 |

Frames are drawn only when something changes (and every 300 ms for idle animation). Shadow maps are
static and refresh only near what moved.

## Known limits and choices to review

- **Deep, narrow pits.** At the tactical angle, the floor of a 10 ft deep pit one cell wide is hidden
  behind its rim. Units inside it show as silhouettes and stay clickable. Use top-down to click the
  empty floor.
- **Sprites don't receive shadows.** They cast silhouette shadows and are lit like their tile, but a
  sprite standing in a wall's shadow is not darkened by it.
- **Idle frames don't refresh shadow maps.** The two walk frames differ by a texel or two, and point
  shadows cost six renders each.
- **A carried light** (Henry's torch) floats above its bearer, so the bearer is about as bright as a
  tile under a lamp.
- **Not done (optional in the brief):** "Cinematic Pixel" low-res render targets for big 3D models,
  and 90° rotation steps (only if 4-facing sheets appear).
- **Fixture change:** the test scenario gives Henry, Dan, the Snake and the Puppet sheet rows, and
  NMB-15 moved from (8,4) to (7,4) to stand beside them. The real files in `saves/` are untouched.

## Compat fixes: applied after Phase 4

The recommended fixes are now the default for new battles (`RECOMMENDED_COMPAT` in
`src/engine/compat.ts`): F-1, F-3, both F-5 flags, F-18, F-16 and (decided 2026-10-11) F-2, F-15 and
F-14. A battle stores its flags, so one saved before a change still replays under the rules it was made
with. Kept on purpose: F-8, F-7, F-13, R8.2. The debug panel (`` ` ``) toggles any flag for the current
battle.

- **F-2:** End is a victory only when no enemies remain.
- **F-15:** units may stand on a pickup's tile.
- **F-14 (dying):** party HP clamps at 0 and a party member at 0 HP stays on the board, **dying**,
  instead of leaving it (`EntityUnit.dying`). Play carries on as after any hit. The sprite turns
  greyscale with a red "Dying" chip; they keep their place in the turn order, get no actions, and more
  damage changes nothing. Selecting them swaps the sidebar's Actions for a **Dying** panel
  (`RESOLVE_DYING`, `src/engine/commands/dying.ts`):
  - **Recover:** back up with 1 HP.
  - **Hold on:** still dying (logged).
  - **Perish** (asks first): they leave the battle like a defeat, a tombstone with their name marks the
    tile (`board.graves`, decoration only; players see it only on a lit tile), and their character sheet
    is marked dead (`dead: true`, written only once it happens). The Character Sheets list shows them
    with a ✝ and a greyed portrait; the sheet has a "✝ Dead" badge and a Perished checkbox to undo it.
  - A new battle skips party members whose sheet is marked dead (logged). Healing or setting HP above 0 also ends dying. **Not done yet:** automated death-save rolls, which
    would replace "Hold on".

After Phase 4: the editors (character sheets, assets, spells), see `docs/EDITORS.md`.

## After Phase 4: making the board actually 3D

The Phase 4 camera looked straight north, so only the south face of each step was ever on screen and
the board read as a flat 2D grid. Plan: `~/.claude/plans/pasted-content-id-ac1f-we-ve-made-dynamic-peacock.md`.

| Change | Where |
| --- | --- |
| Four headings at 30° + k·90° (two side faces of every step show); ⟲/⟳ in Field → TV → Camera, `[` / `]` on the DM board; 240 ms tweened turns; top-down keeps only the 90° turns so the map stays square | `camera.ts`, `constants.ts` (`AZIMUTHS`), `viewPrefs.ts` (`board.azimuth`, `board.player.azimuth`) |
| Shimmer-free at any heading: the view target is snapped along the screen's right/up axes; billboards yaw to the heading and snap their bottom-left corner (`pixelSnap`) | `camera.ts`, `ThreeRenderer.snapBillboards`, `units.ts` |
| A 5 ft step is 0.75 cell (12 texels); side faces shaded by heading (camera-left lighter); sun from camera-left | `constants.ts`, `tiles.ts` (`faceShade`), `lights.ts` |
| Ledge cues: bright lip, dark outline and end edges on every drop, contact shadow at the foot of walls | `ledges.ts` |
| Scenery skirt: 8 rings of floor half a step below the board (and in disabled cells) with seeded theme props, fading into the backdrop; never picked, outside the camera fit | `skirt.ts` |
| Hidden-unit test and height-chip placement follow the heading | `occlusion.ts` (grid walk), `regions.ts` (`cellsAlong`) |
| Moonbase themes: `facility` (deck plate, tread plate, vents, lab floor, hazard-striped ledges) and `arboretum` (moss, flowers, damp soil, overgrown plating, vine sides); 4 top variants per theme in one atlas, picked per cell | `tileThemes.ts`, `boardThemes.ts` (pickers; new battles default to `facility`) |

| Lighting: bright rooms lean on the key light (strong two-face contrast) and scale torches down so lit sprites don't blow out; dim is cool moonlight; the DM's reveal in the dark is low and cool so torch/lamp pools stand out in the DM view too; bloom only on HDR emitters (bulbs) | `lights.ts` (`ambientLevels`), `post.ts` |
| Transitions (visual only, the engine switches at once): a light fades up (450 ms) or down (260 ms); a grouped light, or several switched on together, flickers then ramps up, staggered per light, the "generator restored" moment; ambient changes ease over 700 ms | `lights.ts` (`lightTweenLevel`, `LightLayer.tick`) |

| Wall blocks (collision terrain without sprite art) follow the theme: steel bulkheads with a hazard-striped foot in the facility, clipped hedges in pale planters in the arboretum, rock elsewhere; the terrain colour only lightly tints themed blocks; side faces shaded by heading like the tiles | `tileThemes.ts` (`makeBlockTextures`), `units.ts` |

Still to do: death-save rolls for dying heroes, and the Playwright run (its browser isn't installed on
the dev machine: `npx playwright install chromium`).
