# Phase 4: the HD-2D board (direction C)

The board is now a three.js scene in the style of Triangle Strategy / FF Resonance: 2D pixel-art
sprites standing in real 3D terrain under real lights. It is renderer-only. The engine, the rules
and the panels are untouched, and the new board implements the same `BoardRenderer` contract as the
Phase 2 Canvas2D board (which stays as a fallback: `?renderer=2d`, or automatically without WebGL).

Screenshots of the shared test scene: `docs/progress/phase4-test-dm.png`, `-dm-selected.png`,
`-dm-top.png`, `-player.png`, and the stress scene `phase4-perf-dm.png`
(regenerate with `node scripts/hd2d-shots.mjs [test|perf]`).

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
| `src/ui/panels/boardToolbar.ts`, `src/ui/viewPrefs.ts` | camera / blur / glow toggles for both windows (`board.*`, `board.player.*` in ui_prefs) |
| `server/src/app.ts` | read-only `GET /api/sprites/*` over `resources/sprites/` then `legacy-java/resources/sprites/` |

## The brief, item by item

| # | Brief | Done as | Verified by |
| --- | --- | --- | --- |
| 1 | Port the sheet slicer | `slicer.ts`: corner key, separator runs (irregular spacing), shared frame width ≥ 32, bottom-centred per-row canvas, `#row` refs, first two frames every 300 ms | `tests/ui/slicer.spec.ts` on the real `testsprites.png` (12 rows × 10 frames, bounds, feet on the bottom row) and synthetic sheets |
| 1 | Serve sprites | read-only `/api/sprites/*`, images only, no traversal, `_source/` hidden; sheets stay in `legacy-java/resources/sprites/` | `tests/server/api.spec.ts` |
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

## Reminder: recommended compat fixes (still open)

You asked to be reminded to fix the recommended flags. All of them still default to the legacy
behaviour. Each is one line in the compat defaults and is already tested both ways
(`docs/CHECKPOINT-2.md` has the full table).

| Flag | Ref | Recommendation |
| --- | --- | --- |
| `turnStartAbilitiesDoubleFire` | F-1 | fix |
| `beginSkipsFirstStatusTick` | F-3 | fix |
| `removeCurrentSkipsNext` | F-5 | fix |
| `removalWrapNoRoundIncrement` | F-5 | fix |
| `halfRequiresTier1Die` | F-18 | fix |
| `ammoCompatIgnoresLegacyField` | F-16 | fix |
| `victoryOnAnyDefeat` | F-2 | your call |
| `pickupsBlockStanding` | F-15 | your call |
| `entityNegativeHpPersists` | F-14 | your call |
| `durationZeroNeverExpires`, `npcEntitiesLegacySide`, `rangeZeroResolvesOnCaster`, `preBattleEnemyPlacementResorts` | F-8, F-7, F-13, R8.2 | keep |

Still to come after Phase 4: the editors (character sheets, assets, spells).
