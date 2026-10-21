How combat works on the battle grid, exactly as the app calculates it. The **Players** part covers
everything you roll and every number on the screen. The **DM** part adds enemies, statuses, DM tools
and the edge cases. In the app, this page is the **Rules** screen (main menu, or the battle menu).

# Players

## Your numbers

Your six stats are **STR, DEX, CON, INT, WIS, CHA**. The number on your sheet **is the modifier**:
you add it straight to rolls. There is no "score 14 = +2" conversion.

| Number | Formula |
| --- | --- |
| Stat | base stat + equipment + stat statuses + DM battle adjustment |
| Equipment bonus to stats | the three accessory slots + your **primary** weapon (the second weapon slot adds nothing) |
| Armor Class (AC) | sheet AC + defense of your equipped accessories + AC statuses + DM adjustment |
| Attack modifier | your primary weapon's stat (STR if unarmed) + attack statuses |
| Movement (MOB, tiles) | max(0, 1 + trunc((DEX + 1) / 2) + movement statuses) |
| Initiative modifier | DEX |
| Casting modifier | your spellcasting stat (0 if you have none) |
| Spell attack modifier | casting modifier + attack statuses |
| Spell save DC | 10 + casting modifier |
| Saving throw | d20 + the stat the spell names |

`trunc` drops the fraction toward zero (2.5 → 2, −1.5 → −1).

MOB by DEX:

| DEX | −3 or less | −2 to 0 | 1–2 | 3–4 | 5–6 | 7–8 | 9–10 | 11–12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOB | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |

## Turn order

- **Initiative = d20 + DEX.** Party members type their own d20; the app rolls for enemies and NPCs.
  Highest total goes first.
- **Surprise:** the party gets +100 initiative (they all act first). **Ambush:** enemies get +100.
  The +100 is hidden on screen.
- **Ties:** between party members, the DM picks the order (or keeps the rolled one; an unresolved
  tie comes back next round). Any tie that involves an enemy or NPC is settled by a coin flip.
- When the last creature in the order finishes, a new round starts.
- **Start of your turn:** your statuses tick (see Statuses), item abilities that trigger at turn
  start fire, and a readied action you didn't use lapses.
- **Delay:** step out of the order and come back later, either right now (ahead of whoever is
  acting) or at a spot the DM picks.
- **Ready:** the DM notes what you are waiting for. It lapses at the start of your next turn.
- The app doesn't limit how many times you move, attack or cast in a turn, and doesn't stop anyone
  acting outside their turn. Action economy is the table's call.

## Moving

- You can move to any tile within **MOB** steps, counted **without diagonals**: steps = rows apart +
  columns apart. A diagonal step therefore costs 2.
- Nothing in between matters (walls, creatures, pits, height): only the step count does. On the
  board the creature walks there tile by tile along the straight line.
- The tile you stop on must be on the board and free: no creature, and no terrain that blocks
  (trees, rocks, walls). Terrain you can walk on (acid, flowers) and dropped items are fine.
- Height, ramps, flying and light don't change movement.

## Attacking

1. **Roll a d20.** Total = d20 + attack modifier. **Margin = total − target's AC.**
2. **The margin picks the tier:**

| Margin | Result |
| --- | --- |
| below 0 | miss |
| 0 to 4 | tier 1 |
| 5 to 7 | tier 2 |
| 8 or more | tier 3 |

3. There is **no automatic hit or miss.** A natural 20 that is still below the target's AC misses;
   a natural 1 that reaches it hits.
4. **Damage dice by tier.** Every weapon has three dice, A / B / C. Tier 1 rolls A, tier 2 rolls
   A + B, tier 3 rolls A + B + C. Unarmed is d4 / d4 / d4.
5. **Damage** = dice total → **× 1.5 on a natural 20, rounded up** (dice only) → **+ weapon bonus**
   → never below 0.
6. **Weapon bonus = floor((attack modifier + 2) / 2)**, so statuses like Blessed raise it too.

| Attack modifier | −3 | −2 to −1 | 0 to 1 | 2 to 3 | 4 to 5 | 6 to 7 | 8 to 9 | 10 to 11 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Weapon bonus | −1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |

**Example.** Attack modifier +7, weapon d6 / d4 / d8, target AC 12. You roll 11: total 18, margin 6,
**tier 2**. You roll d6 + d4 = 4 + 3 = 7, plus weapon bonus 4: **11 damage**. With a natural 20:
total 27, margin 15, tier 3. d6 + d4 + d8 = 4 + 3 + 6 = 13, × 1.5 = 19.5 → 20, + 4: **24 damage**.

- **Range:** the app doesn't check weapon reach, range or line of sight. The DM rules on it.
- **Ranged weapons** (any weapon with an ammo type) use one round from the first matching ammo stack
  per attack, **hit or miss**. With no matching ammo you can't attack. Ammo matches when its type is
  the weapon's (any capitalisation), or either one is "Any".
- **Objects:** terrain can be attacked. It has AC 10 and breaks at 0 HP.

## Spells

You can cast if your sheet has a spellcasting stat and known spells.

**Slots.** Cantrips (level 0) are free. Other spells use a slot of their level or higher; casting
with a higher slot adds the spell's **upcast die** once per level above the spell's level. The slot
is spent when the spell resolves, hit or miss. Cancelling before the roll, or aiming an area that
holds nobody, keeps it. A **long rest** (battle menu) refills every party caster's slots.

**Cantrips scale** at character level 5, 11 and 17: each adds another copy of the spell's first
die, whenever at least one die is rolled.

**Range** is in tiles, counted like movement (no diagonals), minimum 1. You are always in range of
yourself.

**Targets.** *Enemy* spells target the other side, *Ally* spells your side (you included), *Any*
targets anyone, and *Self* only you. Attack and auto spells can also target terrain.

**Damage bonus** = floor((casting modifier + 2) / 2) if the spell adds your casting modifier, plus
the spell's flat damage. Attack statuses don't change it.

| Kind | How it resolves |
| --- | --- |
| Attack | d20 + spell attack modifier vs AC. Margin and tiers as for weapons, using the spell's three dice. A natural 20 that hits does × 1.5 dice. |
| Save | The target rolls d20 + the named stat vs your DC. **Total ≥ DC: saved.** A saved target takes nothing, or **half** if the spell is "half on save" (roll the tier-1 dice, add the bonus, halve rounding down). A failed save picks the tier by how much it failed by. |
| Auto | Always hits with all three dice (e.g. Magic Missile). No d20, no critical. |
| Heal | Roll the first die (plus any upcast dice) + bonus; healing stops at max HP. |
| Buff | No roll. The spell's status lands. |

Failed saves:

| Save failed by (DC − total) | 1 to 5 | 6 to 8 | 9 or more |
| --- | --- | --- | --- |
| Tier | 1 | 2 | 3 |

**Riders.** A spell's status (Burning, Chilled, Held...) lands on a hit or a failed save **at or
above the spell's minimum tier**. Ally and heal spells always land it. A target the damage
defeats doesn't get it.

**Areas.** Areas hit the other side. Ally and heal areas hit your side. "Friendly fire" areas hit
both.

| Shape | Covers |
| --- | --- |
| Burst | Every tile within *size* steps (no diagonals) of the aimed tile; the aim must be within range. Range 0 bursts centre on you and leave you out. |
| Cone | Starts next to you and points straight up, down, left or right (whichever is closest to your aim). Row *f* (1 to *size*) is 2 × floor(*f* / 2) + 1 tiles wide: 1, 3, 3, 5, 5... |
| Line | *size* tiles from you toward the aim, diagonals allowed. |

- **Area attack:** each target gets its own d20 against its own AC. **Area save:** each target saves
  separately.
- **One shared damage roll:** the dice for the best tier anyone reached. Each target takes only the
  dice up to its own tier, plus the extra cantrip or upcast dice. The critical (× 1.5), the bonus
  and the half-on-save apply per target.
- Area heals roll the first die once for everyone. Area buffs give everyone the status. Area auto
  spells hit everyone with all three dice.

## Items

- **Consumables:** roll a d10. **Healing = ceil(heal amount × d10 × 10%)**, up to max HP, so a
  10 HP potion heals 1 to 10. If it carries a status you don't already have, you get it. One is used
  up.
- **Pick up** an item from your tile or any tile next to it, diagonals included. Same-named items
  stack.
- **Swap weapons** switches your primary and secondary weapon. Only the primary counts for attacks,
  dice and stat bonuses. Swapping also clears any battle dice adjustment.

## Statuses

Each status has an effect, a strength and a **duration counted in the affected creature's own
turns**.

- **At the start of its turn:** damage or healing over time applies, then the duration drops by 1.
  At 0 the status ends. A 2-turn Burning therefore burns twice.
- **Damage over time can drop a creature to 0 HP** at the start of its turn: an enemy is defeated
  and the next creature acts; a party member starts dying. Healing over time stops at max HP and
  gets a dying hero back up.
- Getting the same status again doesn't stack: it keeps the longer duration and credits the new
  source.
- Duration −1 means permanent (until removed).

| Effect | What it changes |
| --- | --- |
| AC modifier | AC |
| Attack modifier | weapon and spell attack rolls, and the weapon damage bonus |
| Movement modifier | MOB (or one stat, if the status names a stat) |
| Stat modifier | one stat, and everything worked out from it |
| Damage / heal over time | HP at the start of each turn |
| Marker | nothing; a reminder for the table |

| Status | Effect | Duration |
| --- | --- | --- |
| Blessed | +2 to hit (and +1 weapon damage) | 10 |
| Shield of Faith | +2 AC | 10 |
| Burning | 2 damage per turn | 2 |
| Chilled | −2 MOB | 2 |
| Illuminated | −2 AC | 2 |
| Held | −99 MOB (can't move; can still attack and cast) | 2 |
| Poisoned | −2 to hit | 3 |
| Regenerating | +2 HP per turn | 3 |
| Prone, Stunned, Frightened | marker | 1, 1, 2 |
| Hidden | marker | permanent |

## Falling and dying

- A party member at **0 HP** stays on the board, **Dying**: no actions, and HP never goes below 0.
  More damage while dying changes nothing.
- **Any healing** ends dying.
- The DM decides what happens: **Recover** (back up with 1 HP), **Hold on** (still dying) or
  **Perish** (removed, a tombstone marks the spot, and the sheet is marked dead). The app rolls no
  death saves.
- Enemies and NPCs at 0 HP are removed.
- The battle ends in **victory** when the DM ends it with no enemies left.

## What the TV shows

The TV mirrors the board from the DM's camera. The DM picks what it shows (Field → TV): enemy health
(exact, vague or hidden), enemy names, party HP numbers, damage and healing numbers, status names,
enemy initiative rolls, the turn order rail and spell templates. Enemies, NPCs and dropped items
on a **dark** tile are hidden from the TV; the party and the scenery always show.

# DM

## Enemies

| Number | Formula |
| --- | --- |
| Attack modifier | DEX + attack statuses (every enemy attacks with DEX) |
| Weapon bonus | floor((attack modifier + 2) / 2) |
| Damage dice | the enemy's A / B / C dice, by tier as for weapons |
| AC | armor class (0 or less counts as 10) + DM adjustment + AC statuses |
| MOB | max(0, mobility + movement statuses) |
| Initiative | d20 + DEX (rolled by the app) |
| Saving throw | the enemy's stat for that save (+ stat statuses). DEX saves add the DM's DEX adjustment. **An enemy without saved stats uses DEX for every save.** |

- Enemies move and attack. They can't cast spells or use items in the app.
- **NPCs** (characters outside the party) get no actions in the app: they can't move, attack or
  cast. Change their HP and statuses by hand. They are on the party's side for spells and areas, but
  on the enemies' side for Ambush and initiative ties.
- Anyone placed mid-battle (reinforcements included) rolls d20 + DEX and slots into the order.
  Queue reinforcements for a round in Field → Spawn: the app asks at the start of that round, and
  again each round you choose **Later**.
- **End battle** is a victory only when no enemies are left on the board.

## Damage pipeline (all attacks)

1. d20 + modifier − AC = margin → tier (0–4 / 5–7 / 8+); below 0 misses.
2. Dice for the tier (weapons and spells: cumulative A, A + B, A + B + C).
3. Natural 20 **and** a hit (weapon or spell attack): dice total × 1.5, rounded up.
4. + bonus (weapon bonus, or spell bonus), only if any dice were rolled; floor at 0.
5. Half on save: rounding down, **after** the bonus.
6. HP: party members clamp at 0 and drop to Dying; enemies at 0 are removed; terrain at 0 breaks.

Each typed die must be within the die's range (1 to its size); an unknown die name counts as a d6.

## Spell details

- Tier dice: tier *t* rolls the first *t* of the spell's three dice (missing dice are skipped).
  Cantrip and upcast dice are added **after** the tier dice, once at least one die is rolled.
- Save spells never critical. Auto spells always use tier 3. Heal spells always use tier 1.
- Save DC = 10 + casting modifier. Spell attack = casting modifier + attack statuses.
- A burst must be aimed at a tile on the board within range; cones and lines can be aimed at any
  tile but your own.
- Dying heroes are still valid targets for areas (to heal or to hit).

Spell slots (every caster uses the full-caster table):

| Level | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | 9th |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | | | | | | | | |
| 2 | 3 | | | | | | | | |
| 3 | 4 | 2 | | | | | | | |
| 4 | 4 | 3 | | | | | | | |
| 5 | 4 | 3 | 2 | | | | | | |
| 6 | 4 | 3 | 3 | | | | | | |
| 7 | 4 | 3 | 3 | 1 | | | | | |
| 8 | 4 | 3 | 3 | 2 | | | | | |
| 9 | 4 | 3 | 3 | 3 | 1 | | | | |
| 10 | 4 | 3 | 3 | 3 | 2 | | | | |
| 11–12 | 4 | 3 | 3 | 3 | 2 | 1 | | | |
| 13–14 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | | |
| 15–16 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | |
| 17 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | 1 |
| 18 | 4 | 3 | 3 | 3 | 3 | 1 | 1 | 1 | 1 |
| 19 | 4 | 3 | 3 | 3 | 3 | 2 | 1 | 1 | 1 |
| 20 | 4 | 3 | 3 | 3 | 3 | 2 | 2 | 1 | 1 |

## Statuses (DM detail)

- Duration 0 also never expires (the Java behaviour, F-8, kept).
- A status's ticks happen once per round per creature, however you reorder or delay.
- Statuses edited on the sheet mid-battle reach the battle at once.

## Item abilities

Innate abilities, both weapon slots and every accessory are checked at the **start of the owner's
turn** (characters only; enemies have no abilities). Only the **turn start** trigger does anything, and every ability
fires on it whatever its type:

| Effect | What happens |
| --- | --- |
| Heal | heals up to the ability's amount, stopping at max HP |
| Damage | deals its amount, never below 1 HP |
| Status | adds a marker status of that name for 1 turn, if not already present |
| Stat boost | nothing |

The other triggers (on hit, on equip, on damaged, passive) never fire.

## DM tools that change the math

| Tool | Effect |
| --- | --- |
| ± HP (H) | Typed damage or healing. Damage to 0 follows the usual 0-HP rules. |
| Status palette (S) | Adds a status by hand; it refreshes like a spell rider. |
| Adjust AC, stats & dice | Battle-only. Dice step through d4 → d6 → d8 → d10 → d12 → d20 per tier; a weapon swap clears the dice changes. |
| Recover / Hold on / Perish | Resolves a dying hero. |
| Field → Light | Light and darkness. **Visual only**, except that the TV hides creatures on dark tiles. |
| Field → Height, flying | **Visual only.** No effect on movement, range, attacks or areas. |
| Debug panel (`) | Set HP, compat flags, read-only mode. |

## House rules kept from the Java app

Each battle stores these flags, so a saved battle keeps the rules it started with (debug panel →
Compat flags). Current defaults:

| Flag | Setting | Meaning |
| --- | --- | --- |
| F-1 turn-start abilities | fixed | fire once per turn start |
| F-3 Begin | fixed | the first creature gets a normal turn start |
| F-4 damage over time | fixed | damage over time can drop a creature to 0 HP (Java stopped it at 1) |
| F-8 duration 0 | **Java** | duration 0 never expires |
| F-7 NPC side | **Java** | NPCs are enemy-side for Ambush and ties only |
| F-2 victory | fixed | victory only when no enemies remain |
| F-5 removals | fixed | removing the acting creature starts the next one's turn properly, and wrapping advances the round |
| F-15 pickups | fixed | creatures can stand on dropped items |
| F-18 half on save | fixed | half damage works with any tier die |
| F-16 ammo | fixed | old ammo files match by their legacy weapon type |
| F-14 0 HP | fixed | HP clamps at 0, party members go Dying |
| F-13 range 0 | **Java** | a single-target spell with range 0 always hits the caster |
| R8.2 placement | **Java** | enemies placed before Begin roll a preview initiative |
