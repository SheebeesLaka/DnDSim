/**
 * Colour helpers mirroring legacy-java/EntityRes/ColorUtils.java.
 * Item/character colours on disk may be "#RRGGBB", "#RGB", a bare hex, an
 * integer index into the 16-colour legacy palette, or that index as a string.
 */
export const DEFAULT_COLOR = '#808080';

export const LEGACY_PALETTE: readonly string[] = [
  '#000000', // 0 Black
  '#808080', // 1 Gray
  '#FFFFFF', // 2 White
  '#8B0000', // 3 Maroon
  '#FF0000', // 4 Red
  '#FFA500', // 5 Orange
  '#FFFF00', // 6 Yellow
  '#00FF00', // 7 Lime
  '#008000', // 8 Green
  '#0000FF', // 9 Blue
  '#4B0082', // 10 Indigo
  '#C8A2C8', // 11 Lilac
  '#800080', // 12 Purple
  '#FFC0CB', // 13 Pink
  '#F5F5DC', // 14 Beige
  '#8B4513', // 15 Brown
];

export const LEGACY_COLOR_NAMES: readonly string[] = [
  'Black',
  'Gray',
  'White',
  'Maroon',
  'Red',
  'Orange',
  'Yellow',
  'Lime',
  'Green',
  'Blue',
  'Indigo',
  'Lilac',
  'Purple',
  'Pink',
  'Beige',
  'Brown',
];

/** ColorUtils.fromLegacyIndex: out-of-range indices give the default grey. */
export function fromLegacyIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= LEGACY_PALETTE.length) return DEFAULT_COLOR;
  return LEGACY_PALETTE[index] as string;
}

function isIntegerString(value: string): boolean {
  return /^[+-]?\d+$/.test(value);
}

function isHex(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value);
}

function normalizeCandidate(trimmed: string): string | null {
  if (isIntegerString(trimmed)) return fromLegacyIndex(Number.parseInt(trimmed, 10));
  let candidate = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (candidate.length === 3 && isHex(candidate)) {
    const [r, g, b] = candidate;
    candidate = `${r}${r}${g}${g}${b}${b}`;
  }
  if (candidate.length === 6 && isHex(candidate)) return '#' + candidate.toUpperCase();
  return null;
}

/**
 * ColorUtils.normalizeHex. `value` may be a string or a legacy integer index
 * (Gson reads a bare number into a String field as its decimal text).
 */
export function normalizeHex(
  value: unknown,
  fallback: string | number | null | undefined = DEFAULT_COLOR,
): string {
  const safeFallback = normalizeFallback(fallback);
  if (value === null || value === undefined) return safeFallback;
  if (typeof value === 'number') return fromLegacyIndex(value);
  if (typeof value !== 'string') return safeFallback;
  const trimmed = value.trim();
  if (trimmed === '') return safeFallback;
  return normalizeCandidate(trimmed) ?? safeFallback;
}

function normalizeFallback(fallback: string | number | null | undefined): string {
  if (fallback === null || fallback === undefined) return DEFAULT_COLOR;
  if (typeof fallback === 'number') return fromLegacyIndex(fallback);
  const trimmed = fallback.trim();
  if (trimmed === '') return DEFAULT_COLOR;
  return normalizeCandidate(trimmed) ?? DEFAULT_COLOR;
}

/** Item.getDefaultColorForTypeHex. */
export function defaultItemColor(type: string | null | undefined): string {
  switch ((type ?? '').toLowerCase()) {
    case 'weapon':
      return fromLegacyIndex(4);
    case 'accessory':
      return fromLegacyIndex(9);
    case 'consumable':
      return fromLegacyIndex(7);
    case 'unarmed':
      return fromLegacyIndex(1);
    default:
      return fromLegacyIndex(8);
  }
}
