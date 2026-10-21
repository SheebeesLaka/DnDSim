# Unfinished work

Inventory taken after the Spotlight redesign (2026-10-20). Each entry says what exists and what
doesn't. Code with no use at all was removed in that cleanup; what's listed here is partly built, or
fully built but not reachable from the UI. Line numbers are as of this inventory.

## Partly built features

| Feature | What exists | What's missing |
| --- | --- | --- |
| Death saves | `DeathSaves { successes, failures }` (`src/engine/types.ts`), reset to 0/0 when a hero drops (`rules/apply.ts`). The dying sheet offers recover / hold on / perish (`commands/dying.ts`). | Nothing rolls or counts saves. "Hold on" only logs (`dying.ts:8`). Also listed in `docs/PHASE-4.md`. |
| Enemy and NPC actions | Enemy caster stats (`selectors/stats.ts`: `spellAttackModifier`, `spellSaveDC`, `casterLevel`). | `CAST_SPELL` refuses anyone outside the party (`commands/spells.ts:36`). Enemies only move and attack (`selectors/actions.ts`). Non-party characters get no actions. Enemies have no spell list, and the cast sheet is party-only. |
| Action economy | None, same as the Java app (FEATURES.md R-areas). | Actions, bonus actions and reactions per turn. Spells have no components, duration or concentration fields. |
| Item ability triggers | `ON_TURN_START` runs (`rules/statuses.ts` `processEquippedAbilities`, `commands/lifecycle.ts`). | `ON_HIT`, `ON_EQUIP`, `ON_DAMAGED` and `PASSIVE` are never fired. `STAT_BOOST` does nothing (`statuses.ts:63`), so `targetAttribute` does nothing either. |
| Active / Special abilities | You can edit them on the sheet (`ui/editors/abilityEditor.ts`, `sheetPane.ts`). | They can't be used in battle. Their trigger defaults to `ON_TURN_START` (`assets/normalize.ts`), so they fire every turn start (F-28 kept). |
| Conditions | Prone, Stunned, Frightened and Hidden are offered as `StatusEffect.NONE` markers (`spotlightScreen.ts` status palette). Held (Hold Person) is −99 MOB. | No rule reads the markers. Stunned doesn't skip a turn, and with duration 1 it wears off at the start of the target's own turn, so it never costs them anything. Hidden doesn't hide anyone from the TV (`engine/view/playerProjection.ts` only checks darkness). Held only stops movement: a held creature can still attack and cast. (Review item 4, flagged 2026-10-21.) |
| Movement routing | A move is legal when the target tile is within MOB steps (`commands/actions.ts` `MOVE_UNIT`), and the board animates a walk along the straight line (`renderer/three/walk.ts`). | No pathfinding: walls, creatures and pits along the way don't block or lengthen a move, and the walk animation passes straight through them. Routing would need a path search for legality, the move highlight and the walk. (Review item 2, flagged 2026-10-21.) |
| Height, flying and light in the rules | Elevation, ramps, altitude and lighting are drawn, and darkness hides creatures from the TV. | None of them affect a rule: no climbing cost, no high-ground bonus, fliers can be hit in melee, and attacking into darkness has no penalty. (Review item 3, flagged 2026-10-21.) |
| Field → Height | Raise and lower tiles. | No ramp tool. `SET_RAMP` works but only `scripts/build-scenario.ts` uses it. |
| Field → Terrain | Placing terrain. | There's no "blocks light" toggle (`SET_TERRAIN_BLOCKS_LIGHT` is test-only) and no way to delete or inspect terrain (see the next section). |
| Field → Board | Board theme. | Reshaping mid-battle shows "not built yet" (`spotlightScreen.ts:2692`). `SET_GRID` is test-only (the Java app had a mid-battle reshape). |
| Field → History | A list of past actions. | Clicking a row doesn't jump back to it. |
| Field → Spawn | Creatures, terrain, and weapon / accessory / consumable pickups. | Ammunition, crafting items and key items can't be spawned (`PLACE_PICKUP.itemKind`, `engine/types.ts:333`). |
| Status edit | `UPDATE_STATUS` works (`commands/dm.ts`). | No UI sends it. Active effects rows only have ✕ end-early; the plan asked for edit and extend too (`design/05-build-plan.md`). |
| Victory screen | Works on both windows. | Still the old overlay and CSS (`ui/panels/dialogs.ts` `victoryOverlay`); not redesigned (`design/06-build-review.md`). |
| TV window | `window.open('/player.html')` plus a BroadcastChannel mirror. | No fullscreen or screen-placement code (the Java app had F11). Real dual-monitor use is still unverified. No relay to a second machine; the 501 `/ws` stub was removed. The idle title "Cassandralis" is hard-coded (`tvScreen.ts`). |
| Build review | `design/06-build-review.md`. | Some screens were built but never captured: item sheet, dying, ready / timer / reinforcement / save / load sheets, prompts, TV plate. Four questions are still open. |

## Controls that are missing or do nothing

- **Terrain and pickups can't be removed or inspected.** The right-click menu opens only for
  creatures (`spotlightScreen.ts:365`), and Delete acts only on the selected creature (`:760`).
- **Edit Spell is gone from battle.** `main.ts` still passes `editSpell`, but the Spotlight screen
  never calls it (declared at `spotlightScreen.ts:131`).
- **Zoom has no on-screen control.** The wheel and the camera reset are the only ways to zoom.
  The renderer's zoom API was removed as dead.
- **The roll panel's dice boxes can't be clicked.** Entry is keyboard-only (`ui/battle/rollPanel.ts`).
- **Saved battles can't be deleted.** `DELETE /api/battles/:name` exists (`server/src/app.ts`), but
  neither the load sheet nor `assets/client.ts` uses it.

## Data that is saved and edited but has no effect in battle

- Character sheet `wallet`: loaded and written back, but there's no UI anywhere
  (`assets/normalize.ts:309`, `assets/write.ts:174`).
- Enemy `tags` and the shared tag list: they only filter the enemy browser and label the roll
  panel. A "Flying" tag doesn't set altitude.
- Spell `school`: display only. `description` shows only its first 80 characters on the cast sheet.
- Crafting items (`craftingCategory`, `description`) and key items (`description`, `questRelated`):
  editable, but they can't be used, placed or shown in battle. The item sheet lists consumables only.
- Ability `abilityType` and `targetAttribute`: editor only (see Item ability triggers above).
- Fields kept so files round-trip, also unused in Java (FEATURES.md F-list): `Ammunition.legacyDamageBonus`,
  `Accessory.legacyArmorType`, `Weapon.legacyDamage`, `Enemy.legacyAttackDamage`. The last two only
  derive dice when a file has none.

## Kept on purpose, test-only today

These have no app caller but are kept as test helpers or as the engine side of the features above:
`withCompat`, `reduceAll`, `cloneBattle`, `unitsInDarkness`, `statTypeName`, `renderFrame`,
`BOARD_THEME_IDS`, `app/transport/loopback.ts`, and the commands `SET_RAMP`,
`SET_TERRAIN_BLOCKS_LIGHT`, `UPDATE_STATUS`, `SET_GRID` and `SET_AMBIENT`. `SET_AMBIENT` is the
three-step ambient that the lighting rule tests (R13, R14, R20) are written against; the UI uses
`SET_AMBIENT_LEVEL`.
