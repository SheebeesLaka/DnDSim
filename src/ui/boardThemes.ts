/** Board themes offered by the setup screen and Field → Board, moonbase first. */
export const BOARD_THEMES = [
  { id: 'facility', label: 'Facility (metal plating)' },
  { id: 'arboretum', label: 'Arboretum (overgrown dome)' },
  { id: 'stone', label: 'Stone' },
  { id: 'grass', label: 'Grass' },
  { id: 'dirt', label: 'Dirt' },
] as const;

/** What a new battle starts with. */
export const DEFAULT_BOARD_THEME = 'facility';
