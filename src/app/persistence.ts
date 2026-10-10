/**
 * Writes party sheets back to saves/entities/party like the Java app, but
 * debounced and atomic (via the server) instead of on every setter. Also
 * battle save/load and ui_prefs.
 */
import { SAVE_PATHS, javaStem } from '../assets/filenames.ts';
import type { CharSheetDef } from '../assets/types.ts';
import { charSheetToJson, stringifyLike } from '../assets/write.ts';
import { partySheetsToPersist } from '../engine/selectors/persistence.ts';
import type { BattleState } from '../engine/types.ts';

export interface SheetPersisterDeps {
  /** raw party files keyed by file stem, for key-order templates */
  rawParty: Record<string, unknown>;
  /** display name → file stem as loaded */
  partyStems: Record<string, string>;
  putFile: (relPath: string, text: string) => Promise<void>;
  debounceMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  onError?: (err: unknown) => void;
}

export interface SheetPersister {
  /** Call after every state change; writes only sheets whose serialised text changed. */
  onState(state: BattleState): void;
  /** Flush pending writes now (e.g. before unload). */
  flush(): Promise<void>;
  /** Text that would be written for a sheet (for tests/debug). */
  render(sheet: CharSheetDef): string;
  readOnly: boolean;
}

export function createSheetPersister(deps: SheetPersisterDeps): SheetPersister {
  const lastWritten = new Map<string, string>();
  let pending = new Map<string, string>();
  let timer: unknown = null;
  const setT = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const persister: SheetPersister = {
    readOnly: false,
    render(sheet) {
      const stem = deps.partyStems[sheet.name] ?? javaStem(sheet.name);
      return stringifyLike('party', charSheetToJson(sheet), deps.rawParty[stem]);
    },
    onState(state) {
      if (persister.readOnly) return;
      const sheets = partySheetsToPersist(state);
      for (const [name, sheet] of Object.entries(sheets)) {
        const text = persister.render(sheet);
        if (lastWritten.get(name) === text) continue;
        pending.set(name, text);
      }
      if (pending.size > 0 && timer === null)
        timer = setT(() => void persister.flush(), deps.debounceMs ?? 300);
    },
    async flush() {
      if (timer !== null) {
        clearT(timer);
        timer = null;
      }
      const batch = pending;
      pending = new Map();
      for (const [name, text] of batch) {
        const stem = deps.partyStems[name] ?? javaStem(name);
        try {
          await deps.putFile(`entities/party/${stem}.json`, text);
          lastWritten.set(name, text);
        } catch (err) {
          deps.onError?.(err);
        }
      }
    },
  };
  return persister;
}

export const uiPrefsPath = SAVE_PATHS.uiPrefs();
export const renderUiPrefs = (prefs: Record<string, string>): string => JSON.stringify(prefs, null, 2);
