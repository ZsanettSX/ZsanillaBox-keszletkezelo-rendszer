import { prisma } from './db';
import { buildAlertEmail, sendAlertEmail } from './email';
import { getMaterialsToReorder, recalculate } from './inventory';
import { getSettings } from './settings';
import { selectAlerts, type LastAlert } from './reorder';

export type DailyAlertResult = {
  /** Hány alapanyag van a rendelési pont alatt */
  candidates: number;
  /** Kiment-e az email */
  sent: boolean;
  /** Ha nem ment ki, miért */
  reason?: string;
  /** Mely alapanyagok váltották ki a küldést */
  triggeredBy: string[];
};

/**
 * A napi riasztás teljes folyamata: újraszámolás → jelöltek → duplikáció-szűrés
 * → email → naplózás.
 *
 * A `dryRun` mindent kiszámol, de nem küld és nem naplóz — ezzel lehet
 * biztonságosan kipróbálni, mi menne ki.
 */
export async function runDailyAlert(options: { dryRun?: boolean } = {}): Promise<DailyAlertResult> {
  const { dryRun = false } = options;

  await recalculate();

  const candidates = await getMaterialsToReorder();
  if (candidates.length === 0) {
    return { candidates: 0, sent: false, reason: 'Nincs rendelési pont alatti alapanyag.', triggeredBy: [] };
  }

  const settings = await getSettings();

  // Alapanyagonként a legutóbbi riasztás — ehhez képest nézzük, csökkent-e a készlet.
  const recentLogs = await prisma.reorderLog.findMany({
    where: { rawMaterialId: { in: candidates.map((c) => c.id) } },
    orderBy: { sentAt: 'desc' },
  });
  const lastAlerts = new Map<string, LastAlert>();
  for (const log of recentLogs) {
    if (!lastAlerts.has(log.rawMaterialId)) {
      lastAlerts.set(log.rawMaterialId, { sentAt: log.sentAt, stockAtSend: log.stockAtSend });
    }
  }

  const decision = selectAlerts(
    candidates.map((c) => ({ ...c, rawMaterialId: c.id })),
    lastAlerts,
    settings.alertCooldownDays,
    new Date(),
  );

  if (!decision.shouldSend) {
    return {
      candidates: candidates.length,
      sent: false,
      reason: `Minden érintett alapanyagról ment már riasztás ${settings.alertCooldownDays} napon belül, és azóta nem csökkent tovább a készlet.`,
      triggeredBy: [],
    };
  }

  const triggeredBy = decision.triggers.map((t) => t.name);
  const email = buildAlertEmail(decision.items, process.env.APP_URL ?? 'http://localhost:3000');

  if (dryRun) {
    return {
      candidates: candidates.length,
      sent: false,
      reason: 'Próbafutás (dry run) — email nem ment ki.',
      triggeredBy,
    };
  }

  const result = await sendAlertEmail(email);
  if (!result.sent) {
    return { candidates: candidates.length, sent: false, reason: result.reason, triggeredBy };
  }

  // Csak sikeres küldés után naplózunk, különben egy Resend-hiba után a cooldown
  // elnyomná a következő próbálkozást is.
  await prisma.reorderLog.createMany({
    data: decision.items.map((item) => ({
      rawMaterialId: item.id,
      suggestedQuantity: item.suggestedOrder,
      stockAtSend: item.currentStock,
    })),
  });

  return { candidates: candidates.length, sent: true, triggeredBy };
}
