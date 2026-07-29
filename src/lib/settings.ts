import { prisma } from './db';
import {
  DEFAULT_ALERT_COOLDOWN_DAYS,
  DEFAULT_RESERVE_DAYS,
  DEFAULT_USAGE_WINDOW_DAYS,
} from './reorder';

export type AppSettings = {
  /** Extra tartaléknapok az átfutási időn felül (globális alapérték) */
  reserveDays: number;
  /** Hány nap fogyásából számoljuk a napi átlagot */
  usageWindowDays: number;
  /** Ennyi napig nem küldünk újra riasztást ugyanarra az alapanyagra */
  alertCooldownDays: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  reserveDays: DEFAULT_RESERVE_DAYS,
  usageWindowDays: DEFAULT_USAGE_WINDOW_DAYS,
  alertCooldownDays: DEFAULT_ALERT_COOLDOWN_DAYS,
};

const KEYS: Record<keyof AppSettings, string> = {
  reserveDays: 'reserve_days',
  usageWindowDays: 'usage_window_days',
  alertCooldownDays: 'alert_cooldown_days',
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const readNumber = (key: string, fallback: number): number => {
    const raw = map.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  return {
    reserveDays: readNumber(KEYS.reserveDays, DEFAULT_SETTINGS.reserveDays),
    usageWindowDays: readNumber(KEYS.usageWindowDays, DEFAULT_SETTINGS.usageWindowDays) || 60,
    alertCooldownDays: readNumber(KEYS.alertCooldownDays, DEFAULT_SETTINGS.alertCooldownDays),
  };
}

export async function saveSettings(next: Partial<AppSettings>): Promise<void> {
  const entries = (Object.keys(KEYS) as Array<keyof AppSettings>)
    .filter((k) => next[k] !== undefined)
    .map((k) => ({ key: KEYS[k], value: String(next[k]) }));

  await prisma.$transaction(
    entries.map((e) =>
      prisma.setting.upsert({
        where: { key: e.key },
        create: e,
        update: { value: e.value },
      }),
    ),
  );
}
