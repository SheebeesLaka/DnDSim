/**
 * UI/AttributeRadarChart.java: six axes STR..CHA from the top clockwise, rings
 * every 3, scale at least 12 and growing to fit, 25 % blue fill, labels in the
 * stat colours.
 */
import { ATTRIBUTE_SHORT } from '../../assets/types.ts';

const STAT_COLORS = ['#d75f5f', '#4CAF50', '#2196F3', '#FF9800', '#4ec9b0', '#c586c0'];

export function drawRadar(canvas: HTMLCanvasElement, values: readonly number[], size = 200): void {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2,
    cy = size / 2,
    radius = size / 2 - 26;
  const max = Math.max(12, Math.ceil(Math.max(0, ...values) / 3) * 3);
  const point = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    const r = (Math.max(0, v) / max) * radius;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let ring = 3; ring <= max; ring += 3) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const [x, y] = point(i % 6, ring);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const [x, y] = point(i, max);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.beginPath();
  values.slice(0, 6).forEach((v, i) => {
    const [x, y] = point(i, v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(86,156,214,0.25)';
  ctx.fill();
  ctx.strokeStyle = '#569cd6';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    ctx.fillStyle = STAT_COLORS[i] ?? '#ccc';
    ctx.fillText(
      `${ATTRIBUTE_SHORT[i] ?? ''} ${values[i] ?? 0}`,
      cx + Math.cos(a) * (radius + 14),
      cy + Math.sin(a) * (radius + 12),
    );
  }
}

export { STAT_COLORS };
