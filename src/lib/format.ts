const numberFormatter = new Intl.NumberFormat('hu-HU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return numberFormatter.format(value);
}

export function formatQtyWithUnit(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `${numberFormatter.format(value)} ${unit}`;
}

export function formatDate(value: Date | string): string {
  return dateFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDays(value: number | null): string {
  if (value === null) return 'nincs fogyás';
  if (value >= 999) return '999+ nap';
  return `${numberFormatter.format(value)} nap`;
}

/** ISO dátum (YYYY-MM-DD) az <input type="date"> mezőkhöz. */
export function toInputDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
