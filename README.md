# Cassandralis Combat Simulator (web rebuild)

TypeScript + Vite rebuild of the JavaFX combat simulator (the Java app is kept outside this repo;
`FEATURES.md` is the rule inventory both share, and cites its `.java` lines). The combat rules are
unchanged; the port is checked rule by rule against FEATURES.md in `tests/rules/`.

## Run

```sh
npm install
npm start          # builds if needed, serves http://127.0.0.1:8787 and opens the DM window
```

The server stops by itself a few seconds after you close the last app window (DM and player), which
gives the terminal back; a refresh doesn't count as closing. `Ctrl+C` stops it at once.
`npm start -- --keep-running` keeps it up with no window open; `-- --no-open` skips opening the
browser.

- DM window: `http://127.0.0.1:8787/` · player window: `http://127.0.0.1:8787/player` (open it in a
  second browser window/tab of the same browser; it mirrors the DM board live).
- The app reads and writes your data through a small local server, in two places:
  - `saves/` holds the **game content** you author (enemies, items, spells, terrain, grid shapes).
    It is tracked in git: commit it when you've made something worth keeping.
  - `campaign/` holds the **campaign state** that changes while you play: party and NPC character
    sheets (current HP, spell slots, statuses), the party list, UI prefs and saved battles. It is
    git-ignored, so a session never leaves you with changes to commit. On first start it is
    seeded from the tracked `campaign.example/`.
  - To keep the campaign somewhere else (for example a OneDrive or Dropbox folder, so it's backed
    up), set `DNDSIM_CAMPAIGN_DIR` before starting, e.g. in PowerShell:
    `$env:DNDSIM_CAMPAIGN_DIR = "$HOME\OneDrive\DnDSim campaign"; npm start`. An empty folder is
    seeded the same way; files already there are never overwritten.
- It opens on a menu: **Battle** (grid setup), **Character Sheets** and **Asset Editor**.

## Develop

```sh
npm run dev            # Vite on :5173 (+ API on :8787 behind /api)
npm test               # unit/rule tests (watch)
npm run check          # lint + typecheck + unit tests with coverage + build + Playwright e2e
node scripts/smoke-ui.mjs   # drive the real UI headlessly, screenshots in docs/progress/
```

Dev URLs: `/?scenario=test&seed=1` loads `scenarios/test.json` (self-contained fixture: party sheets
and prefs are *not* written back); `/?scenario=perf` is the 25×25 / 40 units / 20 lights stress
scene; `/?battle=<name>` loads `campaign/battles/<name>.json`; `/?readonly=1` never writes party sheets
or prefs. `?view=menu|setup|sheets|assets` opens a page directly. Press `` ` `` in the DM window for
the debug panel.

## The editors

Character Sheets (characters, groups, party order, enemies), the Asset Editor (items, terrain,
spells) and the Spell Editor write the same JSON files as the Java app, as you edit (no Save
button). A sheet edited during a battle (**Manage → Character Sheets**) updates the battle too.
What's there, the Java editor bugs fixed along the way (F-44..F-59) and the limits:
`docs/EDITORS.md`.

## The board (HD-2D)

Pixel-art sprites stand in a real 3D board (three.js): tiles are extruded per 5 ft step, ramps are
wedges, engine lights are real point lights with shadows, and fliers hover over a ground shadow on a
tethered line. Details, the brief-to-implementation map and known limits: `docs/PHASE-4.md`.

- **Mouse:** click selects/acts as before; drag pans; wheel zooms in whole pixel steps; `Home` or ⌂
  resets the camera.
- **Toolbar (bottom-left of the board):** DM and player camera angle (tactical / top-down), backdrop
  blur and light glow, each saved in `campaign/ui_prefs.json` (`board.*`, `board.player.*`).
  ⟲ / ⟳ (or `[` / `]` on the DM board) turn the camera in 90° steps.
- **Sprites:** a sheet/character `spritePath` like `party/testsprites.png#3` (sheet row 3) is served
  from `resources/sprites/`; units without art get an initials
  token.
- `?bench=1` redraws every frame and shows fps / frame time / draw calls on the board (check the
  60 fps target on your GPU with `?scenario=perf&bench=1`). The board needs WebGL; without it the
  battle won't start and the TV window shows a message instead.

## Layout

```
server/src     Hono API over saves/ + campaign/ (assets bundle, whitelisted file read/write, battles, scenarios)
src/engine     PURE rules engine: reduce(state, command, ctx) → { state, events }  (no DOM, IO, clock)
src/assets     loaders/normalisers/writers for every saves/ JSON format
src/editors    the editable asset store (save/rename/delete) and pure sheet/form/browser logic
src/app        store, session, transports, player replica, persistence, prefs, entry points
src/ui         panels (plain DOM) + the board behind the BoardRenderer interface:
                 renderer/three/ HD-2D board, sprites/ sheet slicer,
                 editors/ Character Sheets, Asset Editor, Spell Editor
docs/visual-directions   Phase 3 proposals and mockups · docs/PHASE-4.md the HD-2D board ·
docs/EDITORS.md the editors
tests/, e2e/   Vitest rule/golden/app tests and Playwright suites
```
