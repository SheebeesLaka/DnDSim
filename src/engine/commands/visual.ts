/** Visual foundations: elevation, altitude, lights, groups, ambient, reveal, theme. Zero rule effect. */
import { err } from '../errors.ts';
import { inBounds, unitById } from '../selectors/board.ts';
import { AMBIENT_PRESET, ambientBand } from '../selectors/lighting.ts';
import { nextId, type HandlerMap } from './_shared.ts';

export const visualHandlers: HandlerMap = {
  SET_ELEVATION(draft, cmd) {
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    (draft.board.elevation[cmd.r] as number[])[cmd.c] = Math.trunc(cmd.level);
    return undefined;
  },
  ADJUST_ELEVATION(draft, cmd) {
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    const row = draft.board.elevation[cmd.r] as number[];
    row[cmd.c] = (row[cmd.c] ?? 0) + Math.trunc(cmd.delta);
    return undefined;
  },
  SET_RAMP(draft, cmd) {
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    draft.board.ramps = draft.board.ramps.filter((x) => x.r !== cmd.r || x.c !== cmd.c);
    if (cmd.ramp) draft.board.ramps.push({ ...cmd.ramp, r: cmd.r, c: cmd.c });
    return undefined;
  },
  SET_ALTITUDE(draft, cmd) {
    const u = unitById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'no such unit');
    u.altitude = Math.max(0, Math.trunc(cmd.altitude));
    return undefined;
  },
  ADD_LIGHT(draft, cmd) {
    const id = cmd.light.id ?? nextId(draft, 'light');
    if (draft.board.lights.some((l) => l.id === id)) return err('duplicateLight', `light ${id} exists`);
    if (cmd.light.attachedTo && !unitById(draft, cmd.light.attachedTo))
      return err('unknownUnit', 'no such unit to attach to');
    draft.board.lights.push({
      ...cmd.light,
      id,
      brightRadius: Math.max(0, cmd.light.brightRadius),
      dimRadius: Math.max(cmd.light.brightRadius, cmd.light.dimRadius),
    });
    return undefined;
  },
  UPDATE_LIGHT(draft, cmd) {
    const l = draft.board.lights.find((x) => x.id === cmd.lightId);
    if (!l) return err('unknownLight', 'no such light');
    Object.assign(l, cmd.patch);
    if ('at' in cmd.patch && cmd.patch.at) delete l.attachedTo;
    if ('attachedTo' in cmd.patch && cmd.patch.attachedTo) delete l.at;
    return undefined;
  },
  REMOVE_LIGHT(draft, cmd) {
    const n = draft.board.lights.length;
    draft.board.lights = draft.board.lights.filter((x) => x.id !== cmd.lightId);
    return n === draft.board.lights.length ? err('unknownLight', 'no such light') : undefined;
  },
  TOGGLE_LIGHT(draft, cmd) {
    const l = draft.board.lights.find((x) => x.id === cmd.lightId);
    if (!l) return err('unknownLight', 'no such light');
    l.on = cmd.on ?? !l.on;
    return undefined;
  },
  SET_LIGHT_GROUP(draft, cmd) {
    const existing = draft.board.lightGroups.find((g) => g.id === cmd.group.id);
    if (existing) Object.assign(existing, cmd.group);
    else draft.board.lightGroups.push({ ...cmd.group });
    return undefined;
  },
  TOGGLE_LIGHT_GROUP(draft, cmd) {
    const g = draft.board.lightGroups.find((x) => x.id === cmd.groupId);
    if (!g) return err('unknownGroup', 'no such light group');
    g.on = cmd.on ?? !g.on;
    return undefined;
  },
  SET_AMBIENT(draft, cmd) {
    draft.board.ambient = cmd.level;
    draft.board.ambientLevel = AMBIENT_PRESET[cmd.level];
    return undefined;
  },
  SET_AMBIENT_LEVEL(draft, cmd) {
    if (!Number.isFinite(cmd.level)) return err('invalidLevel', 'ambient light is 0-100');
    const level = Math.max(0, Math.min(100, Math.round(cmd.level)));
    draft.board.ambientLevel = level;
    draft.board.ambient = ambientBand(level);
    return undefined;
  },
  SET_DM_REVEAL(draft, cmd) {
    draft.board.dmReveal = cmd.on;
    return undefined;
  },
  SET_THEME(draft, cmd) {
    const key = cmd.theme.trim().toLowerCase();
    draft.board.theme = key === '' ? 'stone' : key;
    return undefined;
  },
  SET_TERRAIN_BLOCKS_LIGHT(draft, cmd) {
    const u = unitById(draft, cmd.unitId);
    if (!u || u.kind !== 'terrain') return err('unknownUnit', 'no such terrain');
    u.blocksLight = cmd.blocksLight;
    return undefined;
  },
  SET_COMPAT(draft, cmd) {
    Object.assign(draft.rules.compat, cmd.flags);
    return undefined;
  },
};
