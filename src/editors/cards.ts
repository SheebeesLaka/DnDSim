/** Asset card text (UI/CardUtils.java, AssetEditorView.createTerrainCard), kept DOM-free. */
import { areaLabel, diceLabel, levelLabel, rangeLabel } from '../assets/spellLabels.ts';
import { ATTRIBUTE_SHORT, type SpellDef, type TerrainDef } from '../assets/types.ts';
import type { AssetItemDef } from './defaults.ts';

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';
export interface CardDetail {
  label: string;
  value: string;
}
export interface CardText {
  title: string;
  badges: string[];
  details: CardDetail[];
  /** CardStyle accent */
  style: 'common' | 'uncommon' | 'rare' | 'legendary' | 'neutral' | 'default';
}

/** CardUtils.estimateWeaponDamage: the tier-1 die's average-ish value. */
export function estimateWeaponDamage(dice: readonly (string | null)[]): number {
  const d = dice[0];
  if (!d) return 4;
  switch (d.toLowerCase()) {
    case 'd4':
      return 2;
    case 'd6':
      return 3;
    case 'd8':
      return 4;
    case 'd10':
      return 5;
    case 'd12':
      return 6;
    case 'd20':
      return 10;
    default:
      return 4;
  }
}

/** CardUtils.getItemRarityStyle (weapons never pass Uncommon: the largest estimate is 10). */
export function itemRarity(item: AssetItemDef): Rarity {
  if (item.kind === 'weapon') {
    const dmg = estimateWeaponDamage(item.damageDice);
    if (dmg >= 20) return 'Legendary';
    if (dmg >= 12) return 'Rare';
    if (dmg >= 6) return 'Uncommon';
  } else if (item.kind === 'accessory') {
    if (item.defense >= 10) return 'Legendary';
    if (item.defense >= 5) return 'Rare';
    if (item.defense >= 2) return 'Uncommon';
  }
  return 'Common';
}

const mods = (attrs: readonly number[]): CardDetail[] =>
  attrs.flatMap((v, i) =>
    v !== 0 ? [{ label: ATTRIBUTE_SHORT[i] ?? '?', value: `${v > 0 ? '+' : ''}${v}` }] : [],
  );

export function itemCard(item: AssetItemDef): CardText {
  const rarity = itemRarity(item);
  const rarityStyle = rarity.toLowerCase() as CardText['style'];
  switch (item.kind) {
    case 'weapon':
      return {
        title: item.name,
        badges: [rarity],
        style: rarityStyle,
        details: [
          {
            label: 'Damage Dice',
            value: item.damageDice.length ? item.damageDice.map((d) => d ?? 'null').join('/') : '--',
          },
          ...mods(item.modifiedAttributes),
        ],
      };
    case 'accessory':
      return {
        title: item.name,
        badges: [rarity],
        style: rarityStyle,
        details: [{ label: 'Defense', value: `+${item.defense}` }, ...mods(item.modifiedAttributes)],
      };
    case 'consumable':
      return {
        title: item.name,
        badges: [],
        style: 'uncommon',
        details: [
          { label: 'Heal', value: `+${item.healAmount} HP` },
          ...(item.effect ? [{ label: 'Effect', value: item.effect.name }] : []),
        ],
      };
    case 'ammunition':
      return {
        title: item.name,
        badges: [],
        style: 'default',
        details: [{ label: 'Ammo', value: item.ammoType ?? '' }],
      };
    case 'crafting':
      return { title: item.name, badges: [item.craftingCategory ?? ''], style: 'default', details: [] };
    case 'keyitem':
      return {
        title: item.name,
        badges: [item.questRelated ? 'Quest Item' : 'Key Item'],
        style: item.questRelated ? 'legendary' : 'default',
        details: [],
      };
  }
}

export function spellCard(s: SpellDef): CardText {
  const details: CardDetail[] = [];
  if (s.school) details.push({ label: 'School', value: s.school });
  if (s.area !== 'NONE')
    details.push({ label: 'Area', value: areaLabel(s) + (s.friendlyFire ? ' (FF)' : '') });
  else details.push({ label: 'Range', value: rangeLabel(s) });
  details.push({ label: 'Targets', value: s.targetType });
  if (s.resolution === 'SAVE')
    details.push({ label: 'Save', value: s.saveStat + (s.onSave === 'HALF' ? ' (half)' : '') });
  const dice = diceLabel(s);
  if (s.resolution !== 'BUFF' && dice) {
    const flat = s.flatDamage;
    const flatStr = flat === 0 ? '' : `${flat > 0 ? ' +' : ' '}${flat}`;
    details.push({
      label: s.resolution === 'HEAL' ? 'Healing' : 'Damage',
      value: (s.resolution === 'HEAL' ? (s.damageDice[0] ?? 'null') : dice) + flatStr,
    });
  }
  if (s.upcastDie && s.level !== 0) details.push({ label: 'Upcast', value: `+${s.upcastDie}/lvl` });
  if (s.riderStatus)
    details.push({
      label: 'Effect',
      value: s.riderStatus.name + (s.riderStatus.duration > 0 ? ` (${s.riderStatus.duration}t)` : ''),
    });
  return {
    title: s.name,
    badges: [levelLabel(s), s.resolution],
    style: s.level === 0 ? 'neutral' : 'rare',
    details,
  };
}

export function terrainCard(t: TerrainDef): CardText {
  const details: CardDetail[] = [
    { label: 'HP', value: String(t.health) },
    { label: 'Collision', value: t.collision ? 'Yes' : 'No' },
  ];
  if (!t.collision) details.push({ label: 'Layer', value: t.entityAboveTerrain ? 'Above' : 'Below' });
  return { title: t.type, badges: [], style: 'default', details };
}
