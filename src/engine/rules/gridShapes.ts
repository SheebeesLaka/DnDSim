/** UI/Battle/GridShapes.java: playable-cell masks for the built-in shapes (R4.1). */
export type ShapeType = 'RECTANGLE' | 'CIRCLE' | 'DIAMOND' | 'PLUS' | 'CUSTOM';

export function circleMask(rows: number, cols: number): boolean[][] {
  const rr = rows / 2,
    rc = cols / 2;
  return Array.from({ length: rows }, (_, r) => {
    const nr = (r + 0.5 - rr) / rr;
    return Array.from({ length: cols }, (_, c) => {
      const nc = (c + 0.5 - rc) / rc;
      return nr * nr + nc * nc <= 1 + 1e-9;
    });
  });
}

export function diamondMask(rows: number, cols: number): boolean[][] {
  const rr = rows / 2,
    rc = cols / 2;
  return Array.from({ length: rows }, (_, r) => {
    const nr = (r + 0.5 - rr) / rr;
    return Array.from({ length: cols }, (_, c) => Math.abs(nr) + Math.abs((c + 0.5 - rc) / rc) <= 1 + 1e-9);
  });
}

export function plusMask(rows: number, cols: number): boolean[][] {
  // Java: Math.round(min/3f) rounds half up on a float
  const thickness = Math.max(1, Math.floor(Math.min(rows, cols) / 3 + 0.5));
  const rowStart = Math.trunc((rows - thickness) / 2);
  const colStart = Math.trunc((cols - thickness) / 2);
  return Array.from({ length: rows }, (_, r) => {
    const inH = r >= rowStart && r < rowStart + thickness;
    return Array.from({ length: cols }, (_, c) => inH || (c >= colStart && c < colStart + thickness));
  });
}

/** GridShapes.forType: RECTANGLE and CUSTOM return null (caller supplies its own mask). */
export function maskForShape(type: ShapeType, rows: number, cols: number): boolean[][] | null {
  switch (type) {
    case 'CIRCLE':
      return circleMask(rows, cols);
    case 'DIAMOND':
      return diamondMask(rows, cols);
    case 'PLUS':
      return plusMask(rows, cols);
    case 'RECTANGLE':
    case 'CUSTOM':
      return null;
  }
}

export function enabledCount(mask: boolean[][] | null, rows: number, cols: number): number {
  if (!mask) return rows * cols;
  let n = 0;
  for (const row of mask) for (const cell of row) if (cell) n++;
  return n;
}
