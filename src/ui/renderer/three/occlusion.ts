/**
 * Is a point hidden from the locked tactical camera? The camera looks north
 * (azimuth 0) from above at `pitch`, so the line of sight from a point leaves
 * southward and upward through the same column. March the cells south of it
 * and compare each occluder's top with the ray height at the cell's near edge.
 * Pure and O(rows): cheap enough to run for every unit on every board change.
 */
export function isOccluded(
  heightAt: (r: number, c: number) => number | null,
  rows: number,
  r: number,
  c: number,
  y: number,
  pitch: number,
  maxHeight: number,
): boolean {
  const cos = Math.cos(pitch);
  if (cos < 1e-6) return false; // top-down: nothing stands between a tile and the camera
  const rise = Math.tan(pitch);
  for (let k = 1; r + k < rows; k++) {
    const rayY = y + (k - 0.5) * rise;
    if (rayY > maxHeight) return false;
    const h = heightAt(r + k, c);
    if (h !== null && h > rayY) return true;
  }
  return false;
}
