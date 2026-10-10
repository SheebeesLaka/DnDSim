// Direction A: straight top-down 2D (what PixiJS would render). Height reads from
// stacked contour bands + rim light / drop shadow per 5 ft step, chips on each
// plateau, gradient ramps with downhill chevrons, fliers lifted toward the
// camera with an offset ground shadow and an altitude chip.
import * as S from './scene.js';
import { chip, drawLegend, drawToken, hpText, roundRect, rgba } from './common2d.js';

const view = S.getView();
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = cv.width,
  H = cv.height;
const M = { top: 64, bottom: 44, side: 20 };
const cs = Math.floor(Math.min((W - M.side * 2) / S.COLS, (H - M.top - M.bottom) / S.ROWS));
const ox = Math.floor((W - cs * S.COLS) / 2);
const oy = M.top + Math.floor((H - M.top - M.bottom - cs * S.ROWS) / 2);
const X = (c) => ox + c * cs;
const Y = (r) => oy + r * cs;
const light = S.computeLighting();
const P = S.palette;

ctx.fillStyle = P.backdrop;
ctx.fillRect(0, 0, W, H);

// --- floor: colour by level, metal plating seams ---
function floorColor(e) {
  if (e < 0) return S.palette.pit[Math.min(1, -e - 1)];
  if (e >= 3) return P.floorHigh;
  return P.floor[e];
}
for (let r = 0; r < S.ROWS; r++) {
  for (let c = 0; c < S.COLS; c++) {
    const e = S.elevAt(r, c);
    const x = X(c),
      y = Y(r);
    const ramp = S.rampAt(r, c);
    if (ramp) {
      const g = ctx.createLinearGradient(x, y, x, y + cs);
      g.addColorStop(0, floorColor(ramp.from));
      g.addColorStop(1, floorColor(ramp.to));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = floorColor(e);
    }
    ctx.fillRect(x, y, cs, cs);
    // plating seams: two faint lines per tile, offset by parity
    ctx.strokeStyle = P.seam;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if ((r + c) % 2 === 0) {
      ctx.moveTo(x + cs * 0.5, y);
      ctx.lineTo(x + cs * 0.5, y + cs);
    } else {
      ctx.moveTo(x, y + cs * 0.5);
      ctx.lineTo(x + cs, y + cs * 0.5);
    }
    ctx.stroke();
    // rivets
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 4, y + 4, 2, 2);
    ctx.fillRect(x + cs - 6, y + cs - 6, 2, 2);
  }
}

// --- contour bands: for each edge where the neighbour is lower, draw a drop shadow
//     on the lower side (depth ∝ height difference) and a rim light on the upper side ---
const band = (diff) => Math.min(cs * 0.42, 5 + diff * 7);
for (let r = 0; r < S.ROWS; r++) {
  for (let c = 0; c < S.COLS; c++) {
    const e = S.elevAt(r, c);
    const x = X(c),
      y = Y(r);
    const nb = [
      { dr: 1, dc: 0 },
      { dr: -1, dc: 0 },
      { dr: 0, dc: 1 },
      { dr: 0, dc: -1 },
    ];
    for (const { dr, dc } of nb) {
      const nr = r + dr,
        nc = c + dc;
      if (!S.inBounds(nr, nc)) continue;
      const ne = S.elevAt(nr, nc);
      if (S.rampAt(r, c) || S.rampAt(nr, nc)) continue;
      if (ne >= e) continue;
      const diff = e - ne;
      const b = band(diff);
      // one dark band per 5 ft step so you can count the steps
      for (let s = 0; s < diff; s++) {
        const inset = (b / diff) * s;
        const bw = b / diff;
        ctx.fillStyle = `rgba(0,0,0,${0.32 - s * 0.05})`;
        if (dr === 1) ctx.fillRect(x, Y(nr) + inset, cs, bw);
        if (dr === -1) ctx.fillRect(x, Y(nr) + cs - inset - bw, cs, bw);
        if (dc === 1) ctx.fillRect(X(nc) + inset, y, bw, cs);
        if (dc === -1) ctx.fillRect(X(nc) + cs - inset - bw, y, bw, cs);
      }
      // rim light on the high side (sun from the north-west)
      ctx.fillStyle = dr === -1 || dc === -1 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
      if (dr === 1) ctx.fillRect(x, y + cs - 2, cs, 2);
      if (dr === -1) ctx.fillRect(x, y, cs, 2);
      if (dc === 1) ctx.fillRect(x + cs - 2, y, 2, cs);
      if (dc === -1) ctx.fillRect(x, y, 2, cs);
      // hard cliff line
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      if (dr === 1) ctx.fillRect(x, y + cs - 1, cs, 1.5);
      if (dr === -1) ctx.fillRect(x, y - 0.5, cs, 1.5);
      if (dc === 1) ctx.fillRect(x + cs - 1, y, 1.5, cs);
      if (dc === -1) ctx.fillRect(x - 0.5, y, 1.5, cs);
    }
  }
}
// hazard stripes along pit edges
for (const [r, c] of [
  [7, 2],
  [7, 3],
  [8, 1],
  [9, 1],
  [10, 2],
  [10, 3],
  [8, 4],
  [9, 4],
]) {
  const x = X(c),
    y = Y(r);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, cs, cs);
  ctx.clip();
  const toward = { dr: Math.sign(8.5 - r), dc: Math.sign(2.5 - c) };
  ctx.fillStyle = P.hazard;
  ctx.globalAlpha = 0.55;
  for (let i = -cs; i < cs * 2; i += 10) {
    ctx.beginPath();
    if (toward.dr !== 0) {
      const yy = toward.dr > 0 ? y + cs - 5 : y;
      ctx.rect(x + i, yy, 5, 5);
    } else {
      const xx = toward.dc > 0 ? x + cs - 5 : x;
      ctx.rect(xx, y + i, 5, 5);
    }
    ctx.fill();
  }
  ctx.restore();
}

// --- ramps: downhill chevrons ---
for (const rp of S.ramps) {
  const x = X(rp.c),
    y = Y(rp.r);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const yy = y + cs * (0.25 + i * 0.25);
    ctx.beginPath();
    ctx.moveTo(x + cs * 0.3, yy - 6);
    ctx.lineTo(x + cs * 0.5, yy + 4);
    ctx.lineTo(x + cs * 0.7, yy - 6);
    ctx.stroke();
  }
}

// --- terrain (walls are drawn after the lighting pass so they stay readable in the dark) ---
for (const t of S.terrain) {
  const x = X(t.c),
    y = Y(t.r);
  if (t.kind === 'crate') {
    ctx.fillStyle = '#6a5a3a';
    roundRect(ctx, x + 8, y + 8, cs - 16, cs - 16, 4);
    ctx.fill();
    ctx.strokeStyle = '#2b2416';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8);
    ctx.lineTo(x + cs - 8, y + cs - 8);
    ctx.moveTo(x + cs - 8, y + 8);
    ctx.lineTo(x + 8, y + cs - 8);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#3f7d3a';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs / 2, cs * 0.34, cs * 0.1, (i * Math.PI) / 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- grid lines ---
ctx.strokeStyle = P.grid;
ctx.lineWidth = 1;
for (let r = 0; r <= S.ROWS; r++) {
  ctx.beginPath();
  ctx.moveTo(ox, Y(r) + 0.5);
  ctx.lineTo(ox + cs * S.COLS, Y(r) + 0.5);
  ctx.stroke();
}
for (let c = 0; c <= S.COLS; c++) {
  ctx.beginPath();
  ctx.moveTo(X(c) + 0.5, oy);
  ctx.lineTo(X(c) + 0.5, oy + cs * S.ROWS);
  ctx.stroke();
}

// --- lighting: darkness overlay per cell, then additive light pools ---
for (let r = 0; r < S.ROWS; r++) {
  for (let c = 0; c < S.COLS; c++) {
    const lv = light.get(`${r},${c}`).level;
    const a = lv === 'bright' ? 0 : lv === 'dim' ? 0.45 : view === 'player' ? 0.97 : 0.5;
    if (a > 0) {
      ctx.fillStyle = `rgba(4,6,10,${a})`;
      ctx.fillRect(X(c), Y(r), cs, cs);
    }
  }
}
ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (const l of S.lights) {
  if (!l.on) continue;
  const at = l.at ?? S.tokenById(l.attachedTo);
  const cx = X(at.c) + cs / 2,
    cy = Y(at.r) + cs / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, (l.dim + 0.5) * cs);
  g.addColorStop(0, rgba(l.color, 0.32));
  g.addColorStop(l.bright / (l.dim + 0.5), rgba(l.color, 0.18));
  g.addColorStop(1, rgba(l.color, 0));
  ctx.fillStyle = g;
  // clip the pool to cells the light actually reaches, so walls/cliffs cast shadows
  ctx.save();
  ctx.beginPath();
  for (let r = 0; r < S.ROWS; r++)
    for (let c = 0; c < S.COLS; c++)
      if (light.get(`${r},${c}`).sources.some((s) => s.id === l.id)) ctx.rect(X(c), Y(r), cs, cs);
  ctx.clip();
  ctx.fillRect(cx - (l.dim + 1) * cs, cy - (l.dim + 1) * cs, (l.dim + 1) * 2 * cs, (l.dim + 1) * 2 * cs);
  ctx.restore();
}
ctx.restore();
// walls: bevelled bulkhead slabs, lit from the north-west, never fully swallowed by darkness
for (const w of S.walls) {
  const x = X(w.c),
    y = Y(w.r);
  ctx.fillStyle = P.wall;
  ctx.fillRect(x, y, cs, cs);
  ctx.fillStyle = P.wallTop;
  ctx.fillRect(x + 5, y + 5, cs - 10, cs - 10);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x, y, cs, 3);
  ctx.fillRect(x, y, 3, cs);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x + cs - 4, y, 4, cs);
  ctx.fillRect(x, y + cs - 4, cs, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, cs - 1.5, cs - 1.5);
  ctx.fillStyle = view === 'player' ? 'rgba(4,6,10,0.75)' : 'rgba(4,6,10,0.3)';
  ctx.fillRect(x, y, cs, cs);
}
// light source glyphs
for (const l of S.lights) {
  const at = l.at ?? S.tokenById(l.attachedTo);
  if (!l.at) continue; // the torch is carried: drawn with the token below
  const cx = X(at.c) + cs / 2,
    cy = Y(at.r) + cs / 2;
  ctx.fillStyle = l.on ? l.color : '#4a4f55';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (view === 'dm')
    chip(ctx, cx, cy + 20, `${l.name} ${l.on ? 'ON' : 'OFF'} · ${l.bright * 5}/${l.dim * 5} ft`, {
      size: 10,
      bold: false,
    });
}
// hangar group outline (DM only): the dark room whose lights can be restored at once
if (view === 'dm') {
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(191,227,255,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(X(7) + 2, Y(6) + 2, cs * 7 - 4, cs * 6 - 4);
  ctx.restore();
  chip(ctx, X(10) + cs / 2, Y(6) + 14, 'light group "hangar" — OFF (generator)', {
    size: 11,
    bold: false,
    fg: '#bfe3ff',
  });
}

// --- height chips (one per plateau) ---
for (const reg of S.heightRegions()) {
  const x = X(reg.label.c) + cs / 2,
    y = Y(reg.label.r) + 12;
  chip(ctx, x, y, S.ftLabel(reg.elev), {
    size: 12,
    bg: reg.elev > 0 ? 'rgba(255,255,255,0.88)' : 'rgba(20,30,50,0.9)',
    fg: reg.elev > 0 ? '#111' : '#9fd0ff',
  });
}
for (const rp of S.ramps)
  if (rp.c === S.ramps[0].c)
    chip(ctx, X(rp.c) + cs, Y(rp.r) + cs - 12, `ramp ${S.ftLabel(rp.from)} → 0`, { size: 11, bold: false });

// --- tokens (ground first, flier last) ---
const tokenD = cs * 0.72;
for (const t of S.tokens.filter((t) => !t.altitude)) {
  const lv = light.get(`${t.r},${t.c}`).level;
  if (view === 'player' && lv === 'dark') continue;
  const x = X(t.c) + cs / 2,
    y = Y(t.r) + cs / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 5, tokenD / 2, tokenD / 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  drawToken(ctx, x, y, tokenD, t, { alpha: lv === 'dark' ? 0.55 : 1, hidden: lv === 'dark' });
  const e = S.elevAt(t.r, t.c);
  if (e !== 0) chip(ctx, x, y + tokenD / 2 + 11, `on ${S.ftLabel(e)}`, { size: 10, bold: false });
  if (t.id === 'HK') {
    ctx.fillStyle = '#ffb366';
    ctx.beginPath();
    ctx.arc(x + tokenD / 2 - 2, y - tokenD / 2 + 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }
}
for (const t of S.tokens.filter((t) => t.altitude)) {
  const lv = light.get(`${t.r},${t.c}`).level;
  if (view === 'player' && lv === 'dark') continue;
  const gx = X(t.c) + cs / 2,
    gy = Y(t.r) + cs / 2;
  const lift = t.altitude * 7;
  // ground shadow stays on the cell; the token floats up-left toward the camera
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(gx, gy + 4, tokenD / 2.4, tokenD / 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx - lift, gy - lift);
  ctx.stroke();
  ctx.setLineDash([]);
  drawToken(ctx, gx - lift, gy - lift, tokenD * 1.08, t, {
    alpha: lv === 'dark' ? 0.55 : 1,
    hidden: lv === 'dark',
  });
  chip(ctx, gx - lift, gy - lift - tokenD * 0.54 - 10, `▲ ${t.altitude * 5} ft`, {
    size: 12,
    bg: 'rgba(120,200,255,0.92)',
    fg: '#06182a',
  });
}
// HP numbers under party members (DM view)
if (view === 'dm')
  for (const t of S.tokens) {
    const x = X(t.c) + cs / 2 - (t.altitude ? t.altitude * 7 : 0),
      y = Y(t.r) + cs / 2 - (t.altitude ? t.altitude * 7 : 0);
    if (!(S.elevAt(t.r, t.c) !== 0 && !t.altitude)) hpText(ctx, x, y + tokenD / 2 + 11, t, 10);
  }

drawLegend(
  ctx,
  W,
  H,
  'A — Top-down 2D (PixiJS)',
  'contour bands + rim light per 5 ft step · plateau chips · gradient ramp · flier lifted, offset shadow · light pools clipped by walls and cliffs',
  view,
);
document.title = 'A ready';
