/**
 * Az időszak-választó opciói.
 *
 * Szándékosan külön, 'use client' nélküli modulban: egy kliens-modulból importált
 * konstans a szerver oldalon csak kliens-hivatkozás lenne, nem valódi tömb.
 */
export const RANGES = [
  { value: '30', label: 'Utolsó 30 nap' },
  { value: '90', label: 'Utolsó 3 hónap' },
  { value: '180', label: 'Utolsó 6 hónap' },
  { value: '365', label: 'Utolsó 12 hónap' },
] as const;

export const DEFAULT_RANGE = 90;
