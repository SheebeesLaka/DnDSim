# Step 3 — Three UI directions

Mockups: `design/mockups/{a-chronicle,b-ops-console,c-spotlight}.html` (served by Vite at
`http://127.0.0.1:5173/design/mockups/…`), screenshots in `design/shots/`, comparison in
`design/shots/side-by-side.png` / `design/compare.html`.

**Shared moment** (identical numbers in all three): Round 3, Arboretum Dome C. Henry Keaton swings a
Sledgehammer at Moongate Guard #1: d20 **9** + STR 7 + Blessed 2 = **18** vs AC 12 → margin **+6** → **T2**
(2 short of T3) → dice d6 **4** + d6 **5** (being typed) + STR ½ **5** = **14** → Guard 18 → 4.
Statuses in play: Blessed, Shield of Faith, Chilled, Burning, Illuminated; Shield Guard has a readied
action; Falsiradix ×2 arrive round 4; Grow lamps on, service bay off (generator), Henry's torch,
ambient dim; hornet flying at 15 ft.

The board in every mockup is the real three.js renderer (`design/scene/capture-board.mjs`), so
nothing about the board itself is invented.

## What all three share (fixes from the audit, not a design choice)

These come from your answers and the audit, and they go in whichever direction you pick:

- **Turn change auto-selects** the active creature and eases the camera to it. **Space = end turn.**
- **Live roll math.** You type the raw d20 and each die; the panel shows `d20 + each modifier by name = total vs AC → margin → tier`,
  where it falls on the tier ladder ("2 short of T3"), the damage sum, and the target's HP after. All of it updates as you type.
  Dice fields auto-advance once a die's digits are complete (a d6 advances after one digit). Enter applies.
  Nat 20 shows the ×1.5 automatically.
- **Typed HP.** `−7` / `+5` on any creature, anywhere. No more ± clicking.
- **Statuses are first-class.** You can apply them in battle, they show on the token, in turn order and in the
  info panel with **turns remaining**, they **tick automatically**, and an expiry is called out ("Blessed wore off · Henry").
- **Freeform turn order.** Delay, ready (with a note), drag/keyboard reorder, and reinforcements queued for a
  future round. Nothing is ever blocked.
- **Lighting UI** (doesn't exist today): ambient bright/dim/dark, one-click group switches, add/move/remove a light
  (on a tile or carried by a creature), radius and colour, DM reveal.
- **Elevation / altitude UI**: hover readout, a height brush, ramps, and a creature's flying altitude.
- **Undo** (the engine is command-based, so this is natural) and an event log.
- **Player-view settings get a real home** (out of the debug panel), and **the TV mirrors the DM screen's style**.
  It shows the board, turn order, the selected character's info, enemy health, **every roll as it's entered**,
  and statuses.
- **Motion**: a consistent 120 / 180 / 260 ms cadence. Panels ease in, HP drains rather than jumps, turn
  order slides, and dice settle.
- Debug, compat flags, render toggles (Blur/Glow) and JSON import/export move to a Settings page.

Click counts below are for **select creature → resolve an attack → apply damage → end turn**.
Today: **4 clicks + a board hunt + a corner trip** (keyboard), **9 clicks** mouse-only.

---

## A · Chronicle — classic tactics (Final Fantasy Tactics, Tactics Ogre, Triangle Strategy)

**DM layout.** Full-bleed board. Floating ornate windows:
- **Turn Order column** on the left, FFT's AT list: portrait, HP sliver, status icons, init; ▶ marks
  the current creature, and a "Round 4" divider holds the reinforcement ghosts.
- **Command list** (Move / Act ▸ / Status / Adjust HP / End turn / Delay) with FFT's glove cursor. Act opens a submenu.
- **Bottom row**: the **active unit plate** (left), the **forecast** (centre), and the **target plate** (right, mirrored).
- **Field window** top-right: ambient segment, light switches, tool buttons.
- **Tile window**: the hovered tile's height, surface and light level.

**TV layout.** The same screen without the command list, Field window or Tile window: Turn Order
column, board, and the two plates. During a roll the forecast grows to the centre with large numerals.
FFT's layout was built for a TV, so it carries over most naturally.

**Core loop.** The turn starts with Henry selected. Press `2`/`E` (Act ▸ Attack); the nearest enemy is pre-targeted
(`←/→` cycles, or click one); type `9`, `4`, `5`; Enter; Space.
**0 clicks** with the keyboard, **~5 clicks** trackpad-only (Act, Attack, target, Apply, End turn).
Ad-hoc damage: click the creature, `4`, type −7, Enter. That's **1 click**.

**Elevation and lighting.** Lighting is always visible but compact in the Field window: switches are one click,
`L` adds a light (click a tile → radius/colour popover). Elevation shows only in the Tile window (hover readout) and the
`H` height-brush mode, so it never clutters the board. A creature's altitude is under Status ▸ Fly.

**Style.** Deep indigo gradient windows, a thin brass double border with rivets, parchment-white text. Cinzel
for names and numerals, Alegreya Sans for body text. The moonbase comes in through stencil subtitles and
facility vocabulary in a fantasy frame. The art matches the HD-2D board best.

**Keys.** `1` Move · `2` Act · `E` Attack · `C` Cast · `R` Item · `3` Status · `4` Adjust HP · `Space` End
turn · `D` Delay · `Y` Ready · `Alt+↑↓` reorder · `Tab` Field · `L`/`H`/`U` light/height/units ·
`Ctrl+Z` undo · `Esc` back.

**Great at.** Cohesion with the board, readability on the TV, a memorable look, and
attacker-vs-target clarity.
**Bad at.** Menus add a level (Act ▸ Attack). Only the turn-order column shows everyone at once, so
bookkeeping across many creatures (e.g. 8 enemies) is slower. The ornate frames cost space, and the bottom
row covers the bottom of the board.

---

## B · Ops Console — station terminal (the non-tactics-RPG one)

**DM layout.** Three columns:
- **Initiative roster** (left): one dense row per creature with init, portrait, name, cell/height, HP with
  numbers and a pending-damage hatch, AC with modifier, and status tags with turns remaining. The active
  row has an inline **quick-entry field** (`−7`, `+5`, `burn 2`).
- **Board** (centre) with a toolbar: Survey heights, Lights, Spawn, Board.
- **Resolve panel** (right): the attack as a calculator **tape**, the tier bar, the dice, the result, then the **log with
  per-entry undo**.
- **Top bar**: round, turn N/M, **Next turn**, and the **Power panel**. Light groups are breaker switches and ambient is
  BRT/DIM/DRK. The Power panel is how lighting fits the moonbase.
- **Command line** (bottom): `henry atk guard1 9 4 5 ⏎` for when you're fast.

**TV layout.** Board large in the centre, a slimmer roster on the left (HP/status, no inputs), the Resolve tape on
the right while a roll happens. It reads like a station security monitor, which is very on-setting but less
"fantasy".

**Core loop.** `Space` → Henry's row is active and selected; `E`, click Guard #1 (or type it in the command line);
type `9`, `4`, `5`; Enter; Space. **0–1 clicks**, **~5 trackpad-only**. Ad-hoc damage: **1 click** (any row's field) or
**0** (command line `g2 -7`). Status: `burn 2` in the row field.

**Elevation and lighting.** Breakers are always visible, one click each. `Survey` (`H`) overlays every plateau
height and pit depth, and the brush lives in the same toolbar. Altitude is in the row ("▲ fly 15 ft") and settable
from the command line.

**Style.** Charcoal with scuffed hairlines, an amber primary, teal for systems, violet/orange for statuses. IBM
Plex Mono for numbers, Barlow Condensed for labels, plus a hazard-stripe accent. A worn facility terminal.

**Keys.** `Space`/`Shift+Space` next/previous turn · `E` `F` `C` `R` · `−7` / `+5` on the focused row ·
`S` status · `D` delay · `Y` ready · `Shift`+drag reorder · `/` command line with autocomplete · `H` survey ·
`L` lights · `Ctrl+Z` undo.

**Great at.** Speed and bookkeeping: **every creature's HP and statuses are always visible**, which helps most
with tracking statuses. It also has the best ad-hoc editing, undo/log visibility, and the most room for many enemies.
**Bad at.** The least game-like and the most text. The board is the smallest of the three (center column). The command line
is a learning curve. On the TV it feels like a dashboard rather than a battle.

---

## C · Spotlight — modern tactics (Triangle Strategy, Into the Breach, XCOM 2, Unicorn Overlord)

**DM layout.** Board-first, with frosted-glass chrome only at the edges:
- **Round pill and light chips** top-left; **Undo, TV live, settings and End turn** top-right.
- **Stage dock** (`G`) on the left for lights, height and spawning.
- **HP pips and status badges float over every token** (Into the Breach), and the active and target creatures are named.
  The rest of the board is softly dimmed.
- **Clash panel** next to the action: the two fighters, a big d20, formula chips, a segmented tier meter, hex dice, the result.
- **Action bar** for the selected creature (XCOM): Move, Attack, Cast, Item, Status, ±HP, Delay.
- **Turn rail** along the bottom: cards with status badges, a "NOW" card, a readied ribbon, an R4 divider with
  ghost reinforcements, and a **Hold** pocket to drag a card into for delay.

**TV layout.** Nearly identical to the DM screen, minus the action bar and Stage dock. The Clash panel
scales up to centre-screen during rolls, which gives players the "all rolls" moment they react to. This direction
works best on the TV out of the box.

**Core loop.** `Space` → camera eases to Henry; `E` (only in-range enemies glow; `Tab` cycles) or click Guard #1;
type `9`, `4`, `5`; Enter; Space. **0–1 clicks**, **~4 trackpad-only**, with the least pointer travel because the panel
sits beside the fight. Ad-hoc damage: hover or click a creature, `H`, −7, Enter. Status: `S` opens an icon palette by
the token.

**Elevation and lighting.** Light chips give one-click group toggles. Everything else is in **Stage mode**
(`G`): lamp pins appear on the board to drag, toggle or resize, along with the height brush and spawn tools. Height chips
show only in Stage mode, so the battle view stays clean.

**Style.** Frosted dark glass, moon-white text, arboretum lime for the party, coral for enemies, gold for "now",
violet for magic. Chakra Petch for numerals, Inter for text. It feels like a clean lunar-station HUD over a
fantasy board.

**Keys.** `Space` end turn · `F` `E` `C` `R` `S` `H` `D` · `Tab` cycle targets / next die · `X` nat-20 · `G`
Stage · `L` add light · `[` `]` camera · `Ctrl+Z` undo · `Esc` back.

**Great at.** Most cinematic, best TV moment, least pointer travel on a trackpad, statuses visible right on the
tokens, the board as large as possible.
**Bad at.** Floating panels move, so muscle memory is weaker than with fixed panels. The clash panel can cover part of
the board. Pips get crowded when creatures bunch up (as you can see around Henry). Comparing HP across 8+ enemies
is weaker than B's roster. It needs the most motion polish to feel right.

---

## Quick comparison

| | A Chronicle | B Ops Console | C Spotlight |
|---|---|---|---|
| Attack loop, keyboard | 0 clicks | 0–1 | 0–1 |
| Attack loop, trackpad only | ~5 | ~5 | ~4 |
| Ad-hoc damage | 1 click | 1 (or 0) | 1 |
| See all statuses at once | turn column icons | **full roster** | **on tokens** + rail |
| Board area | full-bleed, bottom covered | ~58% of width | full-bleed |
| TV fit | very good | OK (dashboard) | **best** |
| Feel | classic fantasy tactics | moonbase terminal | modern lunar HUD |
| Many enemies (8+) | OK | **best** | OK |

Easy mixes: C's on-token pips with B's roster, A's plates with C's turn rail, or B's breakers in any of them.
