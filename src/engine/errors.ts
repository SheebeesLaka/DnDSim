import type { EngineError } from './types.ts';

export const err = (code: string, message: string): EngineError => ({ code, message });
