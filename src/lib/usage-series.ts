/**
 * Fogyásadatok idősorrá alakítása a grafikonhoz.
 *
 * Mindenhol UTC-vel számolunk, mert a `date` oszlop dátum típusú (UTC-éjfél).
 * Helyi idővel a hónapfordulók egy nappal elcsúsznának.
 */

export type Bucket = 'day' | 'week' | 'month';

export type UsageRecord = { date: Date; quantityUsed: number };

export type SeriesPoint = {
  /** Az időszak kezdete ISO dátumként — stabil kulcs a React listákhoz */
  key: string;
  /** Emberi címke a tengelyre */
  label: string;
  total: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Az időtáv hosszához illő felbontás: napi bontás egy éven át olvashatatlan lenne. */
export function bucketFor(rangeDays: number): Bucket {
  if (rangeDays <= 31) return 'day';
  if (rangeDays <= 190) return 'week';
  return 'month';
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** A hét kezdete hétfő (magyar konvenció). */
function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  // getUTCDay: 0 = vasárnap → 6 nappal a hétfő után
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY_MS);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function bucketStart(date: Date, bucket: Bucket): Date {
  if (bucket === 'week') return startOfWeek(date);
  if (bucket === 'month') return startOfMonth(date);
  return startOfDay(date);
}

function nextBucket(date: Date, bucket: Bucket): Date {
  if (bucket === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  }
  return new Date(date.getTime() + (bucket === 'week' ? 7 : 1) * DAY_MS);
}

const dayLabel = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', timeZone: 'UTC' });

function labelFor(date: Date, bucket: Bucket): string {
  return bucket === 'month' ? monthLabel.format(date) : dayLabel.format(date);
}

/**
 * Az időszak minden vödrét visszaadja, a fogyás nélküli időszakokat 0-val.
 *
 * A nullák kihagyása azt sugallná, hogy nem volt mérés — pedig volt, csak nem
 * fogyott semmi. Egy szezonális termék grafikonja e nélkül félrevezető.
 */
export function buildUsageSeries(
  records: UsageRecord[],
  start: Date,
  end: Date,
  bucket: Bucket,
): SeriesPoint[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    const key = bucketStart(record.date, bucket).toISOString().slice(0, 10);
    totals.set(key, (totals.get(key) ?? 0) + record.quantityUsed);
  }

  const points: SeriesPoint[] = [];
  const last = bucketStart(end, bucket);
  let cursor = bucketStart(start, bucket);

  // Védőkorlát: hibás dátumhatárok se pörgessék végtelenbe a ciklust.
  for (let guard = 0; cursor <= last && guard < 2000; guard++) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({
      key,
      label: labelFor(cursor, bucket),
      total: Math.round((totals.get(key) ?? 0) * 100) / 100,
    });
    cursor = nextBucket(cursor, bucket);
  }

  return points;
}
