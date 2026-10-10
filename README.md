# Cassandralis Combat Simulator (web rebuild)

TypeScript + Vite rebuild of the JavaFX combat simulator in `legacy-java/` (kept untouched as the
reference implementation; `FEATURES.md` is the rule inventory both share). The combat rules are
unchanged; the port is checked rule by rule against FEATURES.md in `tests/rules/`.

## Run

```sh
npm install
npm start          # builds if needed, serves http://127.0.0.1:8787 and opens the DM window
```

- DM window: `http://127.0.0.1:8787/` · player window: `http://127.0.0.1:8787/player` (open it in a
  second browser window/tab of the same browser; it mirrors the DM board live).
- The app reads and writes the repo-root `saves/` folder through a small local server, so your
  existing JSON files keep working and party sheets are written back like the Java app did.

## Develop

```sh
npm run dev            # Vite on :5173 (+ API on :8787 behind /api)
npm test               # unit/rule tests (watch)
npm run check          # lint + typecheck + unit tests with coverage + build + Playwright e2e
node scripts/smoke-ui.mjs   # drive the real UI headlessly, screenshots in docs/progress/
```

Dev URLs: `/?scenario=test&seed=1` loads `scenarios/test.json` (self-contained fixture: party sheets
and prefs are *not* written back); `/?scenario=perf` is the 25×25 / 40 units / 20 lights stress
scene; `/?battle=<name>` loads `saves/battles/<name>.json`; `/?readonly=1` never writes party sheets
or prefs. Press `` ` `` in the DM window for the debug panel.

## The board (HD-2D)

Pixel-art sprites stand in a real 3D board (three.js): tiles are extruded per 5 ft step, ramps are
wedges, engine lights are real point lights with shadows, and fliers hover over a ground shadow on a
tethered line. Details, the brief-to-implementation map and known limits: `docs/PHASE-4.md`.

- **Mouse:** click selects/acts as before; drag pans; wheel zooms in whole pixel steps; `Home` or ⌂
  resets the camera.
- **Toolbar (bottom-left of the board):** DM and player camera angle (tactical / top-down), backdrop
  blur and light glow, each saved in `saves/ui_prefs.json` (`board.*`, `board.player.*`).
- **Sprites:** a sheet/character `spritePath` like `party/testsprites.png#3` (sheet row 3) is served
  from `resources/sprites/` or `legacy-java/resources/sprites/`; units without art get an initials
  token.
- `?bench=1` redraws every frame and shows fps / frame time / draw calls on the board (check the
  60 fps target on your GPU with `?scenario=perf&bench=1`). `?renderer=2d` (or a browser without
  WebGL) uses the plain Phase 2 board.

## Layout

```
server/src     Hono API over saves/ (assets bundle, whitelisted file read/write, battles, scenarios)
src/engine     PURE rules engine: reduce(state, command, ctx) → { state, events }  (no DOM, IO, clock)
src/assets     loaders/normalisers/writers for every saves/ JSON format
src/app        store, session, transports, player replica, persistence, prefs, entry points
src/ui         panels (plain DOM) + the board behind the BoardRenderer interface:
                 renderer/three/ HD-2D board, renderer/canvas2d.ts fallback, sprites/ sheet slicer
docs/visual-directions   Phase 3 proposals and mockups · docs/PHASE-4.md the HD-2D board
tests/, e2e/   Vitest rule/golden/app tests and Playwright suites
```
