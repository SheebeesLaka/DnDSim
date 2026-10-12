// Builds design/scene/arboretum.json — the one mid-combat scene all three mockups share.
// Derived from scenarios/test.json (read only); nothing in scenarios/ or saves/ is touched.
// Run: node design/scene/build-scene.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const src = JSON.parse(readFileSync(here('../../scenarios/test.json'), 'utf8'));
const enemyFile = (n) => JSON.parse(readFileSync(here(`../../saves/entities/enemies/${n}.json`), 'utf8'));

const sc = structuredClone(src);
sc.name = 'arboretum';
sc.description = 'Design mockup scene: Arboretum Dome C, round 3, Henry attacking Moongate Guard #1.';
const b = sc.battle;
b.board.theme = 'arboretum';
b.board.ambient = 'dim';
b.board.lights = [
  { id: 'grow1', name: 'Grow lamp A', brightRadius: 3, dimRadius: 5, color: '#d8ffb0', at: { r: 1, c: 2 }, on: true, groupId: 'grow' },
  { id: 'grow2', name: 'Grow lamp B', brightRadius: 3, dimRadius: 5, color: '#d8ffb0', at: { r: 3, c: 12 }, on: true, groupId: 'grow' },
  { id: 'torch', name: "Henry's torch", brightRadius: 2, dimRadius: 4, color: '#ffb366', attachedTo: 'u1', on: true },
  { id: 'svc', name: 'Service bay floods', brightRadius: 4, dimRadius: 6, color: '#bfe3ff', at: { r: 9, c: 10 }, on: false, groupId: 'svc' },
];
b.board.lightGroups = [
  { id: 'grow', name: 'Grow lamps', on: true },
  { id: 'svc', name: 'Service bay (generator)', on: false },
];

const unit = (id) => b.units.find((u) => u.id === id);
const status = (name, effectType, magnitude, duration, targetAttribute = -1) => ({
  name, effectType, magnitude, duration, targetAttribute, extra: {},
});

// party
const henry = unit('u1');
henry.r = 6; henry.c = 3;
henry.sheet.currentHP = 20;
henry.sheet.status = [status('Blessed', 6, 2, 2)];
const dan = unit('u2');
dan.r = 8; dan.c = 4;
dan.sheet.currentHP = 9;
dan.sheet.status = [status('Chilled', 4, -2, 1)];
const gwm = unit('u3');
gwm.r = 2; gwm.c = 9;
gwm.sheet.spritePath = 'party/testsprites.png#10';
gwm.sheet.status = [status('Shield of Faith', 5, 2, 8)];
const nmb = unit('u4');
nmb.r = 7; nmb.c = 1;
nmb.sheet.spritePath = 'party/testsprites.png#2';

// enemies: replace the test beasts with the campaign's Moongate crew
const enemy = (id, stem, inst, r, c, extra = {}) => {
  const t = enemyFile(stem);
  return {
    id, kind: 'enemy', r, c, altitude: 0, templateStem: stem, name: t.name, baseName: t.name,
    instanceNumber: inst, health: t.maxHealth, maxHealth: t.maxHealth, mobility: t.mobility,
    armorClass: t.armorClass, damageDice: t.damageDice, dexterity: t.dexterity, color: t.color,
    spritePath: null, tags: t.tags ?? [], attributes: t.attributes ?? null, statuses: [],
    acAdjustment: 0, dexAdjustment: 0, diceOverride: [null, null, null], ...extra,
  };
};
const keep = b.units.filter((u) => u.kind !== 'enemy');
b.units = [
  ...keep,
  enemy('u5', 'Melee Moongate Guard', 1, 6, 4, { health: 18, spritePath: 'party/testsprites.png#1', statuses: [status('Burning', 1, 2, 2)] }),
  enemy('u6', 'Melee Moongate Guard', 2, 5, 2, { health: 11, spritePath: 'party/testsprites.png#1' }),
  enemy('u7', 'Overgrown Hornet', 1, 8, 9, { altitude: 3, health: 20, statuses: [status('Illuminated', 5, -2, 2)] }),
  enemy('u8', 'Shielded Moongate Guard', 1, 3, 8, { spritePath: 'party/testsprites.png#8' }),
  enemy('u20', 'Dr. Petra Ilyas', 1, 1, 11, { health: 19, spritePath: 'party/testsprites.png#9' }),
];
b.nextId = 21;
b.enemyInstanceCounts = { 'Melee Moongate Guard': 2, 'Overgrown Hornet': 1, 'Shielded Moongate Guard': 1, 'Dr. Petra Ilyas': 1 };
b.turn = {
  ...b.turn,
  started: true,
  round: 3,
  order: ['u20', 'u1', 'u7', 'u3', 'u5', 'u2', 'u8', 'u6', 'u4'],
  currentIndex: 1,
  initiative: {
    u20: { total: 22, d20: 16, mod: 6 }, u1: { total: 19, d20: 17, mod: 2 }, u7: { total: 17, d20: 14, mod: 3 },
    u3: { total: 16, d20: 4, mod: 12 }, u5: { total: 14, d20: 11, mod: 3 }, u2: { total: 13, d20: 8, mod: 5 },
    u8: { total: 9, d20: 7, mod: 2 }, u6: { total: 7, d20: 4, mod: 3 }, u4: { total: 5, d20: 3, mod: 2 },
  },
};
// drop the test pickups' clutter near the fight; keep the rest of the terrain
b.units = b.units.filter((u) => u.id !== 'u14');

writeFileSync(here('./arboretum.json'), JSON.stringify(sc, null, 1));
console.log('wrote design/scene/arboretum.json with', b.units.length, 'units');
