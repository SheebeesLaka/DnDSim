/** display.player.* and other ui_prefs, persisted to saves/ui_prefs.json through the API. */
import {
  displayOptionsFromPrefs,
  displayOptionsToPrefs,
  type PlayerDisplayOptions,
} from '../engine/view/displayOptions.ts';

export class PrefsStore {
  private listeners = new Set<() => void>();
  constructor(
    private prefs: Record<string, string>,
    private save: (prefs: Record<string, string>) => Promise<void>,
  ) {}
  get all(): Record<string, string> {
    return { ...this.prefs };
  }
  get display(): PlayerDisplayOptions {
    return displayOptionsFromPrefs(this.prefs);
  }
  /** Like UiPreferences.set in Java: only the changed keys are written. */
  setDisplay(patch: Partial<PlayerDisplayOptions>): void {
    const full = displayOptionsToPrefs({ ...this.display, ...patch });
    const next = { ...this.prefs };
    for (const k of Object.keys(patch)) next[`display.player.${k}`] = full[`display.player.${k}`] ?? '';
    this.prefs = next;
    this.persist();
  }
  set(key: string, value: string | null): void {
    const next = { ...this.prefs };
    if (value === null) delete next[key];
    else next[key] = value;
    this.prefs = next;
    this.persist();
  }
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private persist(): void {
    for (const l of this.listeners) l();
    void this.save(this.prefs).catch((err: unknown) => console.warn('ui_prefs save failed', err));
  }
}
