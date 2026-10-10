// Shared test scene for the three Phase 3 mockups. Same data, three renderers.
// Distances are in tiles (5 ft). Elevation is in 5 ft steps; negative = pit.

export const COLS = 14;
export const ROWS = 12;

/** Per-cell elevation in 5 ft steps. */
export const elevation = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
// Raised platform (+10 ft) with an L-shaped ledge (+5 ft) and a two-wide ramp down to the floor.
for (let r = 1; r <= 3; r++) for (let c = 9; c <= 12; c++) elevation[r][c] = 2;
for (let c = 9; c <= 12; c++) elevation[4][c] = 1;
for (let r = 1; r <= 4; r++) elevation[r][8] = 1;
// A second, higher outcrop on the ledge so three levels sit next to each other.
elevation[1][12] = 3;
// Pit (-5 ft) with a deeper corner (-10 ft).
for (let r = 8; r <= 9; r++) for (let c = 2; c <= 3; c++) elevation[r][c] = -1;
elevation[9][3] = -2;

/** Ramp cells: a sloped tile from `from` down to `to`, facing `dir` (downhill direction). */
export const ramps = [
  { r: 5, c: 10, from: 1, to: 0, dir: 'S' },
  { r: 5, c: 11, from: 1, to: 0, dir: 'S' },
];
export const rampAt = (r, c) => ramps.find((x) => x.r === r && x.c === c);

/** Walls block movement and light; crates block movement only (but cast a light shadow when tall). */
export const walls = [];
for (let r = 5; r <= 10; r++) if (r !== 8) walls.push({ r, c: 6 });
export const wallAt = (r, c) => walls.some((w) => w.r === r && w.c === c);

export const terrain = [
  { r: 4, c: 3, kind: 'crate', label: 'Crate', hp: 20 },
  { r: 4, c: 4, kind: 'crate', label: 'Crate', hp: 20 },
  { r: 10, c: 11, kind: 'fern', label: 'Fern', hp: 1, walkable: true },
];

/** Light sources. `at` = fixed cell; `attachedTo` = token id. Radii in tiles. */
export const lights = [
  {
    id: 'lamp',
    name: 'Wall lamp',
    at: { r: 1, c: 1 },
    bright: 3,
    dim: 5,
    color: '#ffe3b0',
    on: true,
    group: 'corridor',
  },
  { id: 'torch', name: "Henry's torch", attachedTo: 'HK', bright: 2, dim: 4, color: '#ffb366', on: true },
  // The hangar lights are OFF: that whole room is the "area in darkness" until the generator is restored.
  {
    id: 'hangar',
    name: 'Hangar ceiling',
    at: { r: 9, c: 10 },
    bright: 4,
    dim: 6,
    color: '#bfe3ff',
    on: false,
    group: 'hangar',
  },
];

export const tokens = [
  {
    id: 'HK',
    name: 'Henry Keaton',
    side: 'party',
    color: '#8B0000',
    r: 6,
    c: 4,
    hp: 20,
    max: 36,
    active: true,
  },
  {
    id: 'GW',
    name: 'Grand Wizard Man',
    side: 'party',
    color: '#CCCCCC',
    r: 2,
    c: 10,
    hp: 20,
    max: 20,
    selected: true,
  },
  { id: 'MG', name: 'Magnolia', side: 'party', color: '#800080', r: 7, c: 3, hp: 8, max: 20 },
  { id: 'SP', name: 'Spider', side: 'enemy', color: '#0000FF', r: 2, c: 12, hp: 18, max: 18 },
  { id: 'SN', name: 'Snake', side: 'enemy', color: '#008000', r: 7, c: 7, hp: 9, max: 14 },
  {
    id: 'OH',
    name: 'Overgrown Hornet',
    side: 'enemy',
    color: '#B3661A',
    r: 8,
    c: 9,
    hp: 20,
    max: 20,
    altitude: 3,
  },
  { id: 'HP', name: 'Human Puppet', side: 'enemy', color: '#d75f5f', r: 9, c: 2, hp: 18, max: 18 },
];
export const tokenAt = (r, c) => tokens.find((t) => t.r === r && t.c === c);
export const tokenById = (id) => tokens.find((t) => t.id === id);

export const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const elevAt = (r, c) => (inBounds(r, c) ? elevation[r][c] : 0);

// ---------------------------------------------------------------------------
// Lighting: bright / dim / dark per cell, with line-of-sight occlusion by
// walls and by terrain higher than both the light and the target.
// ---------------------------------------------------------------------------

function lightCell(light) {
  if (light.at) return { r: light.at.r, c: light.at.c, elev: elevAt(light.at.r, light.at.c) + 1 };
  const t = tokenById(light.attachedTo);
  return { r: t.r, c: t.c, elev: elevAt(t.r, t.c) + (t.altitude ?? 0) + 1 };
}

/** Cells crossed between two cell centres (supercover line), excluding both ends. */
function cellsBetween(r0, c0, r1, c1) {
  const out = [];
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0)) * 2;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const r = Math.round(r0 + (r1 - r0) * t);
    const c = Math.round(c0 + (c1 - c0) * t);
    if ((r !== r0 || c !== c0) && (r !== r1 || c !== c1)) {
      if (!out.some((p) => p.r === r && p.c === c)) out.push({ r, c });
    }
  }
  return out;
}

export function hasLineOfLight(from, r, c) {
  const targetElev = elevAt(r, c);
  for (const p of cellsBetween(from.r, from.c, r, c)) {
    if (wallAt(p.r, p.c)) return false;
    const e = elevAt(p.r, p.c);
    if (e > from.elev - 1 && e > targetElev) return false; // higher ground in the way
  }
  return true;
}

/** @returns Map "r,c" -> { level: 'bright'|'dim'|'dark', sources: [{id,color,strength}] } */
export function computeLighting() {
  const map = new Map();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) map.set(`${r},${c}`, { level: 'dark', sources: [] });
  for (const light of lights) {
    if (!light.on) continue;
    const src = lightCell(light);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const d = Math.hypot(r - src.r, c - src.c);
        if (d > light.dim + 0.01) continue;
        if (wallAt(r, c)) continue;
        if (!hasLineOfLight(src, r, c)) continue;
        const cell = map.get(`${r},${c}`);
        const level = d <= light.bright + 0.01 ? 'bright' : 'dim';
        if (level === 'bright' || cell.level === 'dark') cell.level = level;
        cell.sources.push({
          id: light.id,
          color: light.color,
          strength:
            level === 'bright' ? 1 - d / (light.dim + 1) : 0.45 - (d - light.bright) / (light.dim * 2.5),
        });
      }
    }
  }
  return map;
}

/** Connected plateaus of equal non-zero elevation, each with a label cell, for height chips. */
export function heightRegions() {
  const seen = new Set();
  const regions = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const e = elevation[r][c];
      const key = `${r},${c}`;
      if (e === 0 || seen.has(key) || rampAt(r, c)) continue;
      const cells = [];
      const stack = [[r, c]];
      seen.add(key);
      while (stack.length) {
        const [cr, cc] = stack.pop();
        cells.push({ r: cr, c: cc });
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nr = cr + dr,
            nc = cc + dc,
            nk = `${nr},${nc}`;
          if (inBounds(nr, nc) && !seen.has(nk) && elevation[nr][nc] === e && !rampAt(nr, nc)) {
            seen.add(nk);
            stack.push([nr, nc]);
          }
        }
      }
      const mr = cells.reduce((s, x) => s + x.r, 0) / cells.length;
      const mc = cells.reduce((s, x) => s + x.c, 0) / cells.length;
      const free = cells.filter(
        (x) => !tokenAt(x.r, x.c) && !terrain.some((t) => t.r === x.r && t.c === x.c),
      );
      const pool = free.length ? free : cells;
      const label = pool.reduce(
        (best, x) => (Math.hypot(x.r - mr, x.c - mc) < Math.hypot(best.r - mr, best.c - mc) ? x : best),
        pool[0],
      );
      regions.push({ elev: e, cells, label });
    }
  }
  return regions;
}

export const ftLabel = (steps) => `${steps > 0 ? '+' : '−'}${Math.abs(steps) * 5} ft`;

export function getView() {
  const v = new URLSearchParams(location.search).get('view');
  return v === 'player' ? 'player' : 'dm';
}

// Shared palette (moonbase facility)
export const palette = {
  backdrop: '#0b0d10',
  floor: ['#2b3036', '#3f4852', '#546070'], // ground, +1, +2 (lighter alloy as you go up)
  floorHigh: '#6b7a8c',
  pit: ['#20242a', '#171a1f'],
  seam: 'rgba(0,0,0,0.35)',
  grid: 'rgba(170,190,210,0.28)',
  hazard: '#e2b614',
  wall: '#5b6670',
  wallTop: '#7a8792',
  ally: '#4CAF50',
  enemy: '#d75f5f',
  selected: '#ff9f1a',
  active: '#ffd54f',
  chipBg: 'rgba(12,14,18,0.86)',
  chipText: '#e8eef5',
  dimText: '#9aa7b4',
};
