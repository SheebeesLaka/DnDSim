# Step 1 — UI audit (2026-10-11)

Brainstorming only: no app code was changed. Screenshots are in `design/audit/` (DM at 1440×900, player
view at 1600×900; taken from `?scenario=test` / `?readonly=1`, so nothing was written to campaign/).

| # | Screen | File |
|---|---|---|
| 1 | Main menu | `audit/01-menu.jpg` |
| 2 | Battle setup | `audit/02-battle-setup.jpg` |
| 3–4 | Character sheets (character / enemies) | `audit/03-…`, `audit/04-…` |
| 5 | Asset editor | `audit/05-asset-editor.jpg` |
| 6 | Battle, before Begin | `audit/06-battle-prebegin.jpg` |
| 7 | Initiative entry | `audit/07-battle-initiative-entry.jpg` |
| 8 | Round 1, nothing selected | `audit/08-battle-round1-nothing-selected.jpg` |
| 9 | Unit selected | `audit/09-battle-unit-selected.jpg` |
| 10 | Attack mode (targets lit) | `audit/10-battle-attack-mode.jpg` |
| 11–12 | d20 entry, damage entry | `audit/11-…`, `audit/12-…` |
| 13 | Manage tab + Add Objects drawer | `audit/13-battle-manage-add-objects.jpg` |
| 14 | Debug panel (only home of lighting) | `audit/14-battle-debug-panel-lighting.jpg` |
| 15 | Spell picker modal | `audit/15-battle-spell-picker.jpg` |
| 16 | Player view (TV) | `audit/16-player-view.jpg` |

---

## A. Every DM action in a typical round, and what it costs today

Notation: **C** = mouse click, **K** = key press, **#** = typing a number. "Hunt" = finding a token on
the 3D board by eye. Counts are for the TypeScript app as it runs today.

| # | DM action | Fastest path today | Cost | Mouse-only cost | Notes |
|---|---|---|---|---|---|
| 1 | Start combat | Begin → type each PC's d20 (Tab between; Enter does nothing) → Begin | 2C + 4# (4 PCs) | 2C + 4# + 4 field clicks | Surp/Norm/Amb must be set *before* Begin, in a different cluster |
| 2 | Resolve tie | modal, click names in order → OK | n+1 C | same | Pops up again every round if cancelled |
| 3 | **See whose turn it is** | glance at the gold card in the top strip | 0 | 0 | No marker on the board; strip cards not clickable |
| 4 | **Select the active creature** | hunt token on board → click | 1C + hunt | 1C + hunt | **Not auto-selected on turn change**; no "jump to active" key |
| 5 | Move | F → click destination | 1K + 1C | 2C | Fine. No path; teleport |
| 6 | Attack (hit, T2) | E → click target → `#` Enter → `#` Enter `#` Enter | 1C + 4K + 3# | 6C + 3# | d20 auto-focuses, dice chain on Enter — the best part of the current UI |
| 7 | Attack (miss) | E → target → `#` Enter → **click OK** | 2C + 2K + 1# | 4C + 1# | OK isn't keyboard-reachable |
| 8 | Attack (T3 crit) | as above, 3 dice | 1C + 5K + 4# | 7C + 4# | |
| 9 | Cast single-target spell | C → click spell → (pick slot) → Cast → click target → d20 → dice | 4–5C + 3K + 3# | 7–8C + 3# | Picker is a **modal over the board**: you can't see range or targets while choosing |
| 10 | Cast area spell | C → spell → Cast → aim click → click each target's d20 field (or "Auto-roll empty") → Roll → dice → Confirm | 6C + n# + dice | same | Per-target fields have no Enter chaining |
| 11 | Use item | R → choice dialog → OK → d10 → OK | 3–4C + 1# | 4–5C | Two stacked dialogs |
| 12 | **End turn** | click **Next** (top-left corner) | 1C | 1C | **No hotkey.** Next sits at the far opposite corner from the actions panel → full-screen mouse trip every turn |
| 13 | **Apply ad-hoc damage** (trap, fall, house-ruled hit) — e.g. 7 dmg | select → click **−** seven times, or click the HP bar at a guessed fraction | 8C (or 2C imprecise) | same | **No typed damage/heal entry anywhere** |
| 14 | Ad-hoc heal | same with + | n+1 C | | |
| 15 | Apply a status (Prone, Blessed by a scroll, Burning) | **impossible in battle**; only as a spell rider | — | — | Statuses also **never shown** on the battle screen (only on the Victory overlay) |
| 16 | Temporary AC/stat/dice tweak | select → ± per point | 1C + n C | | Takes ~60% of the sidebar's height for something used rarely |
| 17 | Check a creature's numbers | right-click → popup | 1C | 1C | No hover popup (Java had a 1 s hover) |
| 18 | Remove a creature | right-click → Delete | 2C | 2C | No undo |
| 19 | Add reinforcements | Manage → Add Objects → Enemies → card → click tile(s) → deselect → Battle tab | 6C + n | 6C + n | Drawer is buried two levels inside Manage |
| 20 | Raise/lower terrain | hover tile + `+`/`-` (hidden) **or** Manage → Add Objects → Elevation → Raise → click tiles → Esc | 1K or 4C + n | 4C + n | Hotkey is undocumented in the UI |
| 21 | Make a creature fly / set altitude | `` ` `` debug panel → unit dropdown → type → Set altitude | 1K + 3C + 1# | — | Debug-only |
| 22 | Flip a light / light group (generator restored) | `` ` `` → light dropdown → Toggle (or group dropdown → Toggle group) | 1K + 3C | — | **Debug-only**, mixed in with rule-compat flags and the command log |
| 23 | Change ambient (bright/dim/dark), DM reveal | `` ` `` → button | 1K + 1C | — | Debug-only |
| 24 | Player display filters (enemy HP exact/vague/hidden, names…) | `` ` `` → checkboxes | 1K + 1C | — | Debug-only (Java had a proper settings dialog) |
| 25 | Dying PC | select → Recover / Hold on / Perish (+confirm) | 2–3C | | Good, clear |
| 26 | Long rest / save battle / theme | Manage → … | 2C+ | | Lives with Add Objects, Character Sheets, JSON import/export and a "do not write party sheets" checkbox |

**Typical turn** (select, move, attack T2, end): **4 clicks + ~6 keys + 3 typed numbers** with the keyboard,
**9 clicks** mouse-only, plus one board hunt and one cross-screen trip to Next.
**Typical round** with 4 PCs + 4 enemies: **~32 clicks, 8 hunts, 8 corner trips.**

---

## B. Confusing, slow and cluttered parts

### The turn loop (the part that matters most)
1. **Turn change doesn't select anything.** After Next, the Selected panel shows "--" until you find and click the token. This is the single most repeated wasted action.
2. **Next has no key and lives top-left**, the actions live bottom-right. Begin/End is right next to Next: a mis-click ends the battle (it does confirm, but still).
3. **Strip cards are inert.** You can't click a portrait to select/centre that creature. Hover gives an initiative tooltip only.
4. **No typed damage.** HP is ±1 buttons or clicking the bar at a fraction. For a physical-dice DM this is the biggest functional gap.
5. **Dice panel replaces the whole sidebar** — while entering damage you lose sight of the target's HP, AC and statuses.
6. **Attack mode lights up everything** (allies, terrain, the attacker's friends) — no range/side filtering, so the highlight doesn't help choose.
7. **Miss result and area d20s break the keyboard chain** (OK needs a click; area fields don't advance on Enter).
8. **Spell picker is a modal over the board**, so you choose a spell blind to range and positions.

### Clutter / information hierarchy
9. **Selected panel is mostly ± buttons.** 7 stat rows + 3 dice rows each with − value + (≈30 buttons) dominate; Actions fall below the fold at 900 px tall; Cast is off-screen. Names are 12px, values are the same weight as labels.
10. **Statuses are invisible** in battle (computed in the board VM, never rendered in the DM UI).
11. **Manage is a junk drawer**: Character Sheets, Add Objects, Long Rest, Theme, Save/Load, JSON up/down, a persistence checkbox.
12. **Surp / Norm / Amb are visible all battle** but disabled after Begin — permanent dead pixels in the prime top-left slot.
13. **Two render-settings toolbars** (DM + Player: camera, Blur, Glow, turn ⟲⟳, zoom) sit on the board permanently. These are set-once preferences presented as primary controls.
14. **Board chips** ("on +10 ft", "+15 ft", "ramp +5 ft → 0 ft", HP numbers under every token) overlap at default zoom and compete with the art.
15. **Lighting, altitude, player-display filters exist only in the `` ` `` debug panel** next to compat flags and a command log. The engine supports lights, groups, ambient, reveal, altitude, ramps — the DM UI exposes none of it.
16. **Theme naming mismatch**: setup offers "Facility (metal plating)"; the in-battle select shows "Stone".

### Look and feel (matches your complaints)
17. **Dead space**: menu, setup, sheets list and asset editor all hug the top-left with 60–70% of the window empty. Setup's preview is 120 px wide on a 1440 px screen.
18. **Generic boxes**: every surface is the same `#2b2b2b` rounded rectangle with a 1 px border; buttons, cards and panels are visually identical. No setting identity (nothing reads "moonbase" or "fantasy").
19. **No motion at all**: `styles.css` has zero transitions/animations. Panels swap instantly, HP bars jump, the strip rebuilds without easing, the dice panel pops in. (The Java version had fades, slide-ins and 300 ms HP tweens.)
20. **Typography**: one system font at 11–13 px for everything, colour-coded stat labels (7 different colours) that carry no meaning in the homebrew system beyond decoration.

### Player view (TV)
21. Turn strip text is ~11 px on a 1600 px wide view: unreadable across a room. Names truncate ("Grand Wizard …").
22. No "whose turn" callout, no round number, no turn-change moment.
23. Board fills about half the screen; tokens are small; enemies show as hollow squares in the strip.
24. Floating numbers are the only feedback for hits; nothing big or legible for "MISS / HIT T2 / CRIT".

---

## C. Legacy Java version — functional differences (not design)

| Area | Java (legacy) | TS (current) | Verdict |
|---|---|---|---|
| HP editing | ± **and click-or-drag scrub** on the bar, live | ± and click only | Scrub worked well; typed entry would be better still |
| Stat tweaks | ± **and horizontal drag-scrub on the value** (8 px/pt) | ± only | Scrub is a nice fast pattern for rare tweaks |
| Dice entry | Every die field paired with a **slider** (mouse-only entry possible) | number fields only | Sliders were slow but let you enter dice without the keyboard |
| Hover info | **1 s hover popup** on any unit; right-click pins + Delete | right-click only | Hover peek is worth keeping |
| Mid-battle reshape | **Reshape Board** in Manage with stranded-unit relocation | missing | Port it (or decide it's not needed) |
| Player display settings | Real dialog from the main-menu gear | debug panel only | Needs a real home |
| Motion | view fades, dice panel slide-in, sidebar width animation, strip stagger, 300 ms HP tween | none | Java's cadence (100/180/250 ms) was right |
| Fullscreen | F11 | browser F11 | — |
| Lighting / altitude / ramps / 3D camera | none | engine + renderer done, **no DM UI** | TS is far ahead functionally |
| Save/load battle | none | yes (Manage) | TS ahead |
| Dying / tombstones | none (died at 0) | Recover / Hold / Perish | TS ahead |
| Keyboard | F/E/R/P/C/Q, +/- elevation, Home, Esc, Enter chaining | same + `[` `]` camera, `` ` `` debug | Same gaps in both: **no Next key, no select-active key, no typed damage** |

What worked well in Java, functionally: scrub-to-adjust (fast, no mode), hover peek, sliders as a
fallback for mouse-only use, the Victory recap, and the consistent motion cadence. Its weaknesses were the
same as today's: no turn auto-select, Next far from actions, everything under a generic sidebar.
