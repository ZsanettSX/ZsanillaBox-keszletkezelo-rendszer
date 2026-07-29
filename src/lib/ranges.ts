/**
 * Időszak-választó opciók. A Fogyás és a Statisztika oldal is ezt használja,
 * hogy a két nézet ugyanazokat az időszakokat kínálja.
 *
 * Szándékosan 'use client' nélküli modul: egy kliens-modulból importált konstans
 * a szerver oldalon csak kliens-hivatkozás lenne, nem valódi tömb.
 */
export const RANGES = [
  { value: '30', label: 'Utolsó 30 nap' },
  { value: '90', label: 'Utolsó 3 hónap' },
  { value: '180', label: 'Utolsó 6 hónap' },
  { value: '365', label: 'Utolsó 12 hónap' },
] as const;

export const DEFAULT_RANGE = 90;

/** A keresési paraméterből érvényes napszámot ad; ismeretlen értéknél az alapértelmezést. */
export function resolveRangeDays(raw: string | undefined): number {
  return RANGES.some((r) => r.value === raw) ? Number(raw) : DEFAULT_RANGE;
}
