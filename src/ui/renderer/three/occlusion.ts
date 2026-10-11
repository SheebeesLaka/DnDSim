/**
 * Is a point hidden from the locked tactical camera? The camera looks down at
 * `pitch` from the ground heading `heading` (the direction toward it is
 * (sin, cos) in (x, z) = (c, r)), so the line of sight from a point leaves
 * along that heading and rises tan(pitch) per cell of ground travelled. Walk
 * the cells it crosses (Amanatides–Woo) and compare each occluder's top with
 * the ray height where the ray enters that cell. Pure and O(rows + cols):
 * cheap enough to run for every unit on every board change.
 */
export function isOccluded(
  heightAt: (r: number, c: number) => number | null,
  rows: number,
  cols: number,
  r: number,
  c: number,
  y: number,
  pitch: number,
  heading: number,
  maxHeight: number,
): boolean {
  const cos = Math.cos(pitch);
  if (cos < 1e-6) return false; // top-down: nothing stands between a tile and the camera
  const rise = Math.tan(pitch);
  const dx = Math.sin(heading),
    dz = Math.cos(heading);
  const EPS = 1e-9;
  const stepC = dx > EPS ? 1 : dx < -EPS ? -1 : 0;
  const stepR = dz > EPS ? 1 : dz < -EPS ? -1 : 0;
  // ground distance to the first column / row boundary, then between boundaries
  let tMaxC = stepC === 0 ? Infinity : 0.5 / Math.abs(dx);
  let tMaxR = stepR === 0 ? Infinity : 0.5 / Math.abs(dz);
  const tDeltaC = stepC === 0 ? Infinity : 1 / Math.abs(dx);
  const tDeltaR = stepR === 0 ? Infinity : 1 / Math.abs(dz);
  let cr = r,
    cc = c;
  for (;;) {
    let t: number;
    if (tMaxC < tMaxR) {
      t = tMaxC;
      cc += stepC;
      tMaxC += tDeltaC;
    } else {
      t = tMaxR;
      cr += stepR;
      tMaxR += tDeltaR;
    }
    if (cr < 0 || cc < 0 || cr >= rows || cc >= cols || t === Infinity) return false;
    const rayY = y + t * rise;
    if (rayY > maxHeight) return false;
    const h = heightAt(cr, cc);
    if (h !== null && h > rayY) return true;
  }
}
