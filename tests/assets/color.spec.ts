import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR, defaultItemColor, fromLegacyIndex, normalizeHex } from '../../src/assets/color.ts';

describe('ColorUtils port', () => {
  it.each([
    ['#ff0000', '#FF0000'],
    ['ff0000', '#FF0000'],
    ['#abc', '#AABBCC'],
    [' #8B0000 ', '#8B0000'],
    ['9', '#0000FF'],
    [9, '#0000FF'],
    ['0', '#000000'],
    [15, '#8B4513'],
    [16, DEFAULT_COLOR],
    [-1, DEFAULT_COLOR],
    ['', DEFAULT_COLOR],
    ['not a colour', DEFAULT_COLOR],
    ['#12345', DEFAULT_COLOR],
    [null, DEFAULT_COLOR],
    [undefined, DEFAULT_COLOR],
  ])('normalizeHex(%j) → %s', (input, expected) => {
    expect(normalizeHex(input)).toBe(expected);
  });

  it('uses the fallback (itself normalised) for bad input', () => {
    expect(normalizeHex('zzz', '#008000')).toBe('#008000');
    expect(normalizeHex('zzz', 8)).toBe('#008000');
    expect(normalizeHex('zzz', '8')).toBe('#008000');
    expect(normalizeHex('zzz', 'nope')).toBe(DEFAULT_COLOR);
    expect(normalizeHex(null, '#abc')).toBe('#AABBCC');
  });

  it('maps item type defaults like Item.getDefaultColorForTypeHex', () => {
    expect(defaultItemColor('Weapon')).toBe(fromLegacyIndex(4));
    expect(defaultItemColor('accessory')).toBe(fromLegacyIndex(9));
    expect(defaultItemColor('Consumable')).toBe(fromLegacyIndex(7));
    expect(defaultItemColor('Unarmed')).toBe(fromLegacyIndex(1));
    expect(defaultItemColor('Ammunition')).toBe(fromLegacyIndex(8));
    expect(defaultItemColor(null)).toBe(fromLegacyIndex(8));
  });
});
