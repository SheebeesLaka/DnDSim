# Phase 2 checkpoint — the logic port

Status: **ready for your playtest.** Everything in the approved Phase 2 plan is implemented and
green (lint, typecheck, 350 unit/rule tests with engine coverage above the 90 % gate, build, 6
Playwright flows). Phase 3's visual directions are in `docs/visual-directions/` (delivered earlier,
waiting for your pick). Nothing below changes a combat rule; every legacy quirk is behind a
`rules.compat` flag that defaults to today's behaviour.

## What to do

1. `npm install && npm start` → the DM window opens on http://127.0.0.1:8787/.
2. Open http://127.0.0.1:8787/player in another tab or window (same browser) for the player view.
3. Playtest with the script below, on the plain board. Styling is deliberately absent; Phase 4 does
   the renderer.

### Manual playtest script (mirrors the M10 verification line of the plan)

Either start from the setup screen (your `saves/` data: party.json places Grand Wizard Man) or use
`/?scenario=test&seed=1` for the pre-built scene (4 party, 4 enemies, terrain, pickups, platform,
pit, lights, dark hangar; Dan carries a shotgun with shells).

Begin (type initiative) → Next a few times → select Henry, **F** move → **E** attack the Snake, type
the d20 and the dice → select Dan, **E** shotgun attack (ammo count drops hit or miss; Cancel at the
MISS banner keeps the shell) → **R** First-Aid Kit, d10 efficacy → walk next to a pickup, **P** →
select Grand Wizard Man, **C** Fire Bolt on an enemy → **C** Fireball aimed at a cell (per-target
d20s, Auto-roll, shared dice) → **C** Hold Person → Next through a round while Burning ticks → kill
something → End → Victory overlay (also on the player screen) → Continue returns to setup.

Keys: F move, E attack, R item, P pick up, C cast, Q swap, Esc cancel, Home reset camera,
`=`/`-` elevation on the hovered tile, backtick = debug panel.

## What is where

| Area | Files |
|---|---|
| Engine (pure) | `src/engine/**` — `reduce.ts` is the only entry point |
| Rule tests, one file per FEATURES.md area | `tests/rules/R01..R15.*.spec.ts` (map below) |
| Golden saves tests | `tests/golden/saves.spec.ts` (+ snapshots) |
| App layer | `src/app/**` (store, session, transports, replica, persistence, prefs, scenario) |
| UI | `src/ui/**` (`renderer/BoardRenderer.ts` is the Phase 4 seam) |
| Server | `server/src/**` |
| Fixture | `scenarios/test.json` (regenerate with `npx tsx scripts/build-scenario.ts`) |

### FEATURES.md area → test file

| Test | Covers |
|---|---|
| R01.entityStats | §5.1 R5.1–R5.11 |
| R02.enemyStats | §5.2 R5.12–R5.14 |
| R03.attack | §6.1 R6.1–R6.10 |
| R04.damage | §6.2 R6.11–R6.13, F-5, F-14 |
| R05.statuses | §5.4 R5.16, §7.3 R7.11–R7.15, F-1, F-4, F-8, F-28 |
| R06.initiative | §8 R8.1–R8.6, R8.8–R8.10, F-6, F-7 |
| R07.board | §4.1 R4.1–R4.2, §4.3 R4.3, §9 R9.2–R9.3, R9.8 |
| R08.spellTargeting | §7.2 R7.2–R7.6, F-13, F-33 |
| R09.spellResolution | §6.3 R6.16–R6.21, R6.23, §7.3 slots, F-18 |
| R10.spellAreas | §7.2 R7.8–R7.10, R6.22 |
| R11.items | R6.14, R6.15, R9.1, R9.6, §3.1 sidebar, R3.1 |
| R12.lifecycle | R2.4, R2.7, R8.7, R8.11, Long Rest, F-2, F-3 |
| R13.playerProjection | §13 R13.5–R13.6, R4.12 |
| R14.visual | §10 foundations (elevation/altitude/lights/groups/ambient/reveal) + invariance |
| R15.persistence | §15 serialisation, compat back-fill, party sheet persistence, scenario |
| golden/saves | §15 every file loads, round-trips structurally |
| app/* | store, replica/transport, persistence writer |
| e2e/* | battle flow, player window + display options, save/load, setup placement |

## Compat flags: decisions wanted

All default to **legacy** (what Java does). Flip any in `src/engine/compat.ts` (`LEGACY_COMPAT`), or
per battle in the debug panel; each is tested both ways.

| Flag | Ref | Legacy behaviour (default) | Fixed behaviour | Recommendation |
|---|---|---|---|---|
| `turnStartAbilitiesDoubleFire` | F-1 | REGEN-style abilities fire twice per turn when any status is present | fire once | **fix** |
| `beginSkipsFirstStatusTick` | F-3 | first combatant gets abilities but no status tick at Begin | full turn-start processing | **fix** |
| `durationZeroNeverExpires` | F-8 | duration 0 = permanent | expires on first tick | keep (editor never writes 0) |
| `npcEntitiesLegacySide` | F-7 | non-party entities are enemy-side for Ambush/ties only | party-side everywhere | keep (unreachable today) |
| `victoryOnAnyDefeat` | F-2 | End = victory if any enemy ever died | only when none remain | your call |
| `removeCurrentSkipsNext` | F-5 | killing the current combatant skips the next unit's turn-start | next unit is processed | **fix** |
| `removalWrapNoRoundIncrement` | F-5 | wrap after a removal doesn't advance the round | advances | **fix** |
| `pickupsBlockStanding` | F-15 | units cannot stand on a pickup tile | they can | your call |
| `halfRequiresTier1Die` | F-18 | save-for-half needs a tier-1 die | any tier die | **fix** |
| `ammoCompatIgnoresLegacyField` | F-16 | legacy `compatibleWeaponType` ammo never matches | honoured | **fix** |
| `entityNegativeHpPersists` | F-14 | party HP goes negative and is saved | clamps at 0 | your call |
| `rangeZeroResolvesOnCaster` | F-13 | range-0 single-target spells always hit the caster | only SELF spells | keep |
| `preBattleEnemyPlacementResorts` | R8.2 | preview d20 at enemy placement | no roll until Begin | keep |

Fixed without a flag, because a value-based port cannot reproduce them: shared mutable template
instances (F-17), enemy template id = file stem (`???` loads as `___` and is named `???`), stale
sidebar on terrain/pickup selection (F-37), preset aliasing (F-35), timer leak (F-40), Gson
field-default skipping (F-50: a terrain JSON missing `collision`/`entityAboveTerrain` now loads
with the class defaults true/true; every shipped file sets them explicitly). Also fixed in the UI:
"Use" on a preset now really uses it (F-34); unit deletion rebuilds the strip (F-22); the elevation
brush respects the lift when hit-testing (F-21) because lift is not drawn in Phase 2.

Preserved on purpose (UI): any occupied cell is selected before placement modes run (F-20), so units
cannot be placed on walk-through terrain or pickups by clicking — same as Java. Tell me if you want
that fixed; it is one line.

## Visual foundations (state only, zero rule effect)

The battle state already carries `board.elevation` (any integer, 5 ft steps, negatives = pits),
`board.ramps`, `unit.altitude` (fliers), `board.lights` (bright/dim radii, colour, placed or attached
to a unit, on/off, group), `board.lightGroups`, `board.ambient`, `board.dmReveal`, and terrain
`blocksLight`. `tests/rules/R14.visual.spec.ts` proves that randomising all of it leaves every
combat-relevant fact identical. The plain renderer shows elevation as numbers, `^n` altitude on
fliers, light markers and bright/dim/dark shading; the player window hides units standing in
darkness. A fresh battle starts with ambient **bright**, so nothing changes unless you add lights.

## Known differences from the Java app (not rules)

- Party sheets are written debounced (300 ms) and atomically after a change, not on every setter.
  Scenarios with inline assets never write; `?readonly=1` or the Manage-tab checkbox disables writes.
- Written sheets are Java-compatible but normalised: `#RRGGBB` colours (Java also normalises once a
  colour is read), attribute arrays padded to 6, missing `abilities`/`modifiedAttributes` written as
  empty, `'` not escaped as `'`. Key order follows the file that was loaded.
- `ui_prefs.json` gains only the keys you change (same as Java).
- Enemy, item, spell and terrain files are never written in Phase 2 (editors come after Phase 4).
- The board does not draw elevation lift yet (Phase 4), so clicks are exact.
- The player window is a second tab of the same browser (BroadcastChannel); a WebSocket relay for a
  second machine is the `/ws` placeholder on the server.

## Questions for you (from the plan)

1. Compat decisions above (table).
2. Save-write policy during battle: debounced atomic writes on every change (current) — OK? Want a
   "save on End only" mode as well?
3. Elevation UI range: the engine accepts any integer; the brush is ±1 per click. Cap at −4..8?
4. Lighting model: radius + colour + on/off + group + attached/placed + ambient + DM reveal — enough
   for Phase 4, or do you also want per-light intensity / flicker as data?
5. `/player` route (served by `npm start`) and Hono as the server: fine?

## Reminder of the §17 flagged items

All 61 FEATURES.md §17 items are preserved by default. The ones with a behavioural choice are the 13
flags above; the rest are either UI/editor items outside Phase 2 scope (§17.3 editors, F-44..F-61)
or fixed as noted. I will list them again at the end of Phase 4 as you asked.
