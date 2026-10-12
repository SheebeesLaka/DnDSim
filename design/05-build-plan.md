# Build plan — Spotlight battle UI (draft for review, 2026-10-11)

**Target design:** `mockups/c2.html?skin=glass&plates=roll` (combat) and `?mode=field` (Field ▸ Light), as decided in
`03-feedback.md`. The TV shows the same layout without DM controls. Other Field tabs are **designed after this lands**.
Menu, setup, sheets and asset editor are **out of scope** for this build.

## What the code gives us today (relevant facts)

- `Store.dispatch(command)` is the single write path; `reduce` is pure and returns a new `BattleState` (immer). Session
  (selection, mode, hover) is a separate reducer. → **Undo is cheap**: keep previous `BattleState`s. The sheet persister
  diffs whole state on every change, so an undo re-saves the older sheet automatically.
- The player window is a `ReplicaStore` fed `BoardVM` snapshots over a BroadcastChannel and filtered by
  `projectForPlayer`. → Anything the TV must show (live roll entry, plates, effects) has to be **in the snapshot**.
- `battleScreen.ts` is one 1,394-line file of plain DOM; `styles.css` (1,121 lines) is shared by every screen.
- Lighting: lights, groups, toggles and edits already exist as commands (`ADD/UPDATE/REMOVE/TOGGLE_LIGHT`,
  `TOGGLE_LIGHT_GROUP`). **Ambient is a 3-step enum** (`bright|dim|dark`) and the renderer maps it to intensities.
- Statuses: `StatusDef {name, effectType, magnitude, duration, targetAttribute}`. No source, no original duration, and no
  in-battle command to add or remove one. The board VM carries status *names* only.
- Turn order: `order[] + currentIndex`. No delay, ready, reorder or reinforcement concepts.
- Attack flows carry `attackMod` and `damageBonus` as **single numbers**, so there's no breakdown for "7 STR + 2 Blessed".

## Phases

Each phase ends in a working app: tests green, plus a visual check against the mockup.

### Phase 0 — Foundations (no visible change)
- `src/ui/battle/` folder: split the battle screen into components (`topBar`, `dock`, `effectsPanel`, `rollPanel`,
  `actionBar`, `turnRail`, `boardOverlay`, `fieldPanel`, `popovers`). A small render helper keeps the plain-DOM style
  (no framework).
- `src/ui/battle/tokens.css`: Glass tokens (colours, radii, blur, the 120/180/260 ms motion cadence, type scale)
  scoped to the battle and player screens, so other screens are untouched.
- Fonts (Chakra Petch + Inter) **self-hosted**, so the table works offline.
- The new UI is reachable through `?ui=next` while it's built; the old screen stays the default until Phase 6.

### Phase 1 — Engine additions (pure, unit-tested in `tests/rules`)
1. **Roll breakdown**: flows gain `modParts: {label, value}[]` and `bonusParts` (e.g. STR 7, Blessed +2; STR ½ 4,
   Blessed +1). They're computed where `attackMod` is computed today, so the totals stay identical (regression tests).
2. **Live roll preview**: a selector `previewRoll(pending, draft)` → total, margin, tier, dice sum, damage, HP after,
   "N more for next tier", crit ×1.5. The **draft** (digits typed so far) lives in session state and is published to
   the TV.
3. **Statuses**: optional fields `source`, `fullDuration` (for pips), `appliedRound`. New commands `ADD_STATUS` /
   `UPDATE_STATUS` / `REMOVE_STATUS`, plus a small status library (the shipped spell riders + common conditions),
   each with an emblem + VFX key. A `statusExpired` event drives the "Blessed wore off" moment.
4. **Freeform turn order**: `REORDER_TURN`, `DELAY` (creature moves to a Hold list), `RETURN_FROM_HOLD` (drop it
   anywhere in the order), `SET_READIED {note}` / `CLEAR_READIED`. None of them ever block an action.
5. **Arrivals and timers**: `turn.arrivals` (template, count, round, note) and `turn.timers` (name, round, optional
   action such as a light-group toggle). At round start they fire an alert, and arrivals can enter placement. Shown in
   Active effects.
6. **Ambient 0–100**: `board.ambientLevel`; old saves migrate bright→100, dim→35, dark→0 (state version 2). The
   per-cell bright/dim/dark rule (who players can see) uses thresholds; the renderer gets the continuous value.
   Lights gain an optional `flicker`.
7. **Undo/redo** in `Store`: a stack of previous states (cap ~100) with a human label per command ("Henry → Guard #1,
   14 dmg"). Floating texts are not replayed.

### Phase 2 — Renderer (three.js) additions
- **Board overlay layer** (DOM, pinned to `unitPoint()` every camera change): HP pips, status emblems with pips, and
  names for the active creature and the target. It replaces the canvas chips in `overlay.ts`.
- **Status VFX** (in-engine, so the TV gets them for free): burning flames + embers at the feet, Blessed halo
  anchored to the sprite top, frost ring + tint, Shield of Faith bubble sized to the sprite, an Illuminated light
  shaft, and a generic family-coloured aura for any other status. Hidden for creatures in darkness on the TV.
- **Rings**: current turn (gold) and target (coral, pulsing).
- **Camera reframe**: `frameUnits(ids, keepClearRect)` eases the pan so the attacker and target land clear of the roll
  panel when a roll starts.
- Continuous ambient; Field-mode-only lamp pins and bright/dim radius rings.

### Phase 3 — DM screen (Glass)
- **Top-left:** round pill with the ambient readout. **Top-right:** Undo, TV, settings, **End turn (Space)**.
- **Left dock:** Field (G) plus tab shortcuts. **Active effects** panel beside it, collapsible (T). Clicking a row
  selects that creature; edit, extend and end-early live on the row.
- **Roll panel** (plates inside): fighters facing each other, the d20, formula chips (green/red for buffs/debuffs),
  the margin bar with MISS, die-shaped inputs, damage and HP after. **Hold Alt to peek**: the panel fades and lets
  clicks through.
- **Action bar**: Move F · Attack E · Cast C · Item R · Status S · ±HP H · Delay D.
- **Turn rail**: NOW card, past creatures, round divider, arrival ghosts, Hold pocket, drag-to-reorder
  (trackpad-friendly) plus Alt+←/→.
- **Auto-select + camera ease on every turn change.**

### Phase 4 — TV view
- The same components in a read-only mode: board, turn rail, roll panel while a roll is live (digits appear as you type),
  the selected party member's plate, status emblems/VFX. No dock, action bar, Active effects or controls.
- Sized for 1080p across a room (larger type scale; minimum text sizes checked in screenshots).
- Display filters (enemy HP exact/vague/hidden, names…) move out of the debug panel into Field ▸ TV.

### Phase 5 — Field mode
- Mode shell (G / dock), banner, dimmed fight, edits apply live.
- **Light tab, as designed:** ambient slider + presets, DM reveal, light list with group and single toggles, selected
  light editor (colour, bright/dim radius, flicker, delete), Place light (click a tile), Attach to creature, lamp pins
  and radius rings on the board.
- Height / Spawn / Terrain / Board / TV / History temporarily open the **existing** tools (elevation brush, Add Objects,
  theme/save/load, display options, undo list) until their designs are done.

### Phase 6 — Cleanup
- Make the new UI the default; delete the old sidebar/Manage tab and the battle part of `styles.css`.
- The debug panel stays behind `` ` ``, minus what moved to Field.
- Update e2e test IDs. Playwright can drive the installed Edge (`channel: 'msedge'`) instead of downloading Chromium, if
  you're OK with that config change.

**Done (2026-10-12).** Spotlight is the only battle screen and `/player.html` is the Spotlight TV; `?ui=next` is gone.
Deleted `battleScreen.ts`, `playerScreen.ts`, `panels/boardToolbar.ts` (camera helpers moved to `viewPrefs.ts`), the
old spell-picker / use-item / tie dialogs and ~290 lines of battle CSS. Carried over what only the old screen had: the
equipped weapon + ammo (action bar, click or Q to swap), camera angle / top-down / blur / glow for laptop and TV
(Field ▸ TV ▸ Camera), and a Spotlight tie sheet replacing the old tie modal. The e2e suite is rewritten for the new
test IDs and runs on the installed Edge on Windows (`PW_CHANNEL` overrides).

## Not designed yet (needed before or during Phase 3)
Cast picker (today a modal over the board), item use, area-spell multi-target d20 entry, initiative entry at battle start,
the tie order, the Status palette (S), the ±HP popover (H), the dying menu, and victory. Recommendation: a quick
mockup round for the four most-used ones (cast picker, status palette, ±HP, initiative entry) before Phase 3.

## Verification
- Engine: Vitest per rule (existing pattern), including "totals unchanged" regressions for the roll breakdown.
- UI: scripted Edge screenshots at 1536×960 @1.25 (DM) and 1920×1080 (TV) of the same arboretum scene, compared against
  the mockups; plus a live click-through in the browser pane.

## Answers (2026-10-11)
1. Undesigned screens: **design them while building**, list them at the end and ask for feedback.
2. TV: players **see the Active effects list**.
3. Reinforcements: **remind me and ask** whether to bring them in; if yes, roll their initiative and start placing them.
4. Delay: a creature dropped back into the order **keeps its new spot** in later rounds.
5. Fonts bundled with the app: OK · work on a branch and fast-forward main: yes · e2e tests on the installed Edge: yes.
