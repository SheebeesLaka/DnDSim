# The editors: Character Sheets, Asset Editor, Spell Editor

Ports of `UI/CharacterSheetView.java` + `CharacterSheetPane.java`, `UI/AssetEditorView.java` and
`UI/SpellEditorDialog.java` (FEATURES.md §14, §4.7). They read and write the same `saves/` files as
the Java app, in the same JSON shapes and key order, so either app can open what the other wrote.

## Getting there

The app now opens on a menu: **Battle** (the grid setup, as before), **Character Sheets** and
**Asset Editor**. `?view=menu|setup|sheets|assets` jumps straight to one. During a battle,
**Manage → Character Sheets** opens the sheets over the battle (the battle keeps running underneath;
**← Back to battle** returns), and the spell picker has **✎ Edit Spell**.

Like Java there is no Save button. Every change is written as you make it: sheet fields after a
quarter-second pause, renames and dialogs at once. On a fixture scenario (`?scenario=test`) or with
`?readonly=1` nothing is written; the writes are logged instead (`window.dndsim.assets.writes`),
which is what the e2e tests check.

## Character Sheets

- **Characters mode.** Group chips (All / Group Ω / Group α / NPC / Ungrouped) with counts;
  double-click a chip to make it the default tab (★, saved as `characterSheets.defaultGroup` in
  `ui_prefs.json`). Right-click a character to move it to a group. **+ Character** creates one in
  the group being shown.
- **The sheet.** Name (renaming moves the file and updates `party.json`), class, sprite (pick from
  the library or upload), HP current/max with a bar, AC, Unconscious/Dead, colour, group;
  attributes with the radar chart, base/bonus/total and the point budget
  (27 + 2 per level above 1); level; equipment slots filled from the inventory; abilities
  (Passive/Active/Special); spellcasting (casting stat, save DC and attack bonus, Long Rest, slot
  pips, known spells with edit/forget, Learn Spell); inventory tabs with Add Item and remove
  (all, or some of a stack).
- **Party.** Available / Active Party lists with Add > / < Remove, double-click, and drag and drop
  (into Active, between lists, and to reorder). Every change writes `party.json`; placement follows
  the Active order.
- **Enemies mode.** Search, sort (Name / HP / AC / Initiative, either direction), tag filter chips
  (any of the chosen tags), + Add Tag, a summary line, and cards grouped by first tag. **+ Enemy** /
  Edit open the enemy editor: health, mobility, AC, Dexterity (attack and initiative), the other
  five saves, the three damage dice, colour, sprite and tags (a new tag is added to
  `enemy_tags.json`).
- **Mid-battle edits.** Java shared the sheet objects between the sheets view and the battle. Here a
  saved sheet is pushed into the running battle with a `REPLACE_SHEET` command (allowed at any time,
  like the other DM adjustments), so a unit's HP, statuses, gear and spells follow the edit and
  replay correctly. Opening the sheets first takes the battle's own changes (HP, slots) so nothing
  is lost either way.

## Asset Editor

Tabs **Items** (sub-tabs Weapons, Accessories, Consumables (with ammo and crafting items), Key
Items), **Terrain** and **Spells**, each as cards with Edit / Delete and an add button per kind.
The item dialog covers every type's fields: dice, stat type, ammo type, attribute modifiers,
abilities (full ability dialog), defence, heal amount and status effect, crafting category,
description, quest flag and so on. The terrain dialog includes the sprite, collision, and the
layer (only when the terrain doesn't block movement, as in Java).

## Spell Editor

The Java dialog: name, level, school, resolution, target (follows the resolution when it only makes
sense one way), range, area shape and size, tier dice, save stat, half on save, the rider effect and
its duration, colour, and a one-line preview of what the spell does. Renaming a spell updates every
sheet that knows it.

## Editor bugs fixed (FEATURES.md §17.3)

These are editor and file bugs, not combat rules, so they are fixed outright (the same call as F-34,
F-22 and F-21 in Phase 2) rather than put behind compat flags:

| # | Java | Here |
| --- | --- | --- |
| F-44 | Renaming a character, item, enemy or terrain left the old file behind (and `party.json` stale) | the new file is written, the old one deleted, `party.json` follows; a name whose file stem would overwrite another record is refused |
| F-45 | Deleted terrain came back (file never deleted) | the file is deleted |
| F-46 | Some enemies couldn't be deleted (path built without the sanitiser) | delete uses the stem the file was loaded from |
| F-47 | Crafting items written as `"Crafting"`, which the inventory loader didn't know | written as `"Crafting Item"`; `"Crafting"` is also read, so old files load |
| F-48 | Ability dialog had no Ability Type or Status Name; editing a STATUS ability dropped its status | both fields are there and kept |
| F-51 | Ticking Unconscious/Dead on a sheet wiped every other status | other statuses are kept |
| F-52 | Add Item dropped abilities and colour | the item is copied whole |
| F-53 | New characters got their starting gear twice | equipped once, not also in the inventory |
| F-54 | Dragging from Available onto Active Party did nothing | it works, at the drop position |
| F-56 | Enemy editor wrote derived AC/movement back (AC 0 → 10), mobility minimum 1 | values written as typed; mobility can be 0 |
| F-57 | Characters/Enemies switch could end with nothing selected | one mode is always selected |
| F-59 | Consumable editor always saved `effect = null` | the effect is editable |
| — | Equipping from the inventory removed the whole stack | one copy is taken; the previous item goes back to the inventory |

Unchanged on purpose: F-49 (`PRIMARY`/`SECONDARY` are still written, so Java reads the files the
same way; `saves/entities/nonparty/` is still never loaded), F-60 (sample data left as it is).
F-58 (malformed JSON) was already handled in Phase 1: a bad file is listed as an asset problem
instead of stopping the load.

## Limits

- **Sprite uploads** go to `resources/sprites/<party|enemies|terrain>/` at the repo root (never
  overwriting: a clash becomes `name_2.png`, max 5 MB, PNG/GIF/JPEG/WebP). The web app also reads
  `legacy-java/resources/sprites/`, but the Java app run from `legacy-java/` won't see new uploads
  unless you copy them there.
- No undo. Deletes ask first; there is no recycle bin (Java had none either).
- Two windows editing the same file: the last write wins (as in Java).
- The editors are DM-window only; the player window doesn't show them.
