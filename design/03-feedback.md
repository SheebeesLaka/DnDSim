# Round 1 feedback on the three directions (2026-10-11)

## Base direction: **C · Spotlight**
Keep:
- the condensed command bar (action bar)
- the turn-order rail
- the roll / clash panel, especially the **margin visualization** and the clearly visible formula
- a full-bleed board with no reserved margins for menus

Fix:
- the margin bar is missing the **MISS** segment (A had it)
- sprites in the clash panel and plates should **face each other** (A had them back to back)

Minor adjustments come later.

## From A · Chronicle
- **Take:** the FFT menu *layout* (not its look), the **Field menu** as the single home for everything that edits the grid, the MISS segment on the margin bar, and the status chips on the attacker/target plates. These should go further: clearer, more elaborate, more deeply designed.
- **Drop:** the blue/brass FF window skin ("cute homage, not what I'm looking for").
- **Asked:** what the Field menu's Undo and TV buttons do (answered in chat, see below).

## From B · Ops Console
- Least favourite: too many words, shapes and numbers. The dot leaders on the tape (between "d20" and "9") are superfluous.
- **Keep the concept of a log.** It's not for turn order; it's for **active buffs and other time-dependent effects**. *Contents still to be discussed.*
- Lights/power in the top bar is interesting, but where it goes from here is undecided.

## Open questions (asked in chat)
1. What exactly is off about A's skin?
2. Statuses "deeper": what kind of depth, and where?
3. Log contents and placement.
4. Top-bar power: scene presets vs. individual switches.
5. Field menu: persistent panel or mode?
6. A's plates inside C: always shown, or only during a roll?

---

# Round 2 answers (2026-10-11) → `mockups/c2.html`, `shots/c2-*.png`, `shots/r2-*.png`

1. Looks: try several; keep glass in for comparison. Built **Glass / Obsidian & Gilt / Verdigris / Moonstone** (`?skin=`).
2. Statuses on plates: a **unique emblem** per status, **pips** for the countdown, **green / red** on any number a status raises or lowers (not folded into the AC text). **Visual effects on the board** wanted. Mocked as overlays: flames, a halo with motes, a frost ring, a shield dome, a light shaft.
3. Log = an **active-effects tracker**, with each effect's end time in the same row. Built as "Active effects", sorted soonest-ending first, plus readied actions, arrivals and DM timers.
4. Lighting: an **ambient slider, 0% pitch black → 100% daylight**, and a toggle for every placed light. Built in Field ▸ Light, with presets, group toggles, per-light colour / radius / flicker, and radius rings on the board.
5. Field = a **mode** (G) with all the proposed tools: Light, Height, Spawn, Terrain, Board, TV, History.
6. Plates: show **both** → `?plates=roll` (inside the roll panel) vs `?plates=dock` (docked bottom-left / bottom-right).

Also fixed: a MISS segment on the margin bar; portraits face each other; the damage breakdown shows Blessed's +1 inside the bonus (STR ½ 4 + Blessed 1).

---

# Round 3 decisions (2026-10-11)
- **Look: Glass.** **Plates: inside the roll panel.** Concern: the roll panel may cover something important on the board (options proposed in chat).
- Effects: burning works. The dome around G. Wizard (Shield of Faith) didn't enclose the sprite → now a full bubble on a ground ring. Blessed → ground sigil, light column and motes (no floating halo). **Players must see the effects on the TV.**
- **Field lives in the left vertical dock:** Field (G) heads the dock, and Light / Height / Spawn / Terrain / Board / TV / History are shortcuts straight into those tabs. The active-effects panel and the Field panel sit to the right of the dock. The Field pill was removed from the top bar.

# Round 4 (2026-10-11)
- Roll panel covering the board: **camera reframe + hold-Alt peek** only.
- Dock: **left**.
- Blessed: **back to the halo, anchored to the head** (done in c2).
- Next: assemble what's decided into a build (plan in `05-build-plan.md`), then design the remaining Field tabs.
