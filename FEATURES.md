# DnDSim (Cassandralis Combat Simulator) — Feature Inventory

Phase 1 deliverable. This is a complete inventory of what the JavaFX app **does today**, read from the code, not from intent. Every item cites `file:line` in the Java source (paths relative to the Java project root). The Java app is no longer in this repo; the last commit that has it, under `legacy-java/`, is `4df7b30`. Rules are numbered `R<area>.<n>` so the TypeScript tests can reference them one-to-one.

Where something looks buggy, unclear, dead, or inconsistent it is **flagged in §17** with what the code actually does. Nothing in §17 is guessed at; each row has a blank *Decision* column for you to fill in (preserve / fix) at this checkpoint.

Conventions used below:
- "Entity" = a party or non-party character wrapped around a `CharSheet` (`Objects/Entity.java`). "Enemy" = `Objects/Enemy.java`. "Terrain" = `Objects/TerrainObject.java`. "Pickup" = `Objects/Pickup.java`. "Unit" = Entity or Enemy.
- Attribute indices: STR=0, DEX=1, CON=2, INT=3, WIS=4, CHA=5 (`EntityRes/CharSheet.java:36-41`, `EntityRes/Status.java:19-24`).
- Distances are in **tiles**, never feet. Manhattan = |Δrow|+|Δcol|; Chebyshev = max(|Δrow|,|Δcol|).
- Java integer division truncates toward zero; `Math.floorDiv` floors. Both appear in the rules and are called out explicitly.

---

## 0. Summary of what exists (and what doesn't)

| Area | Exists today |
|---|---|
| Combat system | **Homebrew**, not 5e. Raw stat values are the modifiers. Margin-based damage tiers (T1/T2/T3). DM types physical dice. |
| Turn order | Initiative d20 + DEX, party typed / enemies random, Surprise/Normal/Ambush +100 bias, tie handling, rounds. No action economy, no turn enforcement. |
| Board | 1–25 × 1–25 grid, optional shape mask, three procedural floor themes, terrain objects, pickups. Teleport-style movement (no pathing). |
| Elevation | Per-cell integer 0..3, **visual only**. No pits, ramps, flying, or any rule effect. |
| Lighting / vision | **None.** No light sources, darkness, fog of war, line of sight, walls, hidden tokens. |
| Player display | Second-monitor window sharing in-process objects, with display filters (enemy HP, names, numbers, templates…). |
| Persistence | JSON per asset (characters, enemies, items, spells, terrain, presets, party list, UI prefs). **No battle/board save.** |
| Editors | Character sheets, enemy editor, asset editor (items/terrain/spells), spell editor. |

---

## 1. App structure, navigation, build

**R1.1 Entry.** `Main.java:6-16` (default package) → `AppController.initialize(stage)` then `show()`. Single main window titled "Cassandralis Combat Simulator", 1200×800 scene, min 800×600, starts maximized (`UI/AppController.java:49-63`). Window icon: crossed swords `#daa520` at 16/32/64 px (`UI/IconUtils.java:142-157`).

**R1.2 Views** (`UI/AppController.java`): `MainMenuView` (lazy, cached, `:209-215`), `CharacterSheetView` (lazy, cached, `refresh()` on each visit, `:217-230`), `AssetEditorView` (lazy, cached, `:270-276`), `BattleView` (new per battle; auto-starts party placement, `:240-259`). View switches replace the single root child with a 180 ms fade (`:300-311`, `UI/AnimationUtils.java:136-137`). `returnFromBattle()` clears the battle, sets the player window idle, goes to the menu (`:278-287`).

**R1.3 Navigation graph.**
- Main menu → "Start Battle System" → Battle Setup dialog → Start → `navigateToBattle(rows, cols, mask, theme)` (`UI/MainMenuView.java:138-141`).
- Main menu → "Character Sheets" / "Asset Editor".
- Battle → Manage → "Character Sheets" (`UI/Battle/BattleView.java:1344-1348, 1684-1686`). Sheets "Back" returns to the active battle if any, else menu (`UI/CharacterSheetView.java:917-925`).
- Battle "End" → confirm → Victory overlay → Continue → menu, or straight to menu (`BattleView.java:1688-1733`). There is no other way out of a battle.

**R1.4 Main menu** (`UI/MainMenuView.java`): title with `#569cd6` glow (`:27-34`); subtitle "v4.7.2891-BETA.r38291.mil.gov.cass // BUILD 2170.11.07.1943-SEC3" (`:36-38`); three 300×200 buttons (Start Battle System / Character Sheets / Asset Editor, `:49-60, 114-132`); "Two Display Mode" toggle with ON/OFF badge + gear button opening the player display settings (`:69-112`). Enabling with one monitor shows an info alert (`AppController.java:186-199`).

**R1.5 Fullscreen & DPI.** F11 toggles fullscreen on the DM window; exit key disabled; hint text "Press F11 to exit full screen" (`AppController.java:65-73`). Monitor/DPI changes re-fit the window after a 300 ms debounce (`:75-85, 96-120`).

**R1.6 Build/launch.** No build tool. `.vscode/launch.json` has two identical "Main" configs + "Current File"; `.vscode/settings.json` references the four jars in `lib/` (gson 2.10.1, ikonli core/javafx/materialdesign2 12.4.0). `DnDSim.iml` declares only gson. **JavaFX is not in the repo** and is unpinned. Code needs Java 16+ (records at `UI/Battle/SpellPickerDialog.java:29`, pattern `instanceof`) and JavaFX 19+ (`ObservableValue.map` at `BattleView.java:1262, 1265`). All resource paths are relative to the working directory (`UI/StyleUtils.java:12-13`, `saves/...`, `resources/sprites/...`). `.gitignore` covers `*.class` and `/bin/` only; `tools/__pycache__/*.pyc` is committed.

---

## 2. Battle screen: top strip (timeline) and battle controls

Layout: `UI/Battle/TimelinePane.java:63-115` — fixed height 136 px; left column 160 px with clock icon (`#b8860b`) + phase label; the rest a horizontal, pannable, scrollbar-less strip of combatant cards (wheel scrolls sideways, `:102-109`).

**R2.1 Phase label.** "Setup" when no turn order (`:328`), "Initiative" during inline initiative entry (`:191`), "Round N" once started (`:394`).

**R2.2 Begin / End toggle** (`BattleView.java:1250-1273`): "Begin" (play icon, `button-primary`) before the battle; "End" (stop icon, `button-danger`) during. Disabled during party placement (`:1255`).

**R2.3 Begin flow** (`BattleView.java:1429-1458`):
1. Ignored if initiative entry already open.
2. If `grid.getEntities()` is empty → warning "No Entities": "Please add at least one entity before beginning battle." (A board with only enemies cannot start.)
3. If no **party** member is on field → commits immediately with no typed rolls (`:1441-1445`).
4. Otherwise the strip switches to inline initiative entry (`TimelinePane.java:185-271`): one card per party member (44 px portrait in green ring, name, `−` / text field prefilled "10" (0–2 digits) / `+`, both clamp 1–20 `:274-283`), then **Begin** (enabled only when every field parses 1–20) and **Cancel** (back to roster). Focus starts in the first field; Enter does nothing.

**R2.4 Commit** (`BattleView.java:1472-1496`): `battleStarted=true`; round-start mode locked in from the toggles; `TurnManager.calculateInitiativeOrder(rolls)`; **ON_TURN_START abilities fire for the first combatant if it is an Entity** (no `procStatus`, see §17 F-3); pending party ties open the tie dialog; strip + canvas refresh.

**R2.5 Next** (`BattleView.java:1275-1283, 1498-1503`): "Next" with fast-forward icon, tooltip "Next turn", disabled until started and during placement. Calls `TurnManager.nextTurn()` (§8).

**R2.6 Surp / Norm / Amb** (`BattleView.java:1288-1331`): three `ToggleButton`s in one group, classes `hotbar-tab round-start-toggle`; tooltips "Surprise: party acts first" / "Normal: standard initiative order" / "Ambush: enemies act first"; Norm selected by default; the group can never have nothing selected; **all three disabled once the battle starts** (bound to `battleStarted`). Read at commit via `roundStartModeFromSlider()` (`:1328`, name is a leftover from an older slider). Mechanics are in R8.3.

**R2.7 End flow** (`BattleView.java:1688-1717`): confirmation "Confirm End Battle" / "End battle? Party entity states will be saved." → `battleStarted=false` → every party sheet on the board is saved → `isVictory = grid.getEnemies().isEmpty() || enemiesDefeated > 0` → Victory overlay (§4.11) or straight to the menu. The battle never ends automatically.

**R2.8 Combatant cards** (`TimelinePane.java:515-599`): VBox min width 64, class `timeline-entity`; current combatant gets `timeline-entity-current` (gold) + `#b8860b` glow (`:491-513`). Portrait 44 px in a 50 px ring, stroke 2.5: `#4CAF50` party, `#d75f5f` enemy, `#808080` other (`:153-164`); portrait = sprite first frame or fallback avatar (colored circle with green/red border, `UI/SpriteUtils.java:295-313`). Bold name; mini HP bar 70×7 colored success >50% / warning >25% / danger (`:366-369`), 300 ms animated; HP text `cur/max` with no spaces (`:372`). Hover tooltip (DM only, 200 ms): `name\nInitiative: N (d20: X + DEX: Y)` (`:586-594`), surprise bonus stripped (`TurnManager.java:212-217`). Click: nothing. Drag: pans the strip. No drag-to-reorder.

**R2.9 Roster before battle** shows only party members on field (`:312-343`); empty text "No combatants on field. Add objects to begin." (`:332`). During battle: full turn order; a full rebuild slides cards in with a 50 ms stagger (`:416-453`), otherwise only the highlight moves (`:455-489`).

**R2.10 Player-view strip**: no tooltips; enemies renamed "Enemy", "Enemy 2"… when `enemyNames` is off (`:536, 602-612`); enemy HP exact / bar-only / hidden per option; party HP numbers optional (`:552-564`). See §13.

---

## 3. Battle screen: right panel

Container (`BattleView.java:157-214`): tab header with ToggleButtons **"Battle"** (swords) and **"Manage"** (gear), class `hotbar-tab`, one always selected. Column width animates 220 ms: 185 px Battle, 275 px Manage, 220 px while the dice panel shows (`:55-58, 1399-1427`). The dice panel replaces the active tab while active.

### 3.1 Battle tab — "Selected" panel (`BattleView.java:650-804`)

| Control | Code | Behaviour |
|---|---|---|
| Header "Selected" | `:661` | |
| Name label, default "--" | `:664-667` | Selected unit's display name (enemies: `Base #N`) |
| "Health" label | `:670` | |
| Health `−` | `:676-679` | HP −1, clamped to [0, max], **saved to disk** for Entities (`:1159-1178`) |
| Health bar 100×20 with "cur / max" text | `:684-692` | **Click or drag anywhere on the bar sets HP to that fraction of max**, live; release commits (`:1083-1113`) |
| Health `+` | `:695-698` | HP +1, clamped |
| "Stats" label | `:703` | |
| Stat rows AC / STR / DEX / CON / INT / WIS / CHA | `:706-712`, `createStatRow :811-855` | Colors: AC `#FFD700`, STR `#d75f5f`, DEX `#4CAF50`, CON `#2196F3`, INT `#FF9800`, WIS `#4ec9b0`, CHA `#c586c0`. `−`/`+` step the **battle-only adjustment** by 1; the value label is green when raised, red when lowered (`:1034-1038`). **Horizontal drag on the value** changes it faster: 4 px dead zone then 8 px per point (`:1115-1147`). STR/CON/INT/WIS/CHA rows hidden unless the selection is a party Entity (`:913-918`); enemies show AC and DEX only. |
| "MOB: --" | `:719-721` | Movement range in tiles (R5.6 / R5.13) |
| "Weapon" label + name | `:725-732` | Party: primary weapon name or "None"; ranged weapons show " (xN)" compatible-ammo count (`:1059-1076`). Enemy: "ATK: <attack mod>" (`:996`) |
| Swap button (UNDO icon over "Q") | `:734-736` | Swaps primary/secondary weapon, saves the sheet, **clears all dice overrides** (`BattleGridCanvas.java:1181-1191`). Enabled only for a party Entity once started |
| "Damage Dice" label | `:742` | |
| T1 / T2 / T3 rows with `−`/`+` | `:745-747`, `:1220-1246` | Step that tier's die along `d4 → d6 → d8 → d10 → d12 → d20`, clamped at both ends. Sets a **battle-only `diceOverride`** (`Objects/Entity.java:120-140`, `Objects/Enemy.java:244-256`). Label green/red vs the weapon's real die (`:1044-1049`). No drag. |
| Separator, header "Actions" | `:749-752` | |

Shown values: AC = R5.4; stats = total attribute + battle adjustment (R5.3). All adjustments are **not persisted** (`Entity.java:12-14`, `Enemy.java:28-30`).

### 3.2 Battle tab — Actions grid (`BattleView.java:756-793, 861-875`)

Four 56×56 buttons in a 2×2 grid plus Cast spanning both columns at 120×56. Each shows a 20 px icon (`#dcdcdc`) over its key letter (9 px, `#909095`).

| Pos | Icon (MDI2) | Key | Style | Calls | Behaviour (R-ref) |
|---|---|---|---|---|---|
| 0,0 | `ARROW_ALL` | **F** | `button-success` (green) | `startMoveMode()` | Move (R9.1) |
| 0,1 | `TARGET` | **E** | `button-danger` (red) | `startAttackMode()` | Attack (R6.1) |
| 1,0 | `FLASK` | **R** | `button-accent` (gold) | `triggerUseItemForSelected()` | Use consumable (R6.14) |
| 1,1 | `HAND_BACK_RIGHT` | **P** | `button-earth` (brown) | `startPickupMode()` | Pick up an item (R9.6). Not a general "interact". |
| 2,0-1 | `AUTO_FIX` (wand) | **C** | `button-arcane` (purple) | `startCastMode()` | Spell picker then targeting (R7.x) |

**R3.1 Enablement** (`updateSelectedEntity`, `BattleView.java:897-1028`): party Entity → all five enabled only once the battle has started; Cast additionally needs `SpellPickerDialog.castableSpells` non-empty. Enemy → Move and Attack only. Nothing selected → all disabled and fields reset to "--". Non-party Entities get no action buttons. Selecting a unit gives the canvas keyboard focus (`:1025-1027`). **There is no turn enforcement: any unit can act at any time** once started.

**R3.2 Keyboard vs buttons**: on the keyboard F/E/C/P **toggle** their mode off when pressed again (`BattleGridCanvas.java:587-666`); the on-screen buttons always start the mode.

### 3.3 Manage tab (`BattleView.java:1334-1381`)

- Header "Manage".
- **"Character Sheets"** (person icon) → sheets screen.
- **"Add Objects"** (plus icon) → slides the Add Objects drawer (§4.3). Disabled during party placement.
- **"Long Rest (Spell Slots)"** (night icon, `button-arcane`), tooltip "Restore all spell slots for every party member on the board" → `longRest()` for every party caster on the board, floats "Rested" (`#b9a8f5`); if none: info "Long Rest" / "No party spellcasters are on the board." (`:1383-1396`).
- Separator; **"Board Theme"** label + ComboBox `stone` / `grass` / `dirt`, tooltip "Board texture theme"; re-themes the board and the player view immediately.

---

## 4. Dialogs and panels reachable from the battle screen

### 4.1 Battle Setup (grid shape) dialog — `UI/GridSetupDialog.java`
Modal "Battle Setup", 780×560, not resizable (`:67-89`). Header "Choose a battle grid shape and size".
- Left rail ToggleButtons with drawn glyphs (`#569cd6`): **Rectangle, Circle, Diamond, Plus, Custom, Presets** (`:297-339, 444-488`).
- Center: 320×320 preview (`:45, 421-442`; background `#2d2d30`, cells `#464648` inset 1 px, cell = min(w/cols, h/rows), centered).
- **Custom**: paint canvas — press toggles the first cell; drag paints that same value onto each new cell (`:229-254`). **Clear**, **Fill All**, "Preset name" field, **Save Preset** (`button-success`, disabled until a name is entered) (`:143-161, 255-262`).
- **Presets**: cards with star icon, name, 120 px thumbnail, "R x C", **Use**, **Delete** (confirm "Delete Preset" / `Delete "<name>"?`); empty text "No saved presets yet - paint a shape and save it to see it here." (`:265-294, 377-405`).
- Right: "Rows"/"Cols" spinners 1–25, default 8 (`:43-44, 110-111, 173-190`; in Custom mode changing either **wipes the painted mask**); "Theme:" combo stone/grass/dirt default stone (`:192-196`); "N playable tiles".
- Bottom: **Start** (`button-primary`) / **Cancel**. Start returns `{rows, cols, mask (null = rectangle), themeName}` (`:50-62`) → `AppController.navigateToBattle` (`:240-259`), which immediately begins party placement (`:252`). **No validation**: a custom mask with 0 playable tiles can start.

**R4.1 Shapes** (`UI/Battle/GridShapes.java`): `enum ShapeType { RECTANGLE, CIRCLE, DIAMOND, PLUS, CUSTOM }` (`:10`); RECTANGLE and CUSTOM return a `null` mask from `forType` (`:15-23`). Each cell is tested at its center `(r+0.5, c+0.5)`:
- CIRCLE (`:26-41`): `nr=(r+0.5−rows/2)/(rows/2)`, `nc=(c+0.5−cols/2)/(cols/2)`; keep if `nr²+nc² ≤ 1+1e-9`.
- DIAMOND (`:44-59`): same normalisation; keep if `|nr|+|nc| ≤ 1+1e-9`.
- PLUS (`:62-76`): `thickness = max(1, round(min(rows,cols)/3f))`; bars start at `(rows−thickness)/2` and `(cols−thickness)/2`.
- `enabledCount` treats a null mask as `rows*cols` (`:79-88`).

**R4.2 Presets** (`UI/GridShapePreset.java:6-9`, `UI/GridShapePresetDatabase.java`): `{name, rows, cols, mask}`; saved as `saves/gridshapes/<name, non-alphanumerics → _>.json` (`:18, 60`; folder does not exist yet); delete removes the file (`:72-78`).

### 4.2 Party placement (automatic) — `BattleView.java:270-335`
Party members placed one at a time in `party.json` order. Board banner "Place <name> - click a tile" (Consolas 15 bold, `BattleGridCanvas.java:2140-2173`). Standable cells tinted `rgba(90,170,230,0.20)` (`:1884-1895`). Clicking a non-standable cell floats "Occupied". **Cannot be cancelled or skipped**; Begin and Add Objects stay disabled until every member is placed (`:1255, 1355`).

### 4.3 Add Objects drawer — `BattleView.java:518-648, 1735-1899`
Slides in from the right over 220 ms, 275 px, classes `hotbar sidebar-panel`; title "Add Objects" + close X. Category ToggleButtons (one always selected):

| Category | Icon | Cards from | Badge | Card tooltip |
|---|---|---|---|---|
| Party | `ACCOUNT_GROUP` | every loaded sheet with `isParty` true **not on the field** (not limited to `party.json`) (`:1738`) | "cur/max" `#4CAF50` | `Name\nClass: X\nHP: a / b` |
| Enemies | `SKULL` | every file in `saves/entities/enemies/` | "HP N" `#d75f5f` | `Name\nHP: n   ATK: n   MOB: n` |
| Terrain | `MAP` | `TerrainDatabase` | "HP N" `#8a8a8a` | `Type\nHP: n` |
| Pickups | `TREASURE_CHEST` | weapons, accessories, consumables only | WPN `#e6b23c` / ACC `#569cd6` / USE `#4CAF50` | e.g. `Name (Weapon)\nDMG: …` |
| **Elevation** | `FLAG` | three fixed cards | "+1" / "-1" / "0" | see R10.3 |

Cards 72×84 (`hotbar-card` / `hotbar-card-selected` gold border, lift on hover). Click selects; click again deselects. Party cards place one member then stop; enemy/terrain/pickup cards keep placing until deselected. Status label (10 px, 40 px tall) messages: "Click items to add them to the battlefield", "Selected: X (click grid to place, click same item again to deselect)", "Placed: X (still placing Y)", "Deselected: X", "Placement cancelled", "<Raising|Lowering|Flattening> tiles - click tiles on the grid (ESC to finish)", "Elevation editing finished", "Place <name> - click on a tile", "All party members placed"; empty category: "Nothing available in this category". Closing the drawer cancels placement and the elevation brush.

**R4.3 Placement rules** (`BattleView.java:433-511, 1735-1829`; `BattleGridCanvas.java:1484-1525`): units need `canUnitStand` (R9.3); terrain and pickups need an enabled, empty tile (`:1513-1515`). Placed enemies get a per-battle instance number and are named `Base #N` starting at #1 (`:1779-1781`, `Enemy.java:270-275`). **Enemies roll initiative at placement**, even before Begin; a floating "d20 N" appears (gold on 20, otherwise `#6ec6ff`) (`:1652-1668`). See §17 F-20 for the click-precedence bug that blocks placing on walk-through terrain.

### 4.4 Initiative Tie dialog — `BattleView.java:1520-1597`
Title "Initiative Tie"; header "These party members tied for initiative.\nClick to set turn order (first click goes first):"; "Initiative Roll: N" in bold blue; one 200 px button per tied member (click → renamed "k. Name" and disabled); **Reset**; OK (disabled until all ordered) / Cancel. Cancel keeps the random order and the dialog reopens at the start of each new round (R8.6).

### 4.5 Dice Roll panel — `UI/Battle/DiceRollPanel.java`
Replaces the sidebar tab; width 200–230; classes `card card-gold`. States: `HIDDEN, D20_ROLL, SAVE_ROLL, AREA_ROLLS, RESULT_MISS, DAMAGE_ROLL, COMPLETE` (`:32-40`). The DM types physical results; every input has a slider.

| Entry point | Flow |
|---|---|
| `startAttack` (`:304`) | info "STR: +3 \| AC: 12" → d20 (1–20) → MISS (OK) or HIT / CRITICAL HIT with "TIER N" → one field per die (1..faces) → Confirm |
| `startSpellAttack` (`:357`) | same, info "Spell atk: +N \| AC: n" |
| `startSavingThrow` (`:370`) | info "DC n \| DEX save +m" → target's d20 → SAVED / SAVED - HALF / FAILED SAVE + tier → dice |
| `startHeal` (`:385`) | straight to heal dice ("HEALING") |
| `startAutoHit` (`:404`) | straight to tier-3 dice ("AUTO-HIT") |
| `startAreaSpell` (`:450`) | one d20 per target ("Attack d20 per target:" / "Each target's d20 save:") with **"Auto-roll empty"** (tooltip "Fill every empty d20 with a random roll"), per-row result (Miss / T2 / Crit T3 / Saved / Half) → shared dice; AUTO/HEAL areas go straight to a shared roll |

UI text: "Attacker: --" / "Caster: …", "Target: --" / "Targets: N in <area>"; prompts "Enter d20 roll:", "Enter spell attack d20:", "Enter target's d20 save:", "Enter damage rolls:", "Enter heal rolls:", "… (halved):", "… (shared):"; "Roll: 2d6 + d10  +N dmg" with the bonus colored green/red/grey; banners MISS, HIT, CRITICAL HIT, SAVED, SAVED - HALF, FAILED SAVE, HEALING, AUTO-HIT, ALL MISSED, ALL SAVED, "k/n HIT", "k/n AFFECTED" (`:779-788`); tier pill "TIER N" / "ROLL FOR TIER N"; buttons Roll/OK/Confirm (one button, label changes) and Cancel. Errors flash 1.5 s: "Please enter the d20 roll", "d20 must be 1-20", "Invalid number", "Please enter all dice rolls", "dN must be 1-M", "Enter a d20 (1-20) for every target". Enter submits or moves to the next field (`:213, 536-539, 843-850`). Die faces d4/d6/d8/d10/d12/d20; **any other die string is treated as 6** (`:879-889`). Only single-die strings ("dN") are supported. Cancel → `onCancel` (nothing consumed/spent, R6.9, R7.9).

### 4.6 Cast a Spell dialog — `UI/Battle/SpellPickerDialog.java:33-157`
Title "Cast a Spell"; buttons **Cast** / Cancel. Header: caster name; "Spell DC N   |   Spell attack +N   |   <STAT>"; slot pips "Lv1 ●●○○" or "No spell slots (cantrips only)" (`:171-202`). List 440×300: icon in spell color, name, summary, level badge ("Cantrip" / "Level N", " · no slots" greyed when uncastable). Description label. "Cast with slot:" combo "Level N  (r/m left)" (hidden for cantrips). **Edit Spell** (pencil, disabled until a spell selected) → Spell Editor. Double-click casts. `castableSpells` = known spells that are cantrips or have a slot of level ≥ spell level remaining (`:107-155, 224-230`; it does not check `isCaster`, §17 F-33).

### 4.7 Spell Editor dialog — `UI/SpellEditorDialog.java` (shared with sheets and asset editor)
Modal 460×720, "Add Spell" / "Edit Spell - <name>". Rows (`:137-171`): Name; Color; "Level (0 = cantrip)" 0–9; School; Description; Resolution ATTACK/SAVE/AUTO/HEAL/BUFF (tooltip); Targets ENEMY/ALLY/SELF/ANY; "Range (tiles)" 0–30 (relabelled "Range (0 = on you)" for bursts); Area NONE/BURST/CONE/LINE; "Area Size (tiles)" 1–20 (relabelled "Burst Radius" / "Length (tiles)"); "Also hits allies (and you) in the area"; Save Stat; "On Successful Save" NONE/HALF; **Damage**: Tier 1/2/3 Die ("-" = none; tier 1 relabelled "Heal Die:" for HEAL), "Flat Bonus" −20..50, "Upcast Die (per lvl)", "Add casting modifier to the total"; **Status Effect**: "Applies a status effect", Status Name, Effect (types 1–6), Magnitude −99..99, "Duration (turns)" −1..99 (a 0 is turned into 1, `:264`; 2 = "until the end of the target's next turn", `:128-129`), Stat, "Min Tier to Apply" 1–3; live preview "Tier 1: d10 + 3 …". Rows show/hide by resolution and area (`:173-218`). Save/Create is the default button; validation alerts "Missing Name", "Duplicate Name", "Buff Needs an Effect".

### 4.8 Use Item flow — `BattleGridCanvas.java:721-864`
No consumables → warning "No Items" / "No consumable items in inventory." Otherwise ChoiceDialog "Use Item" / "Select an item to use:" with entries "Name (xQty)", then the **"Item Efficacy Roll"** dialog: header "Roll d10 for <name> efficacy", "Base healing: N HP", "Roll determines efficacy (1=10%, 10=100%)", a 1–10 slider linked to a text field (prompt "Enter d10 roll (1-10)"), preview "Heals X HP (Y% efficacy)" / "Enter 1-10"; OK enabled only for 1–10. Mechanics R6.14.

### 4.9 Board info popup — `BattleGridCanvas.java:387-543`
Hover a unit 1 s → popup (class `info-popup`, 160 px): name, "HP: x / y", "AC: n", "MOB: n", "DMG: d6/d6/d10". **Right-click** on a unit pins it and adds **Delete** (`button-danger`) which removes the unit from the board and the turn order (`:526-543`). Left-click elsewhere closes. Terrain and pickups have no popup and **cannot be deleted** (`:375`).

### 4.10 Player display settings dialog — `UI/PlayerDisplaySettingsDialog.java`
Title "Two Display Mode Settings"; heading "What the players can see"; note "Changes apply to the player screen immediately." Enemy health chips Exact / Vague / Hidden with descriptions; checkboxes "Party HP numbers" (on), "Damage & healing numbers" (on; off → "Hit!", "Crit!", "Healed"), "Status effect names" (on), "Enemy initiative rolls" (off), "Enemy names" (on), "Turn order strip" (on), "Area spell aiming" (off) (`:26-86`); **Done**. Semantics in §13.

### 4.11 Victory overlay — `UI/Battle/VictoryView.java`
90% black overlay, 400 ms fade + 0.8→1 scale (500 ms). "Victory!" 48 px `#FFD700` pulsing glow between two gold shields; a random Latin quote from 10 (`:31-42`, Georgia italic `#c0a060`); gradient separator; "Party Status" rows for **party Entities still on the board**: 32 px sprite, name, HP bar (success/warning/danger) "cur / max", status tags ("OK" green or up to three 3–4 letter uppercase abbreviations colored by effect type, "+N" if more) (`:189-316`); **Continue** (`button-primary`, play icon) → menu. The player window shows the same overlay without Continue (`UI/PlayerWindow.java:278-283`).

### 4.12 Floating board text — `BattleGridCanvas.java:2229-2284`
"Occupied", "Out of range", "No targets", "Miss", "Saved", "-N" (`#ff7b6b`, gold `#FFD700` on a natural 20), "+N" (green), "Rested", "d20 N", status names. Consolas bold `max(12, cs×0.30)`, rises `0.6` cell over 900 ms, alpha 1 until 70% then fades. Only the `GridObject` overloads are mirrored to the player canvas; tile-anchored texts ("Occupied", "Out of range", "No targets") are not (`:2237-2253`).

---

## 5. Stats and derived values

### 5.1 Entity (CharSheet) — `EntityRes/CharSheet.java`, `Objects/Entity.java`

**R5.1 Stored fields** (`CharSheet.java:11-62`): `name`, `characterClass` (cosmetic), `color`, `isParty`, `spritePath`, `group` (OMEGA/ALPHA/NPC/null; roster filtering only), `level` (min 1 via `getLevel()`, `:198-200, 1062-1064`), `totalHP` (max), `currentHP` (unclamped setter `:245-248`), `armorClass` (default 10; a legacy 0 reads as 10, `:74, 1066-1068`), `status[]`, `baseAttributes[6]`, `weapons[2]` (primary, secondary), `accessories[3]`, `inventory`, `wallet`, `abilities[]`, `spellcastingStat` (null = not a caster), `knownSpells` (names), `spellSlotsUsed[9]`.

**R5.2 Battle-only fields** on `Entity` (`Entity.java:12-14`, never saved): `acAdjustment`, `statAdjustment[6]`, `diceOverride[3]`.

**R5.3 Attribute totals** (`CharSheet.java:461-492`):
- `tempAttributes[i] = Σ accessories[0..2].modifiedAttributes[i] + weapons[0].modifiedAttributes[i]` (**primary weapon only**; arrays shorter than 6 are padded via `normalizeAttributeArray`).
- `statusMod(i) = Σ magnitude of statuses with effectType ∈ {STAT_MODIFIER, MOVEMENT_MODIFIER} and targetAttribute == i`.
- `totalAttributes[i] = base[i] + temp[i] + statusMod(i)`.
- Adjusted (used by all combat math): `total[i] + statAdjustment[i]` (`Entity.java:57-59`).
- **There is no (score−10)/2 conversion, no proficiency bonus, no temp HP.** The raw number is the modifier. Shipped values are 1–12.

**R5.4 AC** = `armorClass + Σ accessory.defense + Σ AC_MODIFIER status magnitudes + acAdjustment` (`Entity.java:26-28`, `CharSheet.java:666-672, 1002-1004`).

**R5.5 Attack modifier** = `adjusted[weapon.statType] + Σ ATTACK_MODIFIER statuses`; unarmed uses STR (`Entity.java:64-73`). Weapon stat via `Weapon.getStatIndex()` (`EntityRes/Weapon.java:81-88`; unknown strings fall back to STR).

**R5.6 Movement (MOB)** = `max(0, 1 + trunc((adjDEX + 1) / 2) + Σ MOVEMENT_MODIFIER statuses with targetAttribute < 0)` (`Entity.java:142-145`, `Status.java:74-81`). Java int division: `(−2+1)/2 = 0`, `(−3+1)/2 = −1`.

**R5.7 Initiative modifier** = adjusted DEX (`TurnManager.java:147-154`).

**R5.8 Saves** = adjusted attribute of the save stat (`Entity.java:91-93`).

**R5.9 Casting** (`Entity.java:76-88`): casting mod = adjusted[casting stat] if caster else 0; spell attack = casting mod + Σ ATTACK_MODIFIER; spell save DC = `10 + casting mod` (`SPELL_DC_BASE = 10`, `CharSheet.java:59`). Sheet-only versions at `CharSheet.java:894-900` omit battle adjustments.

**R5.10 Damage dice** (`Entity.java:98-118`): per tier `diceOverride[i] ?? weapon.damageDice[i]`; **unarmed default `d4/d4/d4`** (`:112`); a weapon with a null array gives `d4/d4/d6` (`Weapon.java:20, 30, 67`). Legacy flat `damage` converts: ≤3 → d4/d4/d6, ≤6 → d6/d6/d8, ≤10 → d6/d6/d10, else d8/d8/d12 (`Weapon.java:50-55`).

**R5.11 Stat budget** (display only): available `27 + (level−1)×2`, spent = Σ base (`CharSheet.java:212-230`); over budget shows red "(Over by N)" (`UI/CharacterSheetPane.java:1450-1453`). Not enforced. New-character defaults HP 20, AC 10, STR 5, DEX 5, CON 5, INT 5, WIS 4, CHA 3 (`UI/CharacterSheetView.java:957-987`). Sheet spinner ranges: attributes 0–99, AC 0–99, current HP 0–9999, max HP 1–9999, level 1–99 (`CharacterSheetPane.java:204-256, 481-602`). Level only affects the budget, spell slots and cantrip scaling; HP never derives from CON or level.

### 5.2 Enemy — `Objects/Enemy.java`

**R5.12 Fields** (`:17-38`): `name`, `health`, `maxHealth`, `mobility`, `armorClass`, `damageDice[3]`, `dexterity`, `attributes[6]` (saves; DEX slot ignored), `tags`, `color`, `spritePath`, `instanceNumber`, `baseName`; transient `statuses`, `acAdjustment`, `dexAdjustment`, `diceOverride`; legacy `attackDamage`.

**R5.13 Formulas**:
- AC = `(armorClass ≤ 0 ? 10 : armorClass) + acAdjustment + Σ AC_MODIFIER` (`:78-82`).
- Attack mod = `dexterity + dexAdjustment + Σ ATTACK_MODIFIER` (`:122-124`).
- Initiative = `dexterity + dexAdjustment` (`:285-287`).
- Movement = `max(0, mobility + Σ MOVEMENT_MODIFIER(targetAttribute < 0))`; DEX adjustments never change movement (`:258-260`).
- Save(i) = `(i == DEX ? dexterity + dexAdjustment : attributes[i]) + Σ STAT_MODIFIER statuses targeting i` (`:153-162`). **Missing/short `attributes` → every save defaults to `dexterity`** (`:126-134`). STAT_MODIFIER statuses on enemies affect saves only.
- `setHealth` clamps to [0, max] (`:330-332`); `takeDamage` floors at 0 (`:334-337`); dead = `health ≤ 0` (`:339`).
- Default dice `d4/d4/d6` (`:60, 232`); legacy `attackDamage` → ≤2 d4/d4/d4, ≤4 d4/d4/d6, ≤6 d6/d6/d8, else d6/d8/d10 (`:68-73`).

**R5.14 Enemy capabilities**: Move and Attack only (no items, spells, swap, pickup). Tags (`PREDEFINED_TAGS = Boss, Beast, Undead, Humanoid, Dragon, Construct, Elemental`, `:15`; custom tags in `saves/enemy_tags.json` via `EntityRes/EnemyTagRegistry.java`) are **browser filtering only**, no mechanics. No multiattack, legendary actions, abilities, spells, or level. Editor ranges: HP 1–9999, Mobility **1**–99, AC 0–99, DEX −10..99, saves −10..99, dice d4..d12, d20 (`CharacterSheetView.java:1146-1208`).

### 5.3 Terrain — `Objects/TerrainObject.java`
**R5.15** Fields `type`, `health`, `color` (hex or legacy int index), `collision` (default true), `entityAboveTerrain` (default true; only matters when collision is off), `spritePath`, `row`, `col` (`:7-14`). Flat **AC 10** when attacked (`UI/Battle/CombatManager.java:120-121`). `takeDamage` unclamped; destroyed when `health ≤ 0`; `onDestroyed()` is an empty hook (`:122-144`). No saves, no statuses.

### 5.4 Item abilities — `EntityRes/ItemAbility.java`, `CharSheet.java:377-456`
**R5.16** Fields `{name, description, triggerType, effectType, magnitude, targetAttribute, statusName?, abilityType}`. Triggers `PASSIVE, ON_TURN_START, ON_HIT, ON_EQUIP, ON_DAMAGED` (`ItemAbility.java:10-14`); effects `HEAL, DAMAGE, STAT_BOOST, STATUS` (`:17-20`); types `PASSIVE, ACTIVE, SPECIAL` (`:26-28`). **Only `ON_TURN_START` is ever invoked.** `processEquippedAbilities(trigger)` runs innate abilities, then **both** weapon slots, then all accessories (`CharSheet.java:377-415`). Effects (`:420-456`): HEAL heals `min(magnitude, max−cur)` (nothing at full HP); DAMAGE sets `HP = max(1, HP − magnitude)`; STAT_BOOST is a no-op; STATUS adds `Status(statusName, NONE, 0, 1, −1)`. The ability *type* is never filtered (§17 F-28).

---

## 6. Combat math: attacks, damage, items

### 6.1 Weapon attack — `CombatManager.java`, `DiceRollPanel.java`, `BattleGridCanvas.java`

**R6.1 Starting an attack**: select a unit, press E / Attack (needs `battleStarted`). A party Entity whose primary weapon is ranged and has no compatible ammo gets warning "No Ammunition" / "No <ammoType> ammo in inventory!" and the mode does not start (`BattleGridCanvas.java:703-719`). Otherwise **every other Entity, Enemy and Terrain object on the board is a legal target** — same side included, enemies may attack enemies — highlighted `rgba(215,95,95,0.22)` with a 0.75 outline (`:1936-1999, 1670-1718`). **No range, reach, or line-of-sight check of any kind.** Clicking an empty cell cancels.

**R6.2 Margin and tier** (`CombatManager.java:32-45`): `margin = d20 + attackMod − targetAC`. `margin < 0` → miss; `0–4` → tier 1; `5–7` → tier 2; `≥ 8` → tier 3. Meeting AC exactly hits.

**R6.3 Dice per tier** (`CombatManager.java:55-72`): tiers are **cumulative** — tier 1 rolls `[T1]`, tier 2 `[T1, T2]`, tier 3 `[T1, T2, T3]`. Null tiers are skipped. A null array or one shorter than 3 becomes `d4/d4/d6`.

**R6.4 Critical** (`DiceRollPanel.java:928-933`): a **natural 20 that hits** multiplies the dice sum: `ceil(sum × 1.5)`. Nat 20 is **not** an auto-hit; nat 1 is **not** an auto-miss; a crit does not raise the tier.

**R6.5 Flat bonus** (`DiceRollPanel.java:312`): `damageBonus = floorDiv(attackMod + 2, 2)` (mod 5 → +3, 0 → +1, −1/−2 → 0, −3 → −1). `attackMod` includes ATTACK_MODIFIER statuses, so Bless +2 also adds +1 damage.

**R6.6 Damage total** (`DiceRollPanel.java:891-944`): `dmg = Σ entered dice; if nat20: dmg = ceil(dmg×1.5); if any dice: dmg = max(0, dmg + bonus)`. Applied on hit (`BattleGridCanvas.java:1745-1754`); floating "-N" (gold on nat 20) or "Miss".

**R6.7 Attack modifier source**: Entity R5.5; Enemy R5.13. The dice panel's info line uses `getStatTypeName`, which returns "STRENGTH" for non-Entities, so enemy attacks display "STR" though they use DEX (`CombatManager.java:220-228`, §17 F-9).

**R6.8 Ammo** (`Weapon.java:104-106`, `Ammunition.java:58-67`, `CombatManager.java:235-283`): a weapon is "ranged" iff `ammoType` is non-empty. There are no other weapon properties (no finesse, versatile, reach, range). Compatibility: `"Any"` on either side, else case-insensitive equality of `ammoType`. **One round is consumed hit or miss**, not on cancel (`BattleGridCanvas.java:1743`). Enemies never use ammo. `Ammunition.isCompatibleWith` reads the raw `ammoType` field; legacy ammo holding only `compatibleWeaponType` is never compatible (§17 F-16).

**R6.9 Cancel**: nothing consumed, nothing applied (`DiceRollPanel.java:972-975`).

**R6.10 Not implemented** (grep finds nothing): advantage/disadvantage, cover, opportunity attacks, damage types, resistance/vulnerability/immunity, proficiency, concentration, exhaustion, conditions beyond the status effects in §7.

### 6.2 Damage, death, healing

**R6.11 Taking damage**: `Entity.takeDamage` subtracts with **no clamp** and saves the sheet (negative HP is written to disk) (`Entity.java:179-182`). Enemy floors at 0 (R5.13). Terrain unclamped.

**R6.12 Death**: dead = `HP ≤ 0` (`Entity.java:184`, `Enemy.java:339`), destroyed = terrain `health ≤ 0`. After any attack or spell damage, a dead target is **removed from the grid and the turn order immediately** — party members too; destroyed terrain is removed; `enemiesDefeated++` for enemies (`BattleGridCanvas.java:1764-1775`). No unconscious state, death saves, or stabilising.

**R6.13 Healing**: spells cap at max HP (`CombatManager.java:394-407`); removed units cannot be healed. Sidebar HP ±1 / scrub clamps to [0, max] but **does not remove** a unit at 0 (`BattleView.java:1159-1178`). No temp HP anywhere.

**R6.14 Consumables** (`BattleGridCanvas.java:759-864`): heal = `ceil(healAmount × roll × 10 / 100)` for a typed d10 (1–10), capped at max HP; the consumable's `effect` status (if any) is added **as the template instance**; quantity −1 (removed at 0); floats "+N" green. Note the consumable editor always saves `effect = null` (`UI/AssetEditorView.java:543`).

**R6.15 Weapon swap** (`BattleGridCanvas.java:1181-1191`): swaps `weapons[0]`/`[1]`, saves, clears dice overrides, recomputes attributes.

### 6.3 Spells — see §7 for the full model. Summary of the math:

**R6.16 Spell attack** = weapon flow with `spellAttackMod` (R5.9); nat 20 crit ×1.5 applies (`DiceRollPanel.java:357-367, 930-932`).

**R6.17 Saving throw** (`CombatManager.java:301-304`): `total = d20 + saveMod`; success if `total ≥ DC`; else `tier = getAttackTier(DC − total − 1)` → failed by 1–5 → T1, 6–8 → T2, 9+ → T3. Saves never crit. On success with `onSave = HALF` and the spell having a T1 die, the T1 dice are rolled and the result is halved (`floor(dmg/2)`); otherwise success does nothing (`DiceRollPanel.java:690-722`).

**R6.18 AUTO** = always tier 3 (`:404-420`). **HEAL** = tier-1 dice, capped (`:385-401`). **BUFF** = no roll, rider only (`BattleGridCanvas.java:1003-1011`).

**R6.19 Spell dice** (`CombatManager.java:310-331`): first `min(tier,3)` non-empty tier dice; if that is empty, return empty. Cantrip: +1 copy of the first die for each of levels 5, 11, 17 the caster has reached (`Spell.CANTRIP_SCALING_LEVELS`, `Spell.java:41`; non-Entity casters count as level 1). Levelled: `+ upcastDie × (slotLevel − spell.level)`.

**R6.20 Spell bonus** (`DiceRollPanel.java:346-349`): `(addCastingMod ? floorDiv(castingMod + 2, 2) : 0) + flatDamage` (casting mod **without** ATTACK_MODIFIER statuses, unlike weapons, §17 F-11). Added only when there are dice.

**R6.21 Order of operations**: dice → crit (attack rolls only) → `max(0, +bonus)` → halve (`floor`).

**R6.22 Area resolution** (`DiceRollPanel.java:450-638`, `CombatManager.java:343-358`): one d20 per target for ATTACK/SAVE areas ("Auto-roll empty" fills blanks with random 1–20); damage dice are rolled **once at the highest tier any target reached**; each target sums its own tier dice plus the shared extra dice (`sumRolledForTier`), then its own crit ×1.5 and/or halving. AUTO and HEAL areas use one shared roll at T3 / T1.

**R6.23 Riders** (`DiceRollPanel.java:960`, `BattleGridCanvas.java:1044-1045`): applied when `spell.isFriendly() || (tier > 0 && !saved && tier ≥ riderMinTier)`; never on a dead target.

---

## 7. Spells and statuses

### 7.1 Spell data model — `EntityRes/Spell.java`
**R7.1 Fields** (`:43-61`): `name`, `description`, `color`, `level` 0–9 (0 = cantrip), `school` (cosmetic; no components), `resolution ∈ {ATTACK, SAVE, AUTO, HEAL, BUFF}` (`:16-21`), `range` in tiles (0 = self, 1 = touch), `targetType ∈ {ENEMY, ALLY, SELF, ANY}` (`:23-27`), `damageDice[3]`, `saveStat` (default DEXTERITY), `onSave ∈ {NONE, HALF}` (`:37-38`), `upcastDie`, `riderStatus` + `riderMinTier` (≥1), `addCastingMod`, `flatDamage`, `area ∈ {NONE, BURST, CONE, LINE}` (`:31-35`), `areaSize`, `friendlyFire`. `normalize()` (`:81-101`): clamps level to 0–9 and range ≥ 0, defaults color `#7B68EE`, defaults `targetType` to ALLY for friendly spells else ENEMY, pads dice to 3, forces `areaSize ≥ 1` for areas. `isFriendly()` = HEAL or BUFF (`:127`); `isSelfCenteredArea()` = area spell with range 0 (`:108`).

### 7.2 Casting flow — `BattleGridCanvas.java:942-1172`, `SpellPickerDialog.java`
**R7.2 Who can cast**: party Entities only; Cast enabled when `castableSpells` is non-empty (`BattleView.java:988`). A caster with no casting stat or no known spells gets info "No Spells" / "<name> has no spellcasting stat or known spells.\nSet them up on the character sheet." (`BattleGridCanvas.java:931-973`).

**R7.3 Slots** (`EntityRes/SpellSlots.java:10-40`): 5e full-caster table, rows = character level 1–20 (clamped), columns = spell level 1–9; only casters have slots (`CharSheet.java:950-952`); `spellSlotsUsed[9]` tracks usage. Picker lists slot levels ≥ spell level with slots remaining; cantrips need no slot (`SpellPickerDialog.java:107-155`). **The slot is spent when the spell resolves, hit or miss**; cancelling spends nothing; an area with no targets keeps it (`BattleGridCanvas.java:1026-1028, 1090-1098, 1120-1122`). Long Rest restores all slots (`CharSheet.java:995-998`).

**R7.4 Target validity** (`CombatManager.java:375-391`): SELF → only the caster. Terrain → only ATTACK or AUTO spells whose target type is not ALLY. Non-units → false. ANY → any unit. ALLY → not hostile (includes self). ENEMY → hostile and not self. **Hostility is side-based: Enemy vs every Entity** (`:370-372`).

**R7.5 Range** (`CombatManager.java:360-367`): Manhattan `≤ max(1, range)`; self always in range. Single-target UI tints the range diamond `rgba(123,104,238,0.10)` and outlines legal targets (`BattleGridCanvas.java:2001-2034`); a valid target out of range floats "Out of range"; anything else cancels.

**R7.6 Immediate self-resolve**: a non-area spell with `range == 0` **or** `targetType == SELF` resolves on the caster immediately, regardless of target type (`BattleGridCanvas.java:968-971`, §17 F-13). A range-0 burst also resolves at the caster immediately.

**R7.7 Resolution dispatch**: ATTACK → R6.16; SAVE → R6.17; AUTO → R6.18; HEAL → R6.18; BUFF → rider only.

**R7.8 Area aiming** (`UI/Battle/SpellArea.java:26-35`): aim must be in bounds; self-centred areas are always valid; BURST aim must be within `max(1, range)` of the caster and on an enabled cell; CONE/LINE just need any cell other than the caster's. The preview follows the cursor in the spell's colour (`BattleGridCanvas.java:2036-2067`); clicking locks it while dice are entered; invalid aims float "Out of range"; an area that affects nobody floats "No targets".

**R7.9 Area cells** (`SpellArea.java:38-87`), enabled cells only, nothing blocks:
- **BURST**: all cells with Manhattan distance ≤ `areaSize` from the aim; a self-centred burst is centred on the caster and **excludes the caster's own tile**.
- **CONE**: facing = dominant axis of (aim − caster), ties → vertical (`fr = |dr| ≥ |dc| ? sign(dr) : 0`); for forward distance `f = 1..size`, lateral half-width `floor(f/2)` → widths 1, 3, 3, 5, 5, … Range is ignored.
- **LINE**: `steps = max(|dr|, |dc|)`; for `i = 1..size`, cell = `(round(cr + dr/steps × i), round(cc + dc/steps × i))`, de-duplicated. Any angle; the line continues past the aim for its full length.

**R7.10 Area targets** (`SpellArea.java:93-110`): living Entities and Enemies on covered cells (terrain never). Friendly spells affect non-hostile units only; harmful spells affect hostile units plus same-side units (caster included) when `friendlyFire` is on.

### 7.3 Statuses — `EntityRes/Status.java`
**R7.11 Model**: `{name, effectType, magnitude, duration, targetAttribute}`. Effect types (`:6-12`): 0 NONE, 1 DAMAGE_OVER_TIME, 2 HEAL_OVER_TIME, 3 STAT_MODIFIER, 4 MOVEMENT_MODIFIER (`targetAttribute −1` = flat tiles of movement), 5 AC_MODIFIER, 6 ATTACK_MODIFIER. `duration −1` = permanent (`:116`); `targetAttribute −1` = not tied to a stat.

**R7.12 Turn-start processing** (`CharSheet.java:328-370`, `Enemy.java:185-198`): for each status: DOT → `HP = max(1, HP − magnitude)` (**cannot kill; can raise 0/negative HP to 1**); HOT → `HP = min(max, HP + magnitude)`; then `tick()`: if `duration > 0` decrement and remove at 0 (`Status.java:131-136`). **Duration 0 never expires** (tick only acts when > 0). Entity `procStatus` returns early when the list is empty, otherwise ends by calling `updateAttributes()` and `processEquippedAbilities(ON_TURN_START)` and saving (`:329-331, 367`) — the double-fire in §17 F-1.

**R7.13 Re-applying** (`CombatManager.java:410-436`): a status with the same name does not stack; the existing one's duration becomes `max(old, new)` (or −1 if the new one is permanent); an existing permanent status stays permanent. Entities save after any status change.

**R7.14 Persistence**: Entity statuses live on the sheet and **are saved to disk** (carry across battles); Enemy statuses are transient.

**R7.15 Named statuses**: `AVAILABLE_STATUSES = {"Neutral", "Unconscious", "Dead"}` (`:27-31`) are sheet check-menu labels only, created as NONE/permanent (`CharacterSheetPane.java:271-293, 1589-1597`); **no mechanical effect** (VictoryView colours them red). `Status.poison()` ("POISONED") exists but is never called (`:59-61`). Shipped rider statuses: Blessed (ATTACK +2, 10t), Shield of Faith (AC +2, 10t), Burning (DOT 2, 2t), Illuminated (AC −2, 2t), Chilled (MOVE −2, 2t), Held (MOVE −99, 2t).

---

## 8. Initiative, turns, rounds, end of battle — `UI/Battle/TurnManager.java`

**R8.1 Initiative inputs**: party members use the typed d20 (clamped 1–20, `:52`); enemies and non-party Entities roll `random 1–20` (`:54`). `total = d20 + DEX mod` (Entity adjusted DEX; Enemy `getInitiative()`) (`:57-58`).

**R8.2 Pre-battle rolls**: enemies roll at placement via `rollAndInsert`, which re-sorts the roster (entities with no roll count as 0) (`:328-362`); these are re-rolled at Begin.

**R8.3 Surprise / Ambush** (`:60-64`): SURPRISE adds **+100** to every party member's total; AMBUSH adds +100 to every **non-party** combatant (enemies and non-party Entities, since `isPartyMember` is `Entity.isParty()`, `:156-161`). The bonus is baked into the totals used for the **whole battle**, not just round 1 (the enum comment "How the first round opens" at `:11` describes intent, not behaviour). Display strips it with `roll > 100 ? roll − 100 : roll` (`:215-216`). Mid-battle joiners never get it.

**R8.4 Sort**: stable sort by total, descending (`:71`).

**R8.5 Ties** (`:85-141`): group by equal total. If a group contains any non-party combatant, the **whole group** (party members included) is shuffled with `Collections.shuffle` ("coin flip") and written back into those positions. A party-only group is queued in `pendingTieResolutions`.

**R8.6 Tie dialog**: at Begin and at the start of each new round while groups are pending (`:253-256`), the DM orders each group (§4.4); `applyTieResolution` swaps them into place and removes the group (`:167-193`). Cancel leaves the group pending.

**R8.7 Begin**: see R2.3/R2.4. `currentIndex = 0`, `round = 1` (`:76-77`). First combatant: ON_TURN_START abilities only if it is an Entity; **no status tick** (`BattleView.java:1481-1485`).

**R8.8 Next** (`:241-271`): `currentIndex++`; on wrap `currentIndex = 0`, `round++`, pending ties re-offered. The new current combatant: Entity → `procStatus()` then `processEquippedAbilities(ON_TURN_START)`; Enemy → `procStatus()`. Returned ability messages are discarded. Nothing skips dead/0-HP units (they are removed on death instead).

**R8.9 Joining mid-battle** (`:297-303, 343-362`): random d20 + DEX, no +100, no tie handling; whole order re-sorted; the currently acting combatant is preserved by identity.

**R8.10 Removal** (`:305-316, 364-375`): remove from order and maps; if the removed index was before `currentIndex`, decrement; if `currentIndex ≥ size`, reset to 0 **without** `round++`. Removing the current combatant leaves the index pointing at the next unit without running its turn-start processing (§17 F-5).

**R8.11 End & victory**: R2.7. `enemiesDefeated` is incremented only by `removeDefeated` (`BattleGridCanvas.java:1771`, `UI/Battle/BattleState.java:16`); enemies removed with Delete do not count. Victory shows party Entities still on the board (defeated ones were removed).

**R8.12 Action economy**: none. No per-turn movement budget, no action/bonus/reaction tracking, no "it's not your turn" check. Move/attack/cast need only `battleStarted` (`BattleGridCanvas.java:913-936`); units cannot be moved before Begin.

---

## 9. Movement, grid, terrain, pickups

**R9.1 Movement** (`BattleGridCanvas.java:691-701, 913-920, 1561-1635`): press F / Move; cells with `0 < Manhattan ≤ MOB` **and** `canUnitStand` are highlighted `rgba(110,200,130,0.22)` (`:1897-1933`). Clicking one moves the unit **instantly** (teleport; no pathfinding; walls, units, holes and elevation are ignored along the way); the renderer plays an ease-out slide of `min(400, max(140, dist×90))` ms (`:2180-2223`). Out-of-range, or non-standable and empty → cancel; clicking another unit selects it. Diagonals cost 2 (Manhattan). No difficult terrain.

**R9.2 Grid model** (`UI/Battle/BattleGrid.java`): `rows`, `cols` (1–25 each, non-square allowed); `int[][] elevation`; `boolean[][] enabled` (null = all playable); separate lists of entities, enemies, terrain, pickups (objects are not stored in cells; every lookup is a linear scan).

**R9.3 Occupancy** (`BattleGrid.java:41-116`): `getObjectAt` precedence Entity > Enemy > non-destroyed Terrain > Pickup. `isEnabled(r,c)` = in bounds and (mask null or true); disabled cells are a "void". `canUnitStand` = enabled and (`getObjectAt` is null **or** a non-colliding terrain). **A pickup tile is not standable.** `isBlocked` (`:73-96`) early-returns the first terrain's collision and is only used for the disabled-cell case (dead-ish code).

**R9.4 Terrain** (`Objects/TerrainObject.java`, `saves/terrain/*.json`): the only mechanics are `collision` (blocks standing, **not** paths, LoS or areas), HP, AC 10, being attackable (weapons, and ATTACK/AUTO non-ALLY single-target spells; never areas), removal when destroyed, and the draw-order flag. **No hazard, damage-over-time or movement cost** — "Acid" is cosmetic. Shipped: Acid HP 1 walkable (entity above), Red Flower HP 1 walkable (entity below), Rock HP 20 collides, Tree HP 5 collides. Code defaults if the folder is empty: Rock 10 HP, Tree 5 HP (`UI/TerrainDatabase.java:44-52`). **The only way to remove terrain in battle is to destroy it** (`BattleGridCanvas.java:1772-1773`).

**R9.5 Pickups** (`Objects/Pickup.java`): a cell holding an `Item` (weapon/accessory/consumable from the database). Fill = item colour (`ColorUtils.DEFAULT_COLOR #808080` fallback). Cannot be deleted from the board.

**R9.6 Pick up** (`BattleGridCanvas.java:866-883, 1526-1559`): press P, click a pickup at **Chebyshev distance ≤ 1** (`dx ≤ 1 && dy ≤ 1`, variables named with row/col swapped, `:1531-1534`) → item added to inventory, pickup removed. Any other click cancels. (Only place in the app that uses Chebyshev.)

**R9.7 Click precedence** (`BattleGridCanvas.java:334-363, 1484-1719`): elevation brush → (occupied cell with no move/attack/pickup/cast mode: **select** and stop) → party placement → object placement → pickup mode → move mode → area cast → single-target cast → attack mode.

**R9.8 Deletion**: right-click popup Delete removes a unit from the board and the turn order; the strip is not rebuilt until the next full refresh (§17 F-22).

---

## 10. Elevation and height (everything that exists)

**R10.1 Storage** (`BattleGrid.java:8-14, 122-134`): per-**cell** `int[][] elevation`, `MAX_ELEVATION = 3`, comment "visual-only for now". `setElevation` clamps to `[0, 3]`; `adjustElevation(delta)` = set(get + delta); out-of-bounds reads 0. Tokens and terrain have **no** elevation/height field. **No negative values (no pits), no ramps/stairs, no flying, no per-token altitude, no falling, no units (not feet).** Not persisted; lost at battle end.

**R10.2 Rule effects: none.** `getElevation` is called only by the renderer and the brush. Movement (`BattleGridCanvas.java:1564, 1602, 1906, 1925`), spell range (`CombatManager.java:360-367`), weapon attacks (no range at all), spell areas (`SpellArea`), and line of sight (does not exist) all ignore it.

**R10.3 DM controls**:
- Elevation brush: Manage → Add Objects → Elevation → cards **Raise** (+1, `#4CAF50`, tooltip "Raise tiles by one level (max 3)"), **Lower** (−1, `#e6b23c`, "Lower tiles by one level"), **Flatten** (set 0, `#8a8a8a`, "Reset tiles to ground level") (`BattleView.java:105-108, 391-428, 1831-1846`). While active, a click (press+release without dragging) changes the clicked cell by one step (`BattleGridCanvas.java:335-342`); dragging pans. Ends on Esc, re-clicking the card, switching category, closing the drawer, or starting object placement. **Works on disabled (void) cells too** (`:337` checks only `inBounds`).
- Hotkeys (`BattleGridCanvas.java:567-584`): `=`, `+`, numpad `+` → +1 on the hovered tile; `-`, numpad `-` → −1. Any time, any mode, before or during battle; DM canvas only, needs focus.

**R10.4 Rendering** (`BattleGridCanvas.java:1226-1379`):
- `ELEV_LIFT = 0.25`: screen lift `lift = elevation × cellSize × 0.25` (max 0.75 cell at level 3). Comment at `:1230-1232`: "Purely visual: hit testing intentionally ignores this, so clicks target the base grid position."
- Projection: `screenX = offsetX + col×cs`; `screenY = offsetY + row×cs − lift`.
- `drawElevatedTileFace` (`:1359-1379`): one **south-facing side face** of the full lift height (floor texture stretched, then `rgba(0,0,0,0.45)`), the top face lifted, a lit leading edge `rgba(255,255,255,0.10)` of height `max(2, cs×0.045)` when the north neighbour is not higher, and a `rgba(0,0,0,0.35)` 1 px outline. No east/west faces; levels are not drawn as separate steps.
- Top tint per level: white at alpha `0.04 × level` (`:1240-1249, 1268-1272`).
- Cliff shading on any tile beside a higher neighbour (`:1251-1350`): `d = min(3, diff)`, colours `rgba(0,0,0, 0.11 / 0.14 / 0.17)`, band width `h = max(3, round(cs × (0.10 + 0.05d)))` drawn as three overlapping rectangles (`h`, `2h/3`, `h/3`); north neighbour higher → band hangs down from the top; south neighbour higher → band hangs up from that neighbour's lifted edge; east/west → vertical bands.
- Occlusion: raised tiles are drawn in the floor pass and **again** per row in the back-to-front pass (with their pickups) before that row's terrain and units (`:2080-2093`), so a raised row covers what is behind it. This repaint hides highlights (§17 F-19).
- Everything on a tile is lifted with it: units (`footY = y + 0.85cs − lift`, `:2298, 2349-2353`), terrain (`:1385`), pickups (`:1400`), highlights (`:1890-2062`), floating text (`:2276`); during a move animation the lift uses the rounded in-between position (`:2106, 2118`).
- Elevation is left out of the headroom calculation, so raised row-0 tiles can be cut off at the top of the canvas; clicks above the board return null (`:1203`).

**R10.5 Hit testing** (`:1193-1210`): `col = (mx − offX)/cs`, `row = (my − offY)/cs`, ignoring lift — at level 3 the visible top is 0.75 cell above its cell, so clicking the top usually selects the cell behind.

**R10.6 "Flying"** appears only as placeholder text in the custom-tag field (`CharacterSheetView.java:1276`). Nothing else references height, altitude, climbing, cover, or levels.

---

## 11. Rendering and camera — `UI/Battle/BattleGridCanvas.java`, `GridTheme.java`, `SpriteUtils.java`

**R11.1 Camera**: straight top-down; **no tilt, perspective, or rotation** (git history has none either). Layout (`:1217-1225, 1426-1430`): `BOARD_MARGIN = 20`; `overhangCells = max terrain sprite overhang` (`:1417-1423`); `fitCellSize = min((W−40)/cols, (H−40)/(rows+overhang))`; `cs = fit × zoom`; `offsetX = (W − cs×cols)/2 + panX`; `offsetY = (H − cs×rows − cs×overhang)/2 + cs×overhang + panY`. Zoom 0.5–4.0 by wheel, `newZoom = clamp(zoom × e^(deltaY×0.002))` anchored at the cursor (`:44-48, 1455-1473`). Left-drag past `DRAG_THRESHOLD = 5` px pans with a closed-hand cursor (`:301-321`); pan clamp keeps ≥ `PAN_VISIBLE_MARGIN = 80` px of the board visible (`:1433-1452`, skipped while the canvas is < 160 px). Home resets (`:547-551, 1476-1482`). The player canvas is always fit-to-view with no input and does not follow the DM camera (`:202-205`).

**R11.2 Draw order** (`redraw`, `:1804-2150`, `setImageSmoothing(false)`): backdrop (`theme.backdropBase`, 64 px screen-fixed texture, radial vignette to `rgba(0,0,0,0.55)`, `:1816-1827`) → board frame (`frame = min(14, max(6, cs×0.16))`, shadow offset +4/+6, fill `#252528`, stroke `#505052`, `:1841-1851`) → floor (disabled cells filled with the backdrop base; flat cells `drawTileTop` + cliff shadows; raised cells `drawElevatedTileFace`; texture variant `(int)(((r×73856093) ^ (c×19349663)) >>> 1) % 3`, checker `rgba(0,0,0,0.07)` where `(r+c)` odd, `:1856-1881, 1261-1277`) → party placement highlight (DM only) → move range → attack targets → spell cast range → area template → pickups → **per row back-to-front**: raised tiles again, colliding or "entity above" terrain, enemies, entities, then non-colliding "entity below" terrain over units (`:2080-2135`) → floating texts → placement banner (DM only) → `mirror.markDirty()`.

**R11.3 Units** (`drawUnit`, `:2292-2355`): `centerX = x + cs/2`, `footY = y + 0.85cs − lift`; ground shadow oval `0.64cs × 0.22cs` `rgba(0,0,0,0.40)`. **HP is shown only as a ring at the feet**: track `0.78cs × 0.30cs` in `rgba(76,175,80,.45)` party / `rgba(215,95,95,.45)` enemy, width 1.5; arc inset, from 90° extent `−360×pct`, width 3, colour `#4CAF50` > 50% / `#e6b23c` > 25% / `#d75f5f`; skipped when `maxHp ≤ 0`. **Selection**: orange outer ellipse `(ringW+5) × (ringH+4)` width 2, DM only. **Active turn: motion only** — sheet sprites cycle frames 0/1 every 300 ms (`SpriteUtils.java:41, 103`; canvas repaints every 100 ms), static sprites/fallback tokens bob 0–3 px (`round(1.5 + 1.5 sin(now/250ms))`, 33 ms tick); only while started. **No ring/marker for the active unit on the board** (only the strip highlights gold). Sprite: `footY = tileY + 0.90cs`, `scale = cs×1.10 / spriteHeight`, bottom-anchored, overhangs upward (`SpriteUtils.java:378-406, 416-418`). Fallback token `0.62cs`: **circle for party/Entity, square for Enemy**, fill = character/enemy colour, stroke `#4CAF50` / `#d75f5f` width 2. **No initials or names are drawn on the board**; identity is sprite or colour+shape only. Every `Entity` is drawn as party (green ring) (`:2122`).

**R11.4 Terrain sprites** (`SpriteUtils.java:534-576`): scaled to cell width, bottom-anchored at `y + 0.90cs`, overhang `max(0, h/w − 0.90)` cells sets board headroom (`:520-527`; Tree ≈ 0.225, Red Flower 0.1, Acid 0). Fallback extruded block: `inset = max(2, .06cs)`, `depth = max(3, .18cs)`, front face at brightness 0.55, top = colour, lit edge `deriveColor(0,.85,1.35)` height `max(2, .045cs)`, stroke `rgba(0,0,0,.45)`. Selected terrain: orange rectangle inset 2 px, DM only (`:1389-1394`).

**R11.5 Pickups** (`:1398-1408`): circle `0.35cs` centred, shadow oval offset down `0.15×size`, fill item colour.

**R11.6 Highlights**: placement `rgba(90,170,230,0.20)`; move `rgba(110,200,130,0.22)`; attack `rgba(215,95,95,0.22)` fill + `0.75` stroke 1.5; cast range `rgba(123,104,238,0.10)`, legal targets `rgba(123,104,238,0.25)` + stroke `rgba(170,150,255,0.9)`; area template = spell colour at 0.28 fill / 0.55 stroke, affected units stroked with the colour brightened 0.25 at 0.95 alpha width 2.5 (`:1884-2067`).

**R11.7 Themes** (`GridTheme.java`): `stone` base `#3a3a42`, `grass` `#41582f`, `dirt` `#5a4632`; `TILE_SIZE = 32` (`:25`). Textures load from `resources/sprites/tiles/<name>_0..2.png` if present — **that folder does not exist**, so 32×32 textures are generated (`:92-147`: ±3% value noise, 10% speckles, grass 14 blades, dirt 7 pebbles, stone 2 cracks; seed `name.hashCode()×31 + variant×7919`). Backdrop `base.deriveColor(0,.8,.32)` textured at 0.6 (`:82-84`).

**R11.8 Sprites** (`SpriteUtils.java:33-220`): paths relative to `resources/sprites/`, misses cached as null; `"sheet.png#N"` = row N of a sheet (background = top-left pixel; frames found by fully-background rows/columns; trimmed and bottom-centred on a shared width ≥ 32). In use: `party/testsprites.png#0`. Picker (`UI/SpritePickerUtils.java`): browse png/jpg/jpeg/gif; outside files are copied into `resources/sprites/<subdir>/` with `_N` on clash. `tools/extract_sprite.py`: stdlib PNG decode/encode (colour types 0/2/3/4/6, filters 0–4, non-interlaced), `--src --rect X,Y,W,H --keys RRGGBB,… --key-edges --no-trim --out`, writes 8-bit RGBA.

**R11.9 Render loop** (`:230-242`): AnimationTimer redraws on move animations, floating texts, the dirty flag, or idle-animation ticks. `UI/AnimationUtils.java` (hover scale 1.05 + glow 100 ms, progress 300 ms, slideIn 250 ms, fadeIn 180 ms, `animateHeight` 250 ms) is UI-only; the strip slides cards in with a 50 ms stagger (`TimelinePane.java:434-440`).

---

## 12. Lighting and visibility

**R12.1 None of these exist**: light sources, bright/dim/dark levels, darkness, fog of war, vision radius, line of sight, walls/cover, hidden or invisible tokens, per-token DM-only flags, room lighting states. A codebase-wide grep for light/fog/visib/sight/LoS/wall/shadow finds only cosmetic shading: the vignette (`BattleGridCanvas.java:1824-1827`), the darker backdrop, cliff bands, the lit edge on raised tiles, 0.45-black side faces, unit ground shadows, the board drop shadow.

**R12.2 What the DM sees that players don't** (the only "visibility" filtering): selection rings/outlines, placement/move/attack/cast-range/legal-target highlights, the placement banner, the info popup, every input. Everything else — every placed enemy, every tile, elevation, terrain, rings, animations — appears on the player screen immediately. Further filtering is only via §13.

---

## 13. Player window (Two Display Mode) — `UI/PlayerWindow.java`, `UI/PlayerDisplayOptions.java`, `UI/AppController.java`

**R13.1 On/off**: main-menu toggle; stored as `display.twoDisplayMode` (`AppController.java:43, 91, 186-199`); reopens on launch (`:162-164`). Closing the DM window closes the player window without changing the setting (`:92`). Esc in the player window or closing it turns the mode off and saves false (`PlayerWindow.java:193-204`).

**R13.2 Placement** (`PlayerWindow.java:129-171`): target = first screen whose bounds differ from the DM's; if found, an `UNDECORATED` stage sized to that screen's full bounds (not `setFullScreen`); otherwise a normal window `min(1280, 80% width) × min(720, 80% height)` centred on the DM screen. 300 ms debounced re-placement on screen-list change or DM window move (`:76-84`). Focus returns to the DM window after showing (`:160-164`); the root ignores the mouse (`:69-71`). Title "Cassandralis - Player View".

**R13.3 Content**: idle screen (stone backdrop, vignette, "Cassandralis Combat Simulator" with `#569cd6` glow, "Awaiting the next encounter", `:211-244`); during battle `VBox(playerStrip, playerCanvas)` (`:254-275`); victory overlay without Continue (`:278-283`).

**R13.4 Sharing model**: one JVM, **shared object references, nothing serialised**. The player canvas reuses the DM's `BattleGrid`, `TurnManager` and theme (`BattleGridCanvas.java:151-155, 257-264`); every DM `redraw()` marks it dirty (`:2147-2149`); `setTheme`/`setBattleStarted` forwarded (`:245-254`); floating texts forwarded via `spawnMirroredText` with filtering (`:2237-2253`); the area template is read **straight from the DM canvas's cast state and hover cell** (`:2038-2045`) — the DM's mouse drives what players see; the strip forwards refresh/HP/roster/initiative (`TimelinePane.java:117-129, 192-194, 317-319, 347-349, 379-381`). Option changes notify listeners that rebuild the strip and redraw (`PlayerWindow.java:305-315`).

**R13.5 Display options** (`PlayerDisplayOptions.java:33-41`, keys `display.player.*` in `saves/ui_prefs.json`):

| Key | Default | Effect |
|---|---|---|
| `enemyHp` | EXACT | EXACT ring + bar + numbers; VAGUE ring + bar; HIDDEN nothing. Strip: `TimelinePane.java:556-579`. Board: HIDDEN passes `maxHp = 0` so only the ring track draws (`BattleGridCanvas.java:2107-2113`); **EXACT and VAGUE look identical on the board** |
| `partyHpNumbers` | true | "23/30" under party portraits in the strip only |
| `combatNumbers` | true | off → "-N" becomes "Hit!" ("Crit!" when the colour is `#FFD700`), "+N" becomes "Healed" (`PlayerDisplayOptions.java:104-123`, `BattleGridCanvas.java:2248-2250`) |
| `statusText` | true | off hides STATUS-kind floating texts |
| `enemyInitiativeRolls` | **false** | shows/hides "d20 N" for enemies (`BattleView.java:1664-1667`) |
| `enemyNames` | true | off → "Enemy", "Enemy 2"… numbered by turn order (`TimelinePane.java:536, 602-612`); the board never shows names anyway |
| `turnStrip` | true | show/hide the strip (`PlayerWindow.java:307-310`) |
| `spellTemplates` | **false** | show the DM's area template while aiming |

`TextKind.OTHER` texts ("Miss", "Saved", "Rested", party initiative rolls) always show. The committed `saves/ui_prefs.json` currently holds `enemyHp = EXACT`, `enemyInitiativeRolls = true`, `spellTemplates = true`, `twoDisplayMode = false`, `characterSheets.defaultGroup = NPC`.

**R13.6 Player view vs DM board**: same tiles, elevation, terrain, all units, rings, animations. Never shown: selection, mode highlights, cast range / legal targets (even with templates on), placement banner, info popup, input, camera control.

---

## 14. Editor screens (ported after Phase 4: see `docs/EDITORS.md`)

### 14.1 Character Sheets — `UI/CharacterSheetView.java`, `UI/CharacterSheetPane.java`
- Top bar: **Back** (100×35), **+ Character**, **+ Enemy** (`button-primary`), **Party** (opens the Manage Party popup over a 50% scrim) (`CharacterSheetView.java:239-271`). Mode toggles **Characters / Enemies** (`:104-131`; can end up with nothing selected, §17 F-57).
- Characters mode: group chips "All (N)", "Group Ω (N)", "Group α (N)", "NPC (N)" (`:134-212`; double-click pins the default tab into `ui_prefs` `characterSheets.defaultGroup`, gold outline); SplitPane 25/75: left list rows (36 px avatar, name, class or "Level N", group badge in All; left-click opens, right-click "Move to group" radio menu; empty-group text), right `CharacterSheetPane` or "Select a character or create one to get started".
- Manage Party popup (`:384-625`): "Available" and "Active Party" lists (24 px avatar + name), **Add >** / **< Remove**, drag-and-drop between lists and reordering (drag Available→Active is broken, §17 F-54); every change writes `party.json`.
- "+ Character" dialog (370×620, "New Character", `:927-1118`): Name ("New Character"), Color (default `#000000`), Total HP 20, Armor Class 10, STR 5 / DEX 5 / CON 5 / INT 5 / WIS 4 / CHA 3, Weapon, Accessory 1–3 ("None" or any database item), **Create** / Cancel; invalid number → "Error" / "Invalid number format." Joins the active group filter.
- Enemies mode (`:694-889`): search field; sort Name / HP / AC / Initiative with asc/desc button; tag row (**+ Add Tag** dialog, predefined + custom + in-use chips, OR filter); summary line "N enemies  •  avg HP X  •  avg AC Y"; card grid grouped by first tag ("Untagged" first) when unfiltered; enemy card = sprite, name, "HP n" / "AC n" / "Init n" badges, tag chips, Edit / Delete ("Delete Enemy" / "Delete X?") (`UI/CardUtils.java:615-651`).
- New/Edit Enemy dialog (`:1126-1332`): Name; Health 1–9999; Mobility 1–99; Armor Class 0–99; "Dexterity (Attack + Initiative)" −10..99; Saves STR/CON/INT/WIS/CHA −10..99; Tier 1/2/3 Die; Color; hint "Dexterity drives both enemy attack rolls and initiative."; Sprite compact picker (copied into `resources/sprites/enemies/`); Tags chips; Custom Tag (prompt "e.g. Flying") + Add; **Save** / Cancel ("Save Failed" alert on error).
- `CharacterSheetPane` (the per-character panel, not a duplicate screen; `UI/SheetButton.java` is only a (pane, label) holder never shown):
  - Header (`:127-165`): 56 px avatar, Name field (saves on focus loss), Class field, **Delete** (`button-danger`; "Delete Character" / "Delete X? This cannot be undone."; removes the file and the `party.json` entry).
  - Basic Info (`:185-357`): sprite picker (64 px preview, Browse "Select Sprite Image" → copied into `resources/sprites/party/`, X clears); HP current (0–9999) "/" max (1–9999) + bar (green/amber/red glow; lowering max also lowers current); AC 0–99; Status MenuButton with check items "Unconscious", "Dead" (text "None" / "A, B" / "A +N"); Color picker; Group combo Ungrouped/Ω/α/NPC.
  - Attributes (`:453-630`): radar chart 200 px (`UI/AttributeRadarChart.java`: six axes STR..CHA from the top, rings every 3, scale ≥ 12 growing to fit, fill `#569cd6` 25%, stat-coloured labels); grid Base (`#569cd6`) / Bonus (`#4ec9b0`, equipment only) / Total (`#dcdcaa`, incl. statuses); LVL spinner 1–99 with "Points: spent / available" and red "(Over by N)".
  - Equipment (`:391-451`): slot cards Primary, Secondary (swords), Accessory 1–3 (shield), each a combo of None / equipped / matching inventory items; choosing moves the item from inventory into the slot and the previous one back (`:1493-1584`, `CharSheet.java:556-581, 639-653`).
  - Abilities (`:632-1007`): tabs Passive / Active / Special, "+ Add <Type> Ability", rows (name, shortened description with tooltip, trigger line, red X), placeholder "No <type> abilities"; Add Ability dialog: Type, Name, Description, Trigger (enabled only for PASSIVE), Effect, Magnitude −99..99, Target Attr (STAT_BOOST only), Status Name (STATUS only), Add / Cancel.
  - Spellcasting (`:657-802`): "Casting stat:" None/INT/WIS/CHA/STR/DEX/CON; "DC N  |  Atk +N" or "Not a caster"; **Long Rest**; slot pips (casters only); **+ Learn Spell** ChoiceDialog ("Learn Spell" / "Add a spell to X's known spells:", "Name  (Level N)"; "No Spells" alert when none); known-spell rows (name, summary, level badge `#4a4f6a` cantrip / `#5d4bb8`, edit pencil "Edit this spell (changes apply to everyone who knows it)", red X forgets), placeholder "No known spells". No UI to spend/restore a single slot.
  - Inventory (`:1015-1310`): **+ Add Item**; tabs Weapons / Accessories / Consumables/Ammo / Crafting / Key Items with rows "name ×qty" + red X; Add Item dialog (Category Weapon/Accessory/Consumable/Ammunition/Crafting Item/Key Item, Item, Quantity 1–999); removal confirm ("Remove Item" / "Remove X?" / "This will remove the item from inventory.") or quantity dialog with "Remove All".
  - **Saving**: nearly every `CharSheet` setter calls `save()` immediately (`CharSheet.java:108-262, 507-510, 556-653, 776-868, 884-998`), rewriting `saves/entities/party/<sanitised name>.json` (`:1014-1030`). No Save button, no undo.

### 14.2 Asset Editor — `UI/AssetEditorView.java`
- **Back**; per-tab add buttons: Items → "+ Weapon", "+ Accessory", "+ Consumable", "+ Ammo", "+ Crafting", "+ Key Item"; Terrain → "+ Add Terrain"; Spells → "+ Spell" (`:49-162`). Tabs **Items / Terrain / Spells** (no enemy editing here). Item sub-tabs Weapons / Accessories / Consumables (consumables + ammunition + crafting together) / Key Items (`:196-230`); no Armor editor.
- Cards (`CardUtils.java:327-610`) with Edit / Delete ("Delete Item" / "Delete X?"): Weapon (rarity badge Common/Uncommon/Rare/Legendary from the T1 die, "Damage Dice: d6/d6/d10", non-zero modifiers), Accessory (rarity from defense, "Defense: +N", modifiers), Consumable ("Heal: +N HP", "Effect: X"), Ammunition ("Ammo: type"), Crafting (category), Key Item ("Quest Item" gold / "Key Item"), Spell (level/resolution badges, school, area or range, targets, save, damage/healing, upcast, effect), Terrain (thumbnail, HP, "Collision: Yes/No", "Layer: Above/Below" when collision off).
- Item dialogs (modal; OK/Cancel; "Please enter valid numbers." on bad input; empty name keeps the dialog open silently): Weapon 400×650 (Name, Color, Tier 1/2/3 Die default d6/d6/d8, Stat Type, Ammo Type "Leave empty for melee", six stat mods, Abilities editor) (`:401-476, 645-727`); Accessory 380×500 (Name, Color, Defense default 1, six mods, Abilities); Consumable 300×150 (Name, Color, Heal Amount default 10; **effect not editable**); Ammunition 320×150 (Name, Color, Ammo Type default "12 Gauge"); Crafting 320×180 (Name, Color, Category Material/Component/Reagent/Miscellaneous, Description); Key Item 320×180 (Name, Color, Description, "Quest Related").
- Item Abilities editor (`:1065-1122`): list + [+] [Edit] [−]; ability dialog 350×350 (`:1129-1188`): Name, Description, Trigger, Effect, Magnitude −100..100, Target Attr — **no Ability Type or Status Name field** (§17 F-48).
- Terrain dialog 300×300 (`:913-1041`): Type, HP default 10, Color, "Collision (blocks entry)" (default on), "Layer:" Entity Above/Below (shown when collision off), Sprite compact picker (copied into `resources/sprites/terrain/`); Delete "Delete Terrain" / "Delete X?".
- Spells use the Spell Editor (§4.7); delete asks "Delete Spell": "Delete X?\nCharacters who know it will simply stop seeing it."

---

## 15. Persistence — every file format

**R15.1 General**: Gson with default settings: null fields omitted, nulls inside arrays kept, `static`/`transient` skipped, unknown keys ignored on load. Pretty vs compact varies per type (below). No versioning; only ad-hoc legacy fixes. All paths relative to the working directory.

**R15.2 Locations and naming**

| Data | Path / file name | Format | Code |
|---|---|---|---|
| Party characters | `saves/entities/party/<name with [^a-zA-Z0-9] → _>.json` | compact | `CharSheet.java:1014-1030` (save), `:1046-1095` (load) |
| Non-party characters | `saves/entities/nonparty/` (load path only; never actually loaded, §17 F-49) | — | `:1047` |
| Enemies | `saves/entities/enemies/<baseName>.json` — spaces kept; `<>:"/\|?*` and control chars → `_`; trailing dots/spaces removed. **The file stem (not `name`) is the load key** (`___.json` holds `"name": "???"`) | pretty | `Enemy.java:348-364, 371-395, 398-412` |
| Items | `saves/items/{weapons,accessories,consumables,ammunition,crafting,keyitems}/<sanitised>.json` | compact | `EntityRes/ItemDatabase.java:35-132, 147-177` |
| Spells | `saves/spells/<sanitised>.json` | pretty | `EntityRes/SpellDatabase.java:69-79, 138-140`; renaming deletes the old file and rewrites `knownSpells` in every party file (`:93-136`) |
| Terrain | `saves/terrain/<sanitised type>.json` | compact (two samples are pretty) | `UI/TerrainDatabase.java:54-64` |
| Grid presets | `saves/gridshapes/<sanitised>.json` (folder absent) | compact | `UI/GridShapePresetDatabase.java:58-70` |
| Party list | `saves/party.json` — JSON array of display names; order = placement order | pretty | `EntityRes/PartyConfig.java:18, 53-65` |
| UI prefs | `saves/ui_prefs.json` — flat object of **string** values | pretty | `EntityRes/UiPreferences.java:19-45` |
| Custom enemy tags | `saves/enemy_tags.json` (absent) | pretty | `EntityRes/EnemyTagRegistry.java:20` |
| **Battle / board state** | **none** — grid size/shape, elevation, placed units, terrain, pickups, turn order, round, adjustments, enemy HP exist only in memory | | grep of every `saves/` path |

**R15.3 CharSheet JSON** (sample `Henry_Keaton.json`): `name`, `characterClass` ("None" default), `color` `#RRGGBB`, `isParty`, `spritePath?` ("party/testsprites.png#0" — `#n` = sheet row, `SpriteUtils.java:33-39`), `level`, `group?`, `totalHP`, `currentHP`, `armorClass`, `status[]`, `baseAttributes[6]`, `tempAttributes[6]`, `totalAttributes[6]`, `weapons[2]` (full Weapon or null), **`PRIMARY: 0`, `SECONDARY: 1`** (non-static finals written by accident, `CharSheet.java:45-46`), `accessories[3]`, `inventory[]` (mixed types by `type`), `wallet`, `abilities[]`, `spellcastingStat?`, `knownSpells[]` (names), `spellSlotsUsed[9]`. Load fixes: 4-element legacy attribute arrays `[STR, DEX, MOB, INT]` → 6 (MOB dropped, `:1113-1121`), missing fields defaulted, AC 0 → 10 (`:1056-1089`). Equipped weapons are **re-looked-up in the item database by name** on use (`:595-612`); accessories and inventory items are embedded copies.

**R15.4 Status JSON**: `{name, effectType, magnitude, duration, targetAttribute}`. **ItemAbility JSON**: `{name, description, triggerType, effectType, magnitude, targetAttribute, statusName?, abilityType}` (old files may lack `abilityType` → PASSIVE).

**R15.5 Item JSON**: base `{name, type, color, quantity}`; `color` may be a hex string, an **integer index into the 16-colour legacy palette**, or a numeric string ("9") (`EntityRes/ColorUtils.java:10-27`). Subtypes and the `type` string the app writes: Weapon (`damageDice[3]`, `statType`, `ammoType?`, `modifiedAttributes[6]`, `abilities[]`, legacy `damage`) "Weapon"; Accessory (`defense`, `modifiedAttributes` may be 5 long, `abilities[]`, legacy `armorType`) "Accessory"; Consumable (`healAmount`, `effect?`) "Consumable"; Ammunition (`ammoType`, legacy `damageBonus`, `compatibleWeaponType?`) "Ammunition"; CraftingItem (`craftingCategory`, `description`) **"Crafting"** (§17 F-47); KeyItem (`description`, `questRelated`) "Key Item"; Armor loads as Accessory. `EntityRes/ItemTypeAdapter.java:15-51` (used only for CharSheet inventories) dispatches on `type`: "Weapon"; "Accessory"|"Armor"; "Consumable"; "Ammunition"; "Crafting Item"|"CraftingItem"; "Key Item"|"KeyItem"; else plain `Item`.

**R15.6 Enemy JSON** (samples `Spider.json`, `Snake.json`): `name, health, maxHealth, mobility, armorClass, damageDice[3], dexterity, color, instanceNumber, baseName, spritePath?, tags[], attributes[6]?` (written once set; DEX slot ignored; missing → all saves = dexterity), legacy `attackDamage`, `row`, `col`; older files also carry ignored `attackModifier` and `initiative`. In-battle adjustments, overrides and statuses are not saved.

**R15.7 Spell JSON**: `name, description, color, level, school, resolution, range, targetType, damageDice[3]` (nulls allowed), `saveStat, onSave, upcastDie?, riderStatus?, riderMinTier, addCastingMod, flatDamage, area, areaSize, friendlyFire`; defaults via `normalize()`.

**R15.8 Terrain JSON**: `{type, health, color, collision, entityAboveTerrain, spritePath?, row, col}`. **Preset JSON**: `{name, rows, cols, mask: boolean[rows][cols]}`.

**R15.9 Built-in defaults**: item database seeds "Sword", "Dagger", "Health Potion" when weapons+accessories+consumables are all empty (`ItemDatabase.java:140-145`); terrain seeds Rock/Tree; themes generated in code.

**R15.10 Gson field-initialiser caveat**: classes without a no-arg constructor (`Enemy`, `TerrainObject`) do not get Java field defaults on load; a terrain JSON lacking `collision`/`entityAboveTerrain` loads both as `false` (`Enemy.java:40-46` documents the same issue). All shipped files set them explicitly.

---

## 16. Keyboard, mouse, theming

**R16.1 Keys** (the only key handlers in the codebase; no menu accelerators):

| Key | Where | Effect | Ref |
|---|---|---|---|
| F11 | main window | toggle fullscreen | `AppController.java:68-73` |
| Esc | player window | turn Two Display Mode off | `PlayerWindow.java:193-198` |
| Home | board (focused) | reset camera | `BattleGridCanvas.java:547-551` |
| Esc | board | cancel object placement, else end elevation brush, else cancel mode | `:554-565, 634-637, 660-663` |
| `=` `+` numpad `+` / `-` numpad `-` | board, hovered tile | elevation ±1, any time | `:568-584` |
| F / E / C / P | board, started, party Entity selected | toggle Move / Attack / Cast / Pickup | `:587-639` |
| R / Q | same | Use item / Swap weapons | `:608-615` |
| F / E / Esc | board, started, Enemy selected | toggle Move / Attack; cancel | `:640-665` |
| Enter | dice panel fields | submit / next field | `DiceRollPanel.java:213, 536-539, 843-850` |
| Enter | spell editor | Save/Create (default button) | `SpellEditorDialog.java:222` |

The board only receives keys when focused; selecting a unit focuses it.

**R16.2 Mouse on the board** (`BattleGridCanvas.java:288-543, 1455-1482`): wheel zooms 0.5–4× around the cursor; left-drag > 5 px pans; left-release without drag = select / perform the current action (precedence R9.7); right-click a unit pins the info popup; hover a unit 1 s shows it. Elsewhere: double-click a spell casts; double-click a group chip pins it; right-click a character row opens "Move to group"; timeline strip is pannable; sidebar value labels are drag-scrubbable.

**R16.3 Theming** (`resources/styles/dark-theme.css`, 2447 lines, applied to every window and dialog via `UI/StyleUtils.java:17-21`, `UI/DialogUtils.java:20-35`): backgrounds `#1e1e20 #252528 #2d2d30 #3c3c3e #464648 #525255`; accent blue `#569cd6`, teal `#4ec9b0`, gold `#dcdcaa`, orange `#daa520`; success `#4CAF50`, warning `#FF9800`, danger `#d75f5f`, info `#2196F3`; text `#dcdcdc / #b0b0b0 / #808080`; borders `#404042 #505052 #606065` (`:9-70`). Fonts: "Segoe UI", system-ui 13 px (`:74-79`); Consolas for the menu subtitle, placement banner, floating text, player subtitle; Georgia for the victory quote. Main classes: buttons `button, button-primary, button-danger, button-success, button-accent, button-earth (#8B4513), button-arcane (#7B68EE), button-large` (`:160-280`); labels `label-title, label-header, label-muted, label-caption, section-header, stat-str…stat-cha` (`:84-145`); battle `timeline-pane, timeline-entity, timeline-entity-current, timeline-init-field, timeline-button, hotbar-tab, round-start-toggle, hotbar-card(-selected), sidebar-panel, info-popup, card-gold` (`:598-808`); menu `two-display-*`, `player-idle-*`; sheets `group-chip(-default), group-badge, tag-chip(-selected), enemy-summary-bar` (`:871-935`); bars `progress-bar-success/-warning (#e0a030)/-danger/-accent, hp-bar` (`:970-1003`); victory `victory-*` (`:2410-2447`). Board colour meanings (code, not CSS): party green `#4CAF50`, enemy red `#d75f5f`, selection `Color.ORANGE`, current turn gold `#c99b00→#b8860b` (strip only), HP arc green/amber/red. Icons (Ikonli MDI2, `UI/IconUtils.java:84-126`): `SWORD_CROSS, ACCOUNT, COG, PLUS, MINUS, TARGET, ARROW_ALL, FLAG, HEART, SHIELD, SKULL, DICE_D20, PLAY, STOP, UNDO, CONTENT_SAVE, DELETE, PENCIL, EYE, LIGHTNING_BOLT, FLASK, TREASURE_CHEST, MAP, ACCOUNT_GROUP, CLOCK, INFORMATION, ALERT, CHECK, CLOSE, ARROW_LEFT, MENU, FAST_FORWARD, SCRIPT_TEXT, WRENCH, HAND_BACK_RIGHT, STAR, SORT_ASCENDING, SORT_DESCENDING, AUTO_FIX, WEATHER_NIGHT, MONITOR_MULTIPLE`. Many CSS classes are unused (`battle-highlight-*`, `status-*`, `rarity-*`, `skeleton`, `shimmer`, `neumorph`, `glass*`, `grid-cell*`, `selection-card*`, `floating-label`, `info-card*`, `stat-card`, `compact-card`, `pulse-target`, `accordion`, `.elevation-0..4` which are drop-shadow depths unrelated to tile elevation, `:702-711, 2166-2185, 2304-2326`).

---

## 17. Flagged: buggy, unclear, inconsistent, dead

Each row states what the code **does**. Intent is not guessed. Fill in *Decision* (preserve / fix / n/a) at the checkpoint; the port will default to **preserve** for anything that is a rule, and will only fix items that cannot exist in a value-based TypeScript port (marked "port can't reproduce").

### 17.1 Rules and combat behaviour

| # | What the code does | Where | Decision |
|---|---|---|---|
| F-1 | **ON_TURN_START abilities fire twice** when the Entity has ≥1 status: `procStatus()` calls `processEquippedAbilities` after its empty-list early return, and `nextTurn` calls it again. Example: Plasmoid Core REGEN heals 2×2 whenever any status (even "Dead") is present. | `CharSheet.java:329-331, 367`; `TurnManager.java:262-264` | |
| F-2 | **Victory triggers on any single enemy defeated**, even if others remain, or when there were never any enemies. Enemies removed with Delete don't count. | `BattleView.java:1706`; `BattleGridCanvas.java:1771` | |
| F-3 | **The first combatant gets no status tick in round 1** (Begin fires abilities but not `procStatus`), and abilities fire *before* the tie dialog can reorder who actually goes first. | `BattleView.java:1481-1490` | |
| F-4 | DOT, ability DAMAGE and HOT use `max(1, …)` / `min(max, …)`, so they **can raise 0 or negative HP to 1** and DOT can never kill. | `CharSheet.java:341, 434`; `Enemy.java:190` | |
| F-5 | **Killing the current combatant** leaves `currentIndex` on the next unit without running its turn-start processing; Next then skips it. Wrapping past the end after a removal resets to 0 **without** `round++`. | `TurnManager.java:305-316, 364-375` | |
| F-6 | Surprise/Ambush are **permanent orderings** (+100 for the whole battle), despite the enum comment "How the first round opens". Mid-battle joiners never get the bonus. Display strips with `> 100`, so a total of exactly 100 (d20 1 + DEX −1 + 100) shows as 100. | `TurnManager.java:11, 60-64, 216, 343-362` | |
| F-7 | **Non-party Entities change sides by code path**: treated as enemy-side for Ambush and tie-breaks (`isPartyMember` = `isParty()`) but as party-side for hostility (`isHostile` = `instanceof Enemy`). Every loaded sheet is from the party folder, so this is currently unreachable. | `TurnManager.java:61, 101, 156-161`; `CombatManager.java:370-372` | |
| F-8 | **Status duration 0 never expires** (`tick` only acts when `> 0`), so 0 behaves like permanent. The spell editor converts 0 to 1. | `Status.java:131-136`; `SpellEditorDialog.java:264` | |
| F-9 | The dice panel label shows **"STR"** for enemy attacks, which actually use DEX. | `CombatManager.java:220-228`; `DiceRollPanel.java:315-316` | |
| F-10 | **No weapon range, reach or line of sight**; every unit and terrain on the board is attackable, **same side included** (enemies can attack enemies). `Weapon.isRanged()` only means "uses ammo". Unclear whether intended. | `BattleGridCanvas.java:1671-1718, 1936-1999`; `Weapon.java:104-106` | |
| F-11 | Weapon damage bonus uses `attackMod` **including** ATTACK_MODIFIER statuses; the spell bonus uses the casting modifier **without** them. Unclear whether intended. | `DiceRollPanel.java:312, 347` | |
| F-12 | MOVEMENT_MODIFIER statuses with `targetAttribute ≥ 0` also modify that attribute on Entities, but enemy saves count only STAT_MODIFIER. | `CharSheet.java:464`; `Enemy.java:157` | |
| F-13 | A **non-area spell with range 0 resolves on the caster** immediately even when `targetType` is ENEMY. | `BattleGridCanvas.java:968-971` | |
| F-14 | Defeated party members are deleted from the board with **negative HP written to the sheet**; the next battle's placement phase places them anyway; they are missing from the Victory screen. | `Entity.java:179-182`; `BattleView.java:270-298, 1723` | |
| F-15 | **Mixed distance metrics**: movement, spell range and areas are Manhattan; pickup is Chebyshev (with `dx`/`dy` named row/col-swapped); attacks have none. Units also cannot stand on pickup tiles. | `BattleGridCanvas.java:1531-1534`; `BattleGrid.java:107-116` | |
| F-16 | `Ammunition.isCompatibleWith` reads the raw `ammoType` field, so legacy ammo holding only `compatibleWeaponType` never matches. Separately, **`Shortbarrel_Shotgun.json` has no `ammoType`**, so it is melee and never uses the 12 Gauge Shells. | `Ammunition.java:58-67`; `saves/items/weapons/Shortbarrel_Shotgun.json` | |
| F-17 | **Shared template instances are mutated**: pickups wrap the `ItemDatabase` object itself; consumable use stores the template `Status`, so ticking mutates the template; the consumable path also skips `updateAttributes()`. New characters equip database instances directly. *(port can't reproduce: TS state is value-based; each placed/used item becomes a copy)* | `BattleView.java:1809-1826`; `BattleGridCanvas.java:853`; `CharacterSheetView.java:1048-1051` | |
| F-18 | SAVE spells with HALF: `hasDamageDice` checks only the **T1 slot**, so a spell with a null T1 die never halves. | `DiceRollPanel.java:720-722` | |
| F-19 | **Move/attack/cast/area/placement highlights are hidden on raised tiles** because the per-row pass repaints every raised tile's opaque top after the highlights were drawn (pickups are redrawn afterward; highlights are not). | `BattleGridCanvas.java:1883-2067, 2086-2091` | |
| F-20 | **Units cannot be placed on walk-through terrain or pickup tiles**: `handlePrimaryAction` selects any occupied cell first (it doesn't check placement modes), so the placement branches are never reached, contradicting the comments and the highlighted "valid" cells. Moving onto those tiles works. | `BattleGridCanvas.java:352, 1498, 1511-1515`; `BattleView.java:363-367` | |
| F-21 | **Clicks ignore elevation** ("intentionally"): at level 3 the visible top is 0.75 cell above its cell so clicking it hits the cell behind; raised row-0 tiles extend above the board where clicks return null and the headroom calculation ignores elevation, so they can be cut off. | `BattleGridCanvas.java:1193-1210, 1230-1232, 1203, 1417-1430` | |
| F-22 | **The timeline is not rebuilt after removals** (defeat or Delete call `grid.remove*`/`turnManager.remove*` and only refresh HP), so removed cards linger until the next full refresh. `BattleView.removeEntity/removeEnemy` are never called. | `BattleGridCanvas.java:526-543, 1764-1775`; `BattleView.java:1643-1675` | |
| F-23 | **Disabled (void) cells can be raised** by the brush (checks only `inBounds`) and the hotkeys; their invisible height still makes neighbours draw cliff shading. | `BattleGridCanvas.java:337, 391, 567-584` | |
| F-24 | **Every `Entity` is drawn as party** on the board (`isParty = true` passed unconditionally): a non-party Entity would get the green ring and circle token, and the strip ring colour for "other" (`#808080`) is unreachable from the board. | `BattleGridCanvas.java:2122`; `TimelinePane.java:153-164` | |
| F-25 | A battle with **only enemies cannot start** (Begin requires an `Entity`); Begin's "no party → roll enemies only" branch is only reachable with a non-party sheet on the board, which cannot happen (all sheets load from the party folder). | `BattleView.java:1433-1445`; `CharacterSheetView.java:274, 305` | |
| F-26 | Sidebar HP ±/scrub clamps to 0 but **does not remove** a unit at 0 HP, while damage does. | `BattleView.java:1159-1178` | |
| F-27 | Sidebar dice cycling on a **null** tier starts from d4 (`diceIndex(null) = 0`, so `+` → d6). | `BattleView.java:1051-1054` | |
| F-28 | ACTIVE/SPECIAL abilities keep the disabled trigger's default `ON_TURN_START` and **still fire**, because the ability type is never filtered. | `CharacterSheetPane.java:936-939, 992`; `CharSheet.java:377-415` | |
| F-29 | **Secondary-weapon abilities fire, but its stat modifiers never apply** (`updateAttributes` reads only `weapons[0]`; `equipSecondaryWeapon` doesn't recalculate). | `CharSheet.java:391-400, 477, 570-581` | |
| F-30 | Damage dice defaults are inconsistent: unarmed Entity `d4/d4/d4`, everything else `d4/d4/d6`. | `Entity.java:112`; `Weapon.java:20`; `Enemy.java:60`; `CombatManager.java:135` | |
| F-31 | `DiceRollPanel.getMaxValue` treats any unknown die string as **6**; only single-die strings are supported. | `DiceRollPanel.java:879-889` | |
| F-32 | Any enemy's "d20 N" placement roll floats on the player screen when `enemyInitiativeRolls` is on (the committed prefs set it to true, though the code default is false). | `BattleView.java:1652-1668`; `saves/ui_prefs.json` | |
| F-33 | The Cast button can be enabled for a **non-caster who knows a cantrip** (`castableSpells` doesn't check `isCaster`); clicking then shows the "No Spells" alert. | `SpellPickerDialog.java:224-230`; `BattleGridCanvas.java:931-973` | |

### 17.2 Board, setup, player window

| # | What the code does | Where | Decision |
|---|---|---|---|
| F-34 | **"Use" on a saved preset loses its shape**: the handler copies the mask, then `selectRailButton` fires the Custom button, whose action runs `resetPaintMask` (fill all). Rows/Cols spinners are not updated to the preset's size either. | `GridSetupDialog.java:275-285, 322-324, 335-338, 371` | |
| F-35 | **Saving a preset keeps a live reference** to the paint array (later Clear/Fill/paint mutates it); saving twice under one name overwrites the file but adds a duplicate list entry. | `GridSetupDialog.java:258`; `GridShapePresetDatabase.java:58-70` | |
| F-36 | No validation that a custom mask has ≥1 playable tile. | `GridSetupDialog.java` | |
| F-37 | **Selecting terrain or a pickup leaves the sidebar stale** (previous unit's name/HP/values/enabled buttons remain; the buttons then do nothing). *(port can't reproduce: the TS sidebar renders from the selection)* | `BattleView.java:920-1022` | |
| F-38 | Units can be deleted from the board; **terrain and pickups cannot** (only destroyed). | `BattleGridCanvas.java:375, 526-533, 1772-1773` | |
| F-39 | **Party placement cannot be cancelled** (no Esc; Begin and Add Objects disabled until done). | `BattleView.java:270-335, 1255, 1355` | |
| F-40 | **The DM canvas's AnimationTimer is never stopped**; each finished battle leaves one running. *(port can't reproduce)* | `BattleGridCanvas.java:230-242`; `PlayerWindow.java:296` | |
| F-41 | `GridTheme` looks for `resources/sprites/tiles/*`, which **does not exist**, so every theme load logs "Sprite not found" and falls back to generated textures. | `GridTheme.java:43-147` | |
| F-42 | On the board, enemy HP `EXACT` and `VAGUE` look identical (both draw the arc). | `BattleGridCanvas.java:2107-2113` | |
| F-43 | Ring/shadow sit at 0.85 of the cell while sprites sit at 0.90. Texture-variant hash casts to int before `%`, which would go negative (and crash) only on ≥ ~59 rows (max is 25). | `BattleGridCanvas.java:1262, 2298`; `SpriteUtils.java:378-406` | |

### 17.3 Editors and persistence

| # | What the code does | Where | Decision |
|---|---|---|---|
| F-44 | **Renaming leaves duplicate files** for characters (old file kept; `party.json` and the list label not updated), items (old key/file kept), enemies, terrain. Only spells rename correctly. | `CharSheet.java:108-111`; `ItemDatabase.java:147-177`; `Enemy.java:387`; `TerrainDatabase.java:54-64`; `CharacterSheetView.java:632` | |
| F-45 | **Deleted terrain comes back**: `deleteTerrain` never deletes the file (comment admits it). | `TerrainDatabase.java:66-70` | |
| F-46 | **Some enemies cannot be deleted**: delete builds the path from `getName()` without the save-time sanitiser (e.g. "???" saved as `___.json`). | `CharacterSheetView.java:907` | |
| F-47 | **Crafting items load wrong from inventories**: the editor writes `type: "Crafting"` but the adapter recognises only "Crafting Item"/"CraftingItem", so they become plain `Item`s shown in no tab. | `AssetEditorView.java:601`; `CraftingItem.java:25`; `ItemTypeAdapter.java:35-37`; `CharacterSheetPane.java:1462-1474` | |
| F-48 | The **item ability dialog has no Ability Type or Status Name field** and always rebuilds abilities with `statusName = null`, type PASSIVE — editing a STATUS ability drops its status name. | `AssetEditorView.java:1165-1173`; `ItemAbility.java:73` | |
| F-49 | **`PRIMARY:0, SECONDARY:1` are written into every party file** (non-static finals). `saves/entities/nonparty/Spider.json` is an old-format file (4 attributes, `armor` array, `INITIATIVE`/`MOBILITY` keys) that is **never loaded**; the legacy-array comment says `[STR, DEX, MOB, INT]` but that file declares `INITIATIVE: 2, MOBILITY: 3` — layout unclear. | `CharSheet.java:45-46, 1113`; `saves/entities/nonparty/Spider.json` | |
| F-50 | **Gson skips field initialisers** for `Enemy`/`TerrainObject` (no no-arg constructor): a terrain JSON lacking `collision`/`entityAboveTerrain` loads both as false; legacy enemies without `attributes` get saves = dexterity. *(port can't reproduce: loaders apply explicit defaults, documented in R15.10)* | `Enemy.java:40-46, 126-134`; `TerrainObject.java` | |
| F-51 | **Editing statuses on the sheet wipes spell statuses**: `syncStatusesToSheet` clears every status and re-adds only the checked Unconscious/Dead items. | `CharacterSheetPane.java:1589-1597` | |
| F-52 | **"Add Item" drops abilities and colour** (copies built with constructors that omit them). Weapons recover via the by-name database lookup; accessories do not (REGEN lost). | `CharacterSheetPane.java:1218, 1222`; `CharSheet.java:595-612` | |
| F-53 | **New characters get their starting gear twice** (equipped *and* added to inventory). | `CharacterSheetView.java:1050-1079`; `CharacterSheetPane.java:1351` | |
| F-54 | **Drag from Available onto Active Party does nothing** (`setupReorderDrag` replaces the drop handlers); only reordering and the "Add >" button work; drop position ignores scrolling. | `CharacterSheetView.java:469-473, 593-625, 610-612` | |
| F-55 | HP drag-scrub comment says "in memory only", but `setCurrentHP` saves on every call, so each drag step rewrites the file. | `BattleView.java:1154-1158`; `CharSheet.java:245-248` | |
| F-56 | The enemy editor writes `getMovement()`/`getAC()` back into base fields: AC 0 becomes 10 on reload; mobility cannot be authored as 0 (spinner min 1). | `CharacterSheetView.java:1152-1158`; `Enemy.java:80` | |
| F-57 | The Characters/Enemies mode switch has no "keep one selected" guard. | `CharacterSheetView.java:104-131` | |
| F-58 | Item, terrain and preset loading catch only `IOException`; a malformed JSON throws an uncaught `JsonSyntaxException` (spells catch everything). | `ItemDatabase.java:47`; `TerrainDatabase.java:36`; `GridShapePresetDatabase.java:52`; `SpellDatabase.java:52` | |
| F-59 | The consumable editor always saves `effect = null`; the shipped First-Aid Kit has no effect. | `AssetEditorView.java:543` | |
| F-60 | Sample-data drift: `NMB_15.json`'s *inventory* copy of "Plasmoid Core" has `defense: 0`, no modifiers and no abilities, while its *equipped* copy has defense 1 + REGEN; `Plasmoid_Core.json` has a 5-element `modifiedAttributes`; `Android_Multitool.json`'s ability is named "Unnamed"; older enemy files carry `attackModifier`/`initiative`. | `saves/…` | |
| F-61 | When a battle ends without victory, `sheetView.endBattle()` runs twice (harmless). | `BattleView.java:1713-1716`; `AppController.java:278-287` | |

### 17.4 Dead code, stale comments, build config (no decision needed; listed for completeness)

- Never called: `CardUtils.createItemCardWithActions/createCompactItemCard/createInfoCard/createStatCard/createArmorCard` (`createItemCard` only via the first); `FormUtils.createHPSpinner/createSearchableComboBox/createIconComboBox/createStyledComboBox/createFormSection/createFormCard/createFormRow` and validators `NOT_EMPTY/IS_NUMERIC/IS_POSITIVE/matchesPattern/maxLength`; `SpriteUtils.drawSpriteOnCanvas/unitSpriteDrawTop/spriteExists/SPRITE_SIZE`; `AnimationUtils.animateHeight`; `Armor` class (aliased to Accessory); `CharSheet.buyItem/sellItem/pickupItem/dropItem/wallet (no UI)/levelUp/deepCopy/restoreSpellSlot/unequip*/mulCurrentHP/getColorNames/getColorHex/highestSlotLevel`; `PartyConfig.reorder/addMember/isMember/clear/size`; `Status.poison`; `TerrainObject.onDestroyed`; `DiceRollPanel.isActive/getState`; `AppController.navigateToBattle(int,int)` and `(int,int,String)`, `getCharacterSheetView`, `isPlayerWindowOpen`; the two shorter `BattleView` constructors; `GridObject.moveTo`/`Entity.moveTo`; `BattleGrid.isBlocked` (one caller, only hits the disabled case); `infoPopupTarget` written never read; `Ammunition.damageBonus`, `Accessory.armorType`; constants `ON_HIT/ON_EQUIP/ON_DAMAGED/PASSIVE/EFFECT_STAT_BOOST` (never triggered); `SheetButton` extends Button but is never shown; non-party Entity support exists but placement cards list only party sheets.
- Stale comments: "Test hooks" (`PlayerWindow.java:317-337`), "offscreen harness" (`GridSetupDialog.java:37-39`, `DialogUtils.java:33`) with no tests in the repo; radar-chart comment says the pool is 40 (`AttributeRadarChart.java:58-60`) vs `27 + 2(level−1)`; `DiceRollPanel` state-flow comment (`:20-29`) doesn't match its enum; orphaned `setOnDelete` javadoc above `setOnGroupChanged` (`CharacterSheetPane.java:113-121`); `SpellArea.isAimValid` javadoc; `roundStartModeFromSlider` name.
- Build: `DnDSim.iml` marks root and package folders as source roots and declares only gson; `launch.json` has duplicate "Main" entries; JavaFX not supplied; `tools/__pycache__` committed.

---

## 18. Shipped content (seed data for scenarios)

**Party** (`saves/entities/party/`, all `isParty: true`; `party.json` = `["Grand Wizard Man"]`): 32A (NPC, L1, 28 HP, AC 13, Android Multitool), Dan Dixon (Ω, 5/30 HP, Shortbarrel Shotgun), Grand Wizard Man (NPC, **L12**, 20 HP, AC 10, INT caster knowing all 16 spells), Hana Shiroi (Ω), Henry Keaton (Ω, 20/36, AC 14), Magnolia Grandiflora (α, CHA caster: Fire Bolt, Magic Missile; Sickle), NMB-15 (Ω, Plasmoid's Fulmen), Sergeant Mark (NPC), Temerity (α, Handaxe), Thrain Argon (α, Greatsword), Voxel (α), Warrior (no group, sprite `party/testsprites.png#0`).

**Enemies** (18, `saves/entities/enemies/`): HP/MOB/AC/DEX/dice — Dr. Petra Ilyas 25/4/11/6 d4/d4/d4; Dummy 18/5/13/3 d4/d6/d10; Elder Falsiradix Tendril 5/10/12/5; Elder Falsiradix 30/3/12/5 d6/d6/d8; Falsiradix 15/2/10/2 d4/d8/d6; Grey Ooze 10/2/16/2; Human Puppet 18/3/11/2 d6/d6/d8; Legendary Broodmother 55/3/13/2 d4/d6/d6 (Boss); Legendary Elder Falsiradix 85/3/14/5 d6/d6/d8 (Boss); Melee Moongate Guard 18/3/12/3; Overgrown Hornet 20/5/13/3 (attributes `[2,3,2,2,2,2]`); Receptionist 10/3/10/2; Rug of Smothering 25/4/11/1; Shielded Moongate Guard 15/2/14/2; Snake 14/5/12/7 (attributes all 7); Spider 18/7/12/4 d4/d4/d6; Spliced Hound 22/5/13/7 d8/d6/d8; `___.json` = "???" 55/4/13/6 d8/d6/d12. No sprites. Tags in use: Humanoid, Beast, Boss, Optimized, Android.

**Weapons** (T1/T2/T3, stat): Greatsword d6/d6/d10 STR; Sledgehammer d6/d6/d10 STR (+1 STR, +1 CON); Handaxe d6/d6/d6 DEX; Sickle d4/d6/d6 DEX; Shortbarrel Shotgun d6/d4/d8 DEX (no ammoType, F-16); Android Multitool d6/d4/d8 DEX (ON_TURN_START heal 1); Plasmoid's Fulmen d6/d8/d12 INT. **Accessory**: Plasmoid Core defense 1, REGEN heal 2 on turn start. **Consumable**: First-Aid Kit heal 25. **Ammunition**: 12 Gauge Shells ("12 Gauge").

**Spells** (16): Fire Bolt (L0 ATTACK rng8 d4/d6/d10, Burning at T3+), Ray of Frost (L0 ATTACK rng5 d8/d6/d8, Chilled), Sacred Flame (L0 SAVE DEX rng6 d8/d6/d8), Thunderclap (L0 SAVE CON burst1 self, d6/d4/d6), Bless (L1 BUFF ALLY rng4, Blessed +2 ATK 10t), Burning Hands (L1 SAVE DEX/HALF cone3 self d6/d6/d8 ff, upcast d6), Cure Wounds (L1 HEAL touch d8 +casting mod, upcast d8), Guiding Bolt (L1 ATTACK rng8 d12/d8/d10, Illuminated AC−2, upcast d6), Magic Missile (L1 AUTO rng8 d4/d4/d4 +3 flat, upcast d4), Shield of Faith (L1 BUFF rng4, AC+2 10t), Thunderwave (L1 SAVE CON/HALF burst1 self d8/d6/d8 ff, upcast d8), Hold Person (L2 SAVE WIS rng6, no dice, Held MOVE−99 2t), Shatter (L2 SAVE CON/HALF rng6 d8/d8/d8, upcast d8), Fireball (L3 SAVE DEX/HALF rng8 burst2 d10/d10/d12 ff, Burning at T3, upcast d6), Lightning Bolt (L3 SAVE DEX/HALF line10 self d10/d10/d10 ff, upcast d6), Mass Healing Word (L3 HEAL burst2 rng8 d4 +casting mod, upcast d4).

**Terrain**: Acid (HP 1, walkable, entity above, `terrain/acid.png` 42×19), Red Flower (HP 1, walkable, entity below, 16×16), Rock (HP 20, collides, no sprite → extruded block), Tree (HP 5, collides, `color: 8` legacy index, 327×368 sprite). Sources in `resources/sprites/terrain/_source/`.

---

## 19. Port map (added at the Phase 2 checkpoint)

Each rule area above has a test file in `tests/rules/` that quotes the formulas and cites the Java
lines; the engine lives in `src/engine/` and the §17 decisions are `rules.compat` flags
(`src/engine/compat.ts`). See `docs/CHECKPOINT-2.md` for the area → test map, the compat decision
table and the list of items fixed without a flag. The Java paths cited in this document are in
`legacy-java/` as of commit `4df7b30`, the last one before the Java app left this repo.
