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

Dev URLs: `/?scenario=test&seed=1` loads `scenarios/test.json` (self-contained fixture, party sheets
are *not* written back); `/?battle=<name>` loads `saves/battles/<name>.json`; `/?readonly=1` never
writes party sheets. Press `` ` `` in the DM window for the debug panel.

## Layout

```
server/src     Hono API over saves/ (assets bundle, whitelisted file read/write, battles, scenarios)
src/engine     PURE rules engine: reduce(state, command, ctx) → { state, events }  (no DOM, IO, clock)
src/assets     loaders/normalisers/writers for every saves/ JSON format
src/app        store, session, transports, player replica, persistence, prefs, entry points
src/ui         throwaway Phase 2 UI (plain DOM + Canvas2D) behind the BoardRenderer interface
docs/visual-directions   Phase 3 proposals and mockups
tests/, e2e/   Vitest rule/golden/app tests and Playwright suites
```
