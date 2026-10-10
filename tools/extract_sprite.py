#!/usr/bin/env python3
"""Cut a single sprite out of a raw sprite-sheet rip and write a clean RGBA PNG.

The rips we work from (see resources/sprites/terrain/_source/) carry label text,
gutters, watermarks and an opaque background, so SpriteUtils' sheet slicer cannot
consume them - it keys off the top-left pixel and needs fully empty separator
rows/columns. This tool crops one frame, keys its background to alpha 0, trims to
the content bounding box and writes a standalone PNG.

Pure stdlib: no PIL or ImageMagick is installed on this machine, so PNG decoding
and encoding are done here against zlib directly.

    python tools/extract_sprite.py --src sheet.png --rect 1,15,96,96 \
        --key-edges --out resources/sprites/terrain/acid.png

    python tools/extract_sprite.py --src sheet.png --rect 6,70,16,16 \
        --keys 80FFFF,05A4FF --out resources/sprites/terrain/redflower.png
"""

import argparse
import os
import struct
import sys
import zlib
from collections import deque

_CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _unfilter(raw, width, height, channels, bitdepth):
    """Reverse the per-scanline PNG filters into a flat byte buffer."""
    stride = (width * channels * bitdepth + 7) // 8
    bpp = max(1, channels * bitdepth // 8)
    out = bytearray()
    prev = bytearray(stride)
    pos = 0
    for _ in range(height):
        ftype = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ftype == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ftype == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ftype == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif ftype == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
            elif ftype != 0:
                raise ValueError("unsupported PNG filter type %d" % ftype)
        out += line
        prev = line
    return bytes(out), stride


def read_png(path):
    """Decode a PNG to (width, height, list-of-rows-of-RGBA-tuples)."""
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError("%s is not a PNG" % path)

    idat = b''
    palette = trns = None
    width = height = bitdepth = colortype = interlace = 0

    pos = 8
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b'IHDR':
            width, height, bitdepth, colortype, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
        elif ctype == b'PLTE':
            palette = chunk
        elif ctype == b'tRNS':
            trns = chunk
        elif ctype == b'IDAT':
            idat += chunk
        elif ctype == b'IEND':
            break

    if interlace:
        raise ValueError("interlaced PNGs are not supported")
    if colortype not in _CHANNELS:
        raise ValueError("unsupported PNG color type %d" % colortype)

    channels = _CHANNELS[colortype]
    px, stride = _unfilter(zlib.decompress(idat), width, height, channels, bitdepth)

    rows = []
    for y in range(height):
        row = []
        base = y * stride
        for x in range(width):
            if colortype == 3:
                if bitdepth == 8:
                    idx = px[base + x]
                else:
                    per_byte = 8 // bitdepth
                    shift = 8 - bitdepth * (x % per_byte + 1)
                    idx = (px[base + x // per_byte] >> shift) & ((1 << bitdepth) - 1)
                r, g, b = palette[idx * 3:idx * 3 + 3]
                a = trns[idx] if trns and idx < len(trns) else 255
            else:
                if bitdepth != 8:
                    raise ValueError("only 8-bit samples are supported for color type %d" % colortype)
                off = base + x * channels
                if colortype == 6:
                    r, g, b, a = px[off], px[off + 1], px[off + 2], px[off + 3]
                elif colortype == 2:
                    r, g, b, a = px[off], px[off + 1], px[off + 2], 255
                elif colortype == 4:
                    r = g = b = px[off]
                    a = px[off + 1]
                else:
                    r = g = b = px[off]
                    a = 255
            row.append((r, g, b, a))
        rows.append(row)
    return width, height, rows


def write_png(path, rows):
    """Encode rows of RGBA tuples as an 8-bit RGBA PNG."""
    height = len(rows)
    width = len(rows[0]) if height else 0
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type None - these are tiny images
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, payload):
        return (struct.pack('>I', len(payload)) + tag + payload
                + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF))

    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n')
        fh.write(chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)))
        fh.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b'IEND', b''))
    return width, height


def crop(rows, x, y, w, h):
    return [[rows[y + j][x + i] for i in range(w)] for j in range(h)]


def key_colors(rows, keys):
    """Punch the given RGB colors out to alpha 0 wherever they appear."""
    hit = 0
    for row in rows:
        for i, (r, g, b, a) in enumerate(row):
            if (r, g, b) in keys:
                row[i] = (r, g, b, 0)
                hit += 1
    return hit


def key_edges(rows):
    """Flood-fill background inward from the crop's border.

    Safer than removing a color globally: a rip's cell interior is often plain
    white or another color the art itself also uses, and only the region actually
    connected to the border is background.
    """
    h = len(rows)
    w = len(rows[0]) if h else 0
    if not h or not w:
        return 0, set()

    border = []
    for x in range(w):
        border += [(x, 0), (x, h - 1)]
    for y in range(h):
        border += [(0, y), (w - 1, y)]

    bg = {rows[y][x][:3] for x, y in border}
    seen = [[False] * w for _ in range(h)]
    queue = deque()
    for x, y in border:
        if not seen[y][x] and rows[y][x][:3] in bg:
            seen[y][x] = True
            queue.append((x, y))

    hit = 0
    while queue:
        x, y = queue.popleft()
        r, g, b, _ = rows[y][x]
        rows[y][x] = (r, g, b, 0)
        hit += 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and rows[ny][nx][:3] in bg:
                seen[ny][nx] = True
                queue.append((nx, ny))
    return hit, bg


def trim(rows):
    """Shrink to the bounding box of pixels that are not fully transparent."""
    h = len(rows)
    w = len(rows[0]) if h else 0
    min_x, max_x, min_y, max_y = w, -1, h, -1
    for y in range(h):
        for x in range(w):
            if rows[y][x][3] != 0:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
    if max_x < 0:
        raise ValueError("nothing left after keying - check --rect and --keys")
    return [row[min_x:max_x + 1] for row in rows[min_y:max_y + 1]]


def parse_keys(text):
    keys = set()
    for part in text.split(','):
        part = part.strip().lstrip('#')
        if not part:
            continue
        if len(part) != 6:
            raise ValueError("expected 6-digit hex colors, got %r" % part)
        keys.add((int(part[0:2], 16), int(part[2:4], 16), int(part[4:6], 16)))
    return keys


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True, help='source sheet PNG')
    ap.add_argument('--rect', required=True, metavar='X,Y,W,H',
                    help='source rectangle to cut out')
    ap.add_argument('--keys', default='', metavar='RRGGBB,...',
                    help='colors to punch out to transparent everywhere')
    ap.add_argument('--key-edges', action='store_true',
                    help='flood-fill background inward from the crop border')
    ap.add_argument('--no-trim', action='store_true',
                    help='keep the full crop instead of trimming to content')
    ap.add_argument('--out', required=True, help='destination RGBA PNG')
    args = ap.parse_args(argv)

    try:
        x, y, w, h = (int(v) for v in args.rect.split(','))
    except ValueError:
        ap.error('--rect must be four integers: X,Y,W,H')

    src_w, src_h, rows = read_png(args.src)
    if x < 0 or y < 0 or x + w > src_w or y + h > src_h:
        ap.error('--rect %s falls outside the %dx%d source' % (args.rect, src_w, src_h))

    out = crop(rows, x, y, w, h)
    print('%s %dx%d -> crop (%d,%d,%d,%d)' % (args.src, src_w, src_h, x, y, w, h))

    if args.keys:
        n = key_colors(out, parse_keys(args.keys))
        print('  keyed %d px by color' % n)
    if args.key_edges:
        n, bg = key_edges(out)
        print('  flood-filled %d px from the border (bg: %s)'
              % (n, ', '.join('#%02X%02X%02X' % c for c in sorted(bg))))
    if not args.no_trim:
        out = trim(out)

    ow, oh = write_png(args.out, out)
    print('  wrote %s (%dx%d RGBA)' % (args.out, ow, oh))
    return 0


if __name__ == '__main__':
    sys.exit(main())
