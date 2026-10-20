// Shared mid-combat moment for all three mockups (same numbers everywhere).
// Arboretum Dome C, round 3, Henry Keaton's turn, resolving a Sledgehammer swing at Moongate Guard #1.
// Board plates and token positions came from design/scene/capture-board.mjs (real HD-2D renderer;
// removed after the Spotlight build, since it targeted the old board toolbar).
window.SCENE = (() => {
  const P = (n) => `../scene/portraits/row-${n}.png`;
  const units = [
    { id: 'u20', name: 'Dr. Petra Ilyas', short: 'Dr. Ilyas', side: 'enemy', boss: true, hp: 19, max: 25, ac: 11, mob: 4,
      init: 22, d20: 16, mod: 6, portrait: P(9), height: '+10 ft', cell: 'L2', statuses: [] },
    { id: 'u1', name: 'Henry Keaton', short: 'Henry', side: 'party', cls: 'Warrior Survivalist', lvl: 1, hp: 20, max: 36,
      ac: 14, mob: 2, init: 19, d20: 17, mod: 2, portrait: P(0), height: 'ground', cell: 'D7', current: true,
      weapon: 'Sledgehammer', dice: ['d6', 'd6', 'd10'], stats: { STR: 7, DEX: 2, CON: 8, INT: 2, WIS: 7, CHA: 3 },
      statuses: [{ n: 'Blessed', k: 'buff', icon: 'bless', t: 2, fx: '+2 ATK' }] },
    { id: 'u7', name: 'Overgrown Hornet', short: 'Hornet', side: 'enemy', hp: 20, max: 20, ac: 11, mob: 5, init: 17,
      glyph: 'OH', fly: '15 ft', cell: 'J9', statuses: [{ n: 'Illuminated', k: 'debuff', icon: 'eye', t: 2, fx: '−2 AC' }] },
    { id: 'u3', name: 'Grand Wizard Man', short: 'G. Wizard', side: 'party', cls: 'Arcanist', lvl: 12, hp: 20, max: 20,
      ac: 12, mob: 7, init: 16, portrait: P(10), height: '+10 ft', cell: 'J3',
      statuses: [{ n: 'Shield of Faith', k: 'buff', icon: 'shield', t: 8, fx: '+2 AC' }] },
    { id: 'u5', name: 'Moongate Guard #1', short: 'Guard #1', side: 'enemy', hp: 18, max: 18, ac: 12, mob: 3, init: 14,
      portrait: P(1), height: 'ground', cell: 'E7', target: true,
      statuses: [{ n: 'Burning', k: 'dot', icon: 'flame', t: 2, fx: '2 dmg / turn' }] },
    { id: 'u2', name: 'Dan Dixon', short: 'Dan', side: 'party', cls: 'Strategist Striker', lvl: 1, hp: 9, max: 30, ac: 13,
      mob: 1, init: 13, portrait: P(4), height: 'ground', cell: 'E9',
      statuses: [{ n: 'Chilled', k: 'debuff', icon: 'snow', t: 1, fx: '−2 MOB' }] },
    { id: 'u8', name: 'Shielded Moongate Guard', short: 'Shield Guard', side: 'enemy', hp: 15, max: 15, ac: 14, mob: 2,
      init: 9, portrait: P(8), height: '+5 ft', cell: 'I4', readied: 'Readied: strike whoever climbs the ramp', statuses: [] },
    { id: 'u6', name: 'Moongate Guard #2', short: 'Guard #2', side: 'enemy', hp: 11, max: 18, ac: 12, mob: 3, init: 7,
      portrait: P(1), height: 'ground', cell: 'C6', statuses: [] },
    { id: 'u4', name: 'NMB-15', short: 'NMB-15', side: 'party', cls: 'Android', lvl: 1, hp: 18, max: 24, ac: 12, mob: 3,
      init: 5, portrait: P(2), height: 'ground', cell: 'B8', statuses: [] },
  ];
  const byId = Object.fromEntries(units.map((u) => [u.id, u]));

  // device-pixel token positions captured from the renderer (feet / head)
  const PTS = {
    full: { u1: [855, 826, 726], u2: [1034, 833, 733], u3: [818, 364, 264], u4: [845, 941, 837], u5: [895, 782, 678],
      u6: [746, 845, 741], u7: [1234, 473, 422], u8: [847, 480, 372], u20: [829, 250, 146] },
    center: { u1: [481, 697, 622], u2: [615, 703, 628], u3: [453, 351, 276], u4: [473, 784, 706], u5: [511, 664, 586],
      u6: [399, 712, 634], u7: [764, 432, 394], u8: [475, 438, 357], u20: [461, 265, 187] },
  };
  // screenshots run at deviceScaleFactor 1.25 (a 1920×1200 laptop at 125% → 1536×960 CSS px)
  const S = 0.8;
  const pos = (plate, id, dx = 0, dy = 0) => {
    const p = PTS[plate][id];
    return { x: p[0] * S + dx, feet: p[1] * S + dy, head: p[2] * S + dy };
  };

  // Henry's swing, mid-entry: d20 and first die typed, second die being typed
  const attack = {
    attacker: 'u1', target: 'u5', weapon: 'Sledgehammer', d20: 9,
    mods: [{ k: 'STR', v: 7 }, { k: 'Blessed', v: 2 }],
    total: 18, ac: 12, margin: 6, tier: 2, toNext: 2,
    dice: [{ d: 'd6', v: 4 }, { d: 'd6', v: 5, typing: true }], bonus: 5, bonusLabel: 'STR ½',
    damage: 14, hpAfter: 4,
  };

  const lighting = {
    ambient: 'dim',
    lights: [
      { id: 'grow', name: 'Grow lamps', group: true, count: 2, on: true, color: '#d8ffb0' },
      { id: 'torch', name: "Henry's torch", carried: 'Henry', on: true, color: '#ffb366' },
      { id: 'svc', name: 'Service bay floods', group: true, count: 1, on: false, color: '#bfe3ff', note: 'generator' },
    ],
    reveal: true,
  };
  const incoming = [{ name: 'Falsiradix', count: 2, round: 4, note: 'east vent' }];
  const log = [
    { r: 3, t: 'Dr. Ilyas casts Hold Person → Dan', res: 'SAVED · d20 15 +4 vs DC 17? no — 19 ≥ 17' },
    { r: 3, t: 'Burning ticks on Guard #1', res: '−2 HP' },
    { r: 2, t: 'NMB-15 attacks Guard #2', res: 'HIT T1 · 7 dmg' },
    { r: 2, t: 'Hornet stings Dan', res: 'HIT T2 · 9 dmg' },
  ];

  const ICON = {
    bless: '<svg viewBox="0 0 24 24"><path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" fill="currentColor"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 01-10 0c0-2.6 1.3-4 2.4-5 .1 1.6.8 2.6 1.8 3C11 8 12 5 12 2z" fill="currentColor"/></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="currentColor"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z" fill="currentColor"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/></svg>',
    attack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/></svg>',
    cast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/></svg>',
    item: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/></svg>',
    end: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10"/></svg>',
    lamp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>',
    height: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 20h18M5 20v-5h4v-5h4V5h6v15"/></svg>',
    spawn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 22h8M12 18v4"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 6-8 11-8 11z" fill="currentColor"/></svg>',
    wing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M7 10l5-5 5 5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  };

  return { round: 3, area: 'Arboretum Dome C', units, byId, pos, attack, lighting, incoming, log, ICON };
})();
