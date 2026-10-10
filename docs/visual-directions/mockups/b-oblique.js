// Direction B: 2.5D oblique (PixiJS). The grid stays square and top-down for
// tactical reading, but every 5 ft step gets a real south-facing side slab, so
// platforms stack, pits show their inner walls, ramps are wedges and fliers hang
// above their shadow on a tether. Drawn back-to-front by row.
import * as S from './scene.js';
import { chip, drawLegend, drawToken, hpText, roundRect, rgba, shade } from './common2d.js';

const view = S.getView();
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = cv.width,
  H = cv.height;
const LIFT_RATIO = 0.42; // screen lift per 5 ft step, as a fraction of a cell
const maxE = 3,
  minE = -2;
const M = { top: 64, bottom: 44, side: 20 };
const cs = Math.floor(
  Math.min((W - M.side * 2) / S.COLS, (H - M.top - M.bottom) / (S.ROWS + (maxE - minE) * LIFT_RATIO)),
);
const lift = cs * LIFT_RATIO;
const ox = Math.floor((W - cs * S.COLS) / 2);
const oy = M.top + Math.floor((H - M.top - M.bottom - cs * S.ROWS - (maxE - minE) * lift) / 2) + maxE * lift;
const X = (c) => ox + c * cs;
const Ytop = (r, e) => oy + r * cs - e * lift; // screen y of a cell's top face, given its elevation
const light = S.computeLighting();
const P = S.palette;

ctx.fillStyle = P.backdrop;
ctx.fillRect(0, 0, W, H);

function topColor(e) {
  if (e < 0) return P.pit[Math.min(1, -e - 1)];
  if (e >= 3) return P.floorHigh;
  return P.floor[e];
}
const darkness = (r, c) => {
  const lv = light.get(`${r},${c}`).level;
  return lv === 'bright' ? 0 : lv === 'dim' ? 0.45 : view === 'player' ? 0.97 : 0.5;
};

function drawFace(x, yFrom, yTo, baseColor, steps, e, r, c) {
  // south face from yFrom down to yTo, banded per 5 ft step with a lit top lip
  const h = yTo - yFrom;
  if (h <= 0) return;
  ctx.fillStyle = shade(baseColor, 0.52);
  ctx.fillRect(x, yFrom, cs, h);
  const stepH = h / steps;
  for (let s = 0; s < steps; s++) {
    const y = yFrom + s * stepH;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, cs, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + stepH - 2, cs, 2);
    // panel ribs
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + cs * 0.33, y + 3, 1.5, stepH - 6);
    ctx.fillRect(x + cs * 0.66, y + 3, 1.5, stepH - 6);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, yFrom + 0.5, cs - 1, h - 1);
  const a = darkness(r, c);
  if (a > 0) {
    ctx.fillStyle = `rgba(4,6,10,${a})`;
    ctx.fillRect(x, yFrom, cs, h);
  }
}

const tokenD = cs * 0.72;

for (let r = 0; r < S.ROWS; r++) {
  // 1. top faces + their south faces for this row
  for (let c = 0; c < S.COLS; c++) {
    const e = S.elevAt(r, c);
    const ramp = S.rampAt(r, c);
    const x = X(c);
    if (ramp) {
      // wedge: top edge at `from` height, bottom edge at `to` height
      const yN = Ytop(r, ramp.from),
        yS = Ytop(r + 1, ramp.to);
      const g = ctx.createLinearGradient(0, yN, 0, yS);
      g.addColorStop(0, topColor(ramp.from));
      g.addColorStop(1, topColor(ramp.to));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, yN);
      ctx.lineTo(x + cs, yN);
      ctx.lineTo(x + cs, yS);
      ctx.lineTo(x, yS);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
      // treads
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let i = 1; i < 5; i++) {
        const yy = yN + ((yS - yN) * i) / 5;
        ctx.beginPath();
        ctx.moveTo(x + 4, yy);
        ctx.lineTo(x + cs - 4, yy);
        ctx.stroke();
      }
      const a = darkness(r, c);
      if (a > 0) {
        ctx.fillStyle = `rgba(4,6,10,${a})`;
        ctx.fillRect(x, yN, cs, yS - yN);
      }
      continue;
    }
    const y = Ytop(r, e);
    ctx.fillStyle = topColor(e);
    ctx.fillRect(x, y, cs, cs);
    ctx.strokeStyle = P.seam;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if ((r + c) % 2 === 0) {
      ctx.moveTo(x + cs / 2, y);
      ctx.lineTo(x + cs / 2, y + cs);
    } else {
      ctx.moveTo(x, y + cs / 2);
      ctx.lineTo(x + cs, y + cs / 2);
    }
    ctx.stroke();
    // grid
    ctx.strokeStyle = P.grid;
    ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
    // lit north/west lips where the neighbour is lower (sun from NW)
    if (S.elevAt(r - 1, c) < e || r === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, cs, 2);
    }
    if (S.elevAt(r, c - 1) < e) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x, y, 2, cs);
    }
    // pit edge hazard stripes
    if (
      e >= 0 &&
      [S.elevAt(r + 1, c), S.elevAt(r - 1, c), S.elevAt(r, c + 1), S.elevAt(r, c - 1)].some((n) => n < 0)
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cs, cs);
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = P.hazard;
      for (let i = 0; i < cs; i += 10) {
        if (S.elevAt(r + 1, c) < 0) ctx.fillRect(x + i, y + cs - 5, 5, 5);
        if (S.elevAt(r - 1, c) < 0) ctx.fillRect(x + i, y, 5, 5);
        if (S.elevAt(r, c + 1) < 0) ctx.fillRect(x + cs - 5, y + i, 5, 5);
        if (S.elevAt(r, c - 1) < 0) ctx.fillRect(x, y + i, 5, 5);
      }
      ctx.restore();
    }
    // darkness on the top face
    const a = darkness(r, c);
    if (a > 0) {
      ctx.fillStyle = `rgba(4,6,10,${a})`;
      ctx.fillRect(x, y, cs, cs);
    }
    // south face down to the southern neighbour's top (or the floor beyond the board)
    const southE = S.inBounds(r + 1, c) ? (S.rampAt(r + 1, c)?.from ?? S.elevAt(r + 1, c)) : Math.min(0, e);
    if (southE < e) drawFace(x, y + cs, Ytop(r + 1, southE), topColor(e), e - southE, e, r, c);
    // east face sliver for a hint of volume
    const eastE = S.inBounds(r, c + 1) ? S.elevAt(r, c + 1) : e;
    if (eastE < e && !S.rampAt(r, c + 1)) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + cs - 3, y, 3, cs);
    }
  }
  // 2. walls on this row (tall slabs)
  for (const w of S.walls.filter((w) => w.r === r)) {
    const x = X(w.c),
      e = S.elevAt(w.r, w.c);
    const top = Ytop(w.r, e) - 2 * lift;
    ctx.fillStyle = shade(P.wall, 0.55);
    ctx.fillRect(x, top + cs, cs, 2 * lift); // south face
    ctx.fillStyle = P.wallTop;
    ctx.fillRect(x, top, cs, cs);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeRect(x + 0.5, top + 0.5, cs - 1, cs + 2 * lift - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, top, cs, 2);
    const a = darkness(w.r, w.c);
    if (a > 0) {
      ctx.fillStyle = `rgba(4,6,10,${Math.min(a, view === 'player' ? 0.75 : 0.3)})`;
      ctx.fillRect(x, top, cs, cs + 2 * lift);
    }
  }
  // 3. terrain on this row
  for (const t of S.terrain.filter((t) => t.r === r)) {
    const x = X(t.c),
      y = Ytop(t.r, S.elevAt(t.r, t.c));
    if (t.kind === 'crate') {
      const hh = lift * 0.9;
      ctx.fillStyle = '#4a3f28';
      ctx.fillRect(x + 8, y + 8 - hh + cs - 16, cs - 16, hh); // front
      ctx.fillStyle = '#6a5a3a';
      roundRect(ctx, x + 8, y + 8 - hh, cs - 16, cs - 16, 3);
      ctx.fill();
      ctx.strokeStyle = '#2b2416';
      ctx.lineWidth = 2;
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
  // 4. ground tokens on this row (tokens standing in a pit are deferred to the end so the
  //    next row's floor rim does not hide them — the oblique view's cut-away rule)
  for (const t of S.tokens.filter((t) => t.r === r && !t.altitude && S.elevAt(t.r, t.c) >= 0)) {
    const lv = light.get(`${t.r},${t.c}`).level;
    if (view === 'player' && lv === 'dark') continue;
    const e = S.elevAt(t.r, t.c);
    const x = X(t.c) + cs / 2,
      y = Ytop(t.r, e) + cs * 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y + tokenD * 0.42, tokenD * 0.5, tokenD * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    drawToken(ctx, x, y, tokenD, t, { alpha: lv === 'dark' ? 0.55 : 1, hidden: lv === 'dark' });
    if (t.id === 'HK') {
      ctx.fillStyle = '#ffb366';
      ctx.beginPath();
      ctx.arc(x + tokenD / 2 - 2, y - tokenD / 2 + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    if (view === 'dm') hpText(ctx, x, y + tokenD / 2 + 12, t, 10);
  }
  // 5. fliers whose ground cell is on this row: shadow on the floor, token lifted, tether
  for (const t of S.tokens.filter((t) => t.r === r && t.altitude)) {
    const lv = light.get(`${t.r},${t.c}`).level;
    if (view === 'player' && lv === 'dark') continue;
    const e = S.elevAt(t.r, t.c);
    const gx = X(t.c) + cs / 2,
      gy = Ytop(t.r, e) + cs * 0.55;
    const ty = gy - t.altitude * lift;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(gx, gy + tokenD * 0.42, tokenD * 0.42, tokenD * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gx, gy + tokenD * 0.42);
    ctx.lineTo(gx, ty + tokenD / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // altitude ticks every 5 ft on the tether
    for (let s = 1; s <= t.altitude; s++) {
      ctx.fillStyle = '#9fd0ff';
      ctx.fillRect(gx - 5, gy + tokenD * 0.42 - s * lift, 10, 2);
    }
    drawToken(ctx, gx, ty, tokenD, t, { alpha: lv === 'dark' ? 0.55 : 1, hidden: lv === 'dark' });
    chip(ctx, gx, ty - tokenD / 2 - 12, `▲ ${t.altitude * 5} ft`, {
      size: 12,
      bg: 'rgba(120,200,255,0.92)',
      fg: '#06182a',
    });
    if (view === 'dm') hpText(ctx, gx + tokenD * 0.9, ty, t, 10);
  }
}

// deferred pit tokens, ghosted through the rim with a dark halo
for (const t of S.tokens.filter((t) => !t.altitude && S.elevAt(t.r, t.c) < 0)) {
  const lv = light.get(`${t.r},${t.c}`).level;
  if (view === 'player' && lv === 'dark') continue;
  const e = S.elevAt(t.r, t.c);
  const x = X(t.c) + cs / 2,
    y = Ytop(t.r, e) + cs * 0.55;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(x, y, tokenD * 0.72, 0, Math.PI * 2);
  ctx.fill();
  drawToken(ctx, x, y, tokenD, t, { alpha: lv === 'dark' ? 0.55 : 1, hidden: lv === 'dark' });
  chip(ctx, x, y + tokenD / 2 + 12, `in pit ${S.ftLabel(e)}`, { size: 10, bold: false });
  if (view === 'dm') hpText(ctx, x + tokenD * 0.95, y, t, 10);
}

// additive light pools, clipped to lit cells (projected top faces)
ctx.save();
ctx.globalCompositeOperation = 'lighter';
for (const l of S.lights) {
  if (!l.on) continue;
  const at = l.at ?? S.tokenById(l.attachedTo);
  const cx = X(at.c) + cs / 2,
    cy = Ytop(at.r, S.elevAt(at.r, at.c)) + cs / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, (l.dim + 0.5) * cs);
  g.addColorStop(0, rgba(l.color, 0.3));
  g.addColorStop(l.bright / (l.dim + 0.5), rgba(l.color, 0.16));
  g.addColorStop(1, rgba(l.color, 0));
  ctx.fillStyle = g;
  ctx.save();
  ctx.beginPath();
  for (let r = 0; r < S.ROWS; r++)
    for (let c = 0; c < S.COLS; c++)
      if (light.get(`${r},${c}`).sources.some((s) => s.id === l.id)) {
        const e = S.elevAt(r, c);
        ctx.rect(X(c), Ytop(r, e), cs, cs);
      }
  ctx.clip();
  ctx.fillRect(cx - (l.dim + 1) * cs, cy - (l.dim + 1) * cs, (l.dim + 1) * 2 * cs, (l.dim + 1) * 2 * cs);
  ctx.restore();
}
ctx.restore();
for (const l of S.lights) {
  if (!l.at) continue;
  const cx = X(l.at.c) + cs / 2,
    cy = Ytop(l.at.r, S.elevAt(l.at.r, l.at.c)) + cs / 2;
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
if (view === 'dm') {
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(191,227,255,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(X(7) + 2, Ytop(6, 0) + 2, cs * 7 - 4, cs * 6 - 4);
  ctx.restore();
  chip(ctx, X(10) + cs / 2, Ytop(6, 0) + 14, 'light group "hangar" — OFF (generator)', {
    size: 11,
    bold: false,
    fg: '#bfe3ff',
  });
}

// height chips: on the face of each plateau's south edge (reads like a sign on the wall) + one on top
for (const reg of S.heightRegions()) {
  const { r, c } = reg.label;
  chip(ctx, X(c) + cs / 2, Ytop(r, reg.elev) + 12, S.ftLabel(reg.elev), {
    size: 12,
    bg: reg.elev > 0 ? 'rgba(255,255,255,0.88)' : 'rgba(20,30,50,0.9)',
    fg: reg.elev > 0 ? '#111' : '#9fd0ff',
  });
}
chip(ctx, X(10) + cs, Ytop(6, 0) - 6, 'ramp +5 ft → 0', { size: 11, bold: false });

drawLegend(
  ctx,
  W,
  H,
  'B — 2.5D oblique (PixiJS)',
  'square grid + a real side slab per 5 ft step · pits show inner walls · wedge ramps · flier on a ticked tether · light pools shade the slabs too',
  view,
);
document.title = 'B ready';
