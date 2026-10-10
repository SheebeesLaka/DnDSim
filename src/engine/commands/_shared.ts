import type { Draft } from 'immer';
import type { BattleEvent, BattleState, Command, EngineContext, EngineError } from '../types.ts';

export type Emit = (event: BattleEvent) => void;
export type Handler<C extends Command = Command> = (
  draft: Draft<BattleState>,
  cmd: C,
  ctx: EngineContext,
  emit: Emit,
) => EngineError | undefined;

export type HandlerMap = { [K in Command['type']]?: Handler<Extract<Command, { type: K }>> };

const LOG_CAP = 300;

export function log(draft: Draft<BattleState>, text: string, emit?: Emit): void {
  const n = (draft.log.at(-1)?.n ?? 0) + 1;
  draft.log.push({ n, text });
  if (draft.log.length > LOG_CAP) draft.log.splice(0, draft.log.length - LOG_CAP);
  emit?.({ type: 'log', text });
}

export const floatText = (
  emit: Emit,
  text: string,
  color: string,
  where: { unitId?: string; cell?: { r: number; c: number } },
  kind: BattleEvent extends { kind: infer K } ? K : 'OTHER' = 'OTHER',
): void => emit({ type: 'floatText', text, color, kind, ...where });

export function nextId(draft: Draft<BattleState>, prefix: string): string {
  const id = `${prefix}${draft.nextId}`;
  draft.nextId++;
  return id;
}
