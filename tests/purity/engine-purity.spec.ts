/** src/engine must stay free of DOM, IO, wall-clock and ambient randomness. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random'],
  [/\bDate\.now\b|\bnew Date\b/, 'Date'],
  [/\bperformance\.now\b/, 'performance'],
  [/\b(window|document|localStorage|sessionStorage|navigator)\b/, 'DOM global'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/, 'timers'],
  [/from ['"](\.\.\/)+(app|ui|assets\/client)/, 'app/ui/client import'],
  [/from ['"]node:/, 'node import'],
  [/\bcrypto\./, 'crypto'],
];

describe('engine purity', () => {
  const sources = files('src/engine');
  it('has engine files to check', () => expect(sources.length).toBeGreaterThan(5));
  it.each(sources)('%s is pure', (file) => {
    const text = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const [re, label] of FORBIDDEN) expect(re.test(text), `${file} uses ${label}`).toBe(false);
  });
});
