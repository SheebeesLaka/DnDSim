// Canvas2D helpers shared by mockups A and B: tokens, chips, legend, lighting overlay.
import { palette } from './scene.js';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function chip(
  ctx,
  x,
  y,
  text,
  { size = 12, bg = palette.chipBg, fg = palette.chipText, align = 'center', bold = true } = {},
) {
  ctx.save();
  ctx.font = `${bold ? '700' : '500'} ${size}px "Segoe UI", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 0.9;
  const h = size * 1.55;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  roundRect(ctx, left, y - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + w / 2, y + 0.5);
  ctx.restore();
  return { w, h };
}

/**
 * Draw a token centred at (x, y) with diameter `d`.
 * Party = circle, enemy = rounded square. HP arc, initials, selected/active rings.
 */
export function drawToken(ctx, x, y, d, t, { alpha = 1, hidden = false } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const sideColor = t.side === 'party' ? palette.ally : palette.enemy;
  const r = d / 2;
  const shape = () => {
    if (t.side === 'party') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else {
      roundRect(ctx, x - r, y - r, d, d, d * 0.22);
    }
  };
  // body
  shape();
  ctx.fillStyle = t.color;
  ctx.fill();
  // inner darkening so light initials read on light colours
  shape();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  // side ring
  shape();
  ctx.lineWidth = Math.max(3, d * 0.09);
  ctx.strokeStyle = sideColor;
  if (hidden) ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  // HP arc (track + value) just outside the ring
  const pct = Math.max(0, Math.min(1, t.hp / t.max));
  const hpColor = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#e6b23c' : '#d75f5f';
  ctx.lineWidth = Math.max(3, d * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, r + d * 0.14, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r + d * 0.14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.strokeStyle = hpColor;
  ctx.stroke();
  // initials
  ctx.font = `800 ${Math.round(d * 0.42)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, d * 0.08);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineJoin = 'round';
  ctx.strokeText(t.id, x, y + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(t.id, x, y + 1);
  // selected: orange double ring
  if (t.selected) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.selected;
    ctx.beginPath();
    ctx.arc(x, y, r + d * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + d * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  }
  // active turn: gold ring with four notches + a pennant above
  if (t.active) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = palette.active;
    ctx.setLineDash([d * 0.35, d * 0.14]);
    ctx.beginPath();
    ctx.arc(x, y, r + d * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = palette.active;
    ctx.beginPath();
    ctx.moveTo(x - d * 0.16, y - r - d * 0.62);
    ctx.lineTo(x + d * 0.16, y - r - d * 0.62);
    ctx.lineTo(x, y - r - d * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function hpText(ctx, x, y, t, size) {
  chip(ctx, x, y, `${t.hp}/${t.max}`, { size, bg: 'rgba(0,0,0,0.7)' });
}

/** Title + legend strip, identical across mockups so the screenshots compare cleanly. */
export function drawLegend(ctx, W, H, title, subtitle, view) {
  ctx.save();
  ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#e8eef5';
  ctx.textBaseline = 'top';
  ctx.fillText(title, 18, 12);
  ctx.font = '500 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = palette.dimText;
  ctx.fillText(subtitle + (view === 'player' ? '   ·   PLAYER VIEW' : '   ·   DM VIEW (reveal on)'), 18, 40);
  const items = [
    ['#ffe3b0', 'bright'],
    ['#6b6252', 'dim'],
    ['#15181c', 'dark'],
    [palette.ally, 'ally'],
    [palette.enemy, 'enemy'],
    [palette.selected, 'selected'],
    [palette.active, 'active turn'],
  ];
  let x = 18;
  const y = H - 24;
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const [color, label] of items) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y - 7, 14, 14, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
    ctx.fillStyle = '#c9d3dd';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 19, y);
    x += 19 + ctx.measureText(label).width + 18;
  }
  ctx.fillStyle = palette.dimText;
  ctx.fillText(
    'chips = height in 5 ft steps   ·   ▲ = altitude of a flier   ·   dashed = seen only by the DM',
    x + 6,
    y,
  );
  ctx.restore();
}

/** Parse "#rrggbb" to [r,g,b]. */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex, a) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
export function shade(hex, f) {
  const [r, g, b] = rgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${r},${g},${b})`;
}
