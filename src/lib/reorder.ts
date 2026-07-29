/**
 * A készletkezelés tiszta (adatbázis-független) üzleti logikája.
 * Minden itteni függvény determinisztikus és unit-tesztelt — a DB-hez nyúló
 * rétegek (src/lib/inventory.ts) ezeket hívják.
 */

/** Ennyi nap fogyásából számoljuk a napi átlagot, ha nincs más beállítva. */
export const DEFAULT_USAGE_WINDOW_DAYS = 60;
/** Extra tartaléknapok az átfutási időn felül. */
export const DEFAULT_RESERVE_DAYS = 14;
/** Ennyi napig nem küldünk újra riasztást ugyanarra az alapanyagra. */
export const DEFAULT_ALERT_COOLDOWN_DAYS = 4;
/** A rendelési pont ennyiszerese alatt már sárga (figyelmeztető) a jelzés. */
export const WARNING_FACTOR = 1.3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Mennyiségek kerekítése — a lebegőpontos maradékok (0.30000000000000004) levágására. */
export function roundQty(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Napi átlagfogyás = az ablakban felhasznált összmennyiség / az ablak hossza.
 *
 * Szándékosan a teljes ablakkal osztunk, nem csak azokkal a napokkal, amikor volt
 * fogyás: egy hetente egyszer fogyó alapanyagnál a "csak fogyásos napok" átlaga
 * hétszeres túlbecslést adna.
 */
export function calcAvgDailyUsage(totalUsedInWindow: number, windowDays: number): number {
  if (windowDays <= 0) return 0;
  return roundQty(Math.max(0, totalUsedInWindow) / windowDays, 4);
}

/**
 * Rendelési pont: ennyi készletnél kell megrendelni, hogy a beszállító átfutási
 * ideje alatt ne fogyjunk ki.
 */
export function calcReorderPoint(input: {
  avgDailyUsage: number;
  leadTimeDays: number;
  safetyBuffer: number;
}): number {
  const { avgDailyUsage, leadTimeDays, safetyBuffer } = input;
  return roundQty(Math.max(0, avgDailyUsage) * Math.max(0, leadTimeDays) + Math.max(0, safetyBuffer));
}

/**
 * Javasolt rendelési mennyiség: annyi, hogy az átfutási idő + tartaléknapok
 * fogyását fedezze, a meglévő készlettel együtt.
 */
export function calcSuggestedOrder(input: {
  avgDailyUsage: number;
  leadTimeDays: number;
  reserveDays: number;
  currentStock: number;
  safetyBuffer?: number;
  orderMultiple?: number;
}): number {
  const {
    avgDailyUsage,
    leadTimeDays,
    reserveDays,
    currentStock,
    safetyBuffer = 0,
    orderMultiple = 0,
  } = input;

  const targetStock =
    Math.max(0, avgDailyUsage) * (Math.max(0, leadTimeDays) + Math.max(0, reserveDays)) +
    Math.max(0, safetyBuffer);
  const needed = targetStock - currentStock;
  if (needed <= 0) return 0;

  if (orderMultiple > 0) {
    return roundQty(Math.ceil(needed / orderMultiple) * orderMultiple);
  }
  return roundQty(needed);
}

export type StockStatus = 'critical' | 'reorder' | 'warning' | 'ok';

/** Készlet-státusz a dashboard piros/sárga/zöld jelzéséhez. */
export function stockStatus(currentStock: number, reorderPoint: number): StockStatus {
  if (currentStock <= 0) return 'critical';
  if (currentStock <= reorderPoint) return 'reorder';
  if (reorderPoint > 0 && currentStock <= reorderPoint * WARNING_FACTOR) return 'warning';
  return 'ok';
}

/** Hány napra elég még a készlet a jelenlegi fogyás mellett. null = nincs mérhető fogyás. */
export function daysOfStockLeft(currentStock: number, avgDailyUsage: number): number | null {
  if (avgDailyUsage <= 0) return null;
  return roundQty(Math.max(0, currentStock) / avgDailyUsage, 1);
}

// ── BOM robbantás ────────────────────────────────────────────────────────────

export type OrderLine = {
  /** A rendszer belső termék-azonosítója */
  productId: string;
  quantity: number;
};

export type RecipeRow = {
  productId: string;
  rawMaterialId: string;
  quantityPerUnit: number;
};

/**
 * Rendelési tételekből alapanyag-fogyást számol a receptek alapján.
 * A több tételben szereplő azonos alapanyagot összevonja.
 */
export function explodeBom(lines: OrderLine[], recipes: RecipeRow[]): Map<string, number> {
  const byProduct = new Map<string, RecipeRow[]>();
  for (const row of recipes) {
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }

  const usage = new Map<string, number>();
  for (const line of lines) {
    if (line.quantity === 0) continue;
    const recipe = byProduct.get(line.productId);
    if (!recipe) continue;
    for (const item of recipe) {
      const amount = item.quantityPerUnit * line.quantity;
      usage.set(item.rawMaterialId, (usage.get(item.rawMaterialId) ?? 0) + amount);
    }
  }

  for (const [id, amount] of usage) usage.set(id, roundQty(amount, 4));
  return usage;
}

// ── Riasztás-válogatás (duplikáció elkerülése) ───────────────────────────────

export type AlertCandidate = {
  rawMaterialId: string;
  currentStock: number;
};

export type LastAlert = {
  sentAt: Date;
  stockAtSend: number;
};

export type AlertReason = 'new' | 'decreased' | 'cooldown_expired' | 'suppressed';

/**
 * Eldönti, hogy egy adott alapanyag riasztása önmagában indokolja-e az email kiküldését.
 *
 * - nincs korábbi riasztás  → 'new'
 * - lejárt a cooldown       → 'cooldown_expired'
 * - azóta tovább csökkent   → 'decreased'
 * - egyébként               → 'suppressed'
 */
export function classifyAlert(
  candidate: AlertCandidate,
  lastAlert: LastAlert | undefined,
  cooldownDays: number,
  now: Date,
): AlertReason {
  if (!lastAlert) return 'new';
  const daysSince = (now.getTime() - lastAlert.sentAt.getTime()) / MS_PER_DAY;
  if (daysSince >= cooldownDays) return 'cooldown_expired';
  if (candidate.currentStock < lastAlert.stockAtSend) return 'decreased';
  return 'suppressed';
}

export type AlertDecision<T extends AlertCandidate> = {
  /** Kimenjen-e egyáltalán az email */
  shouldSend: boolean;
  /** A teljes lista, ami az emailbe kerül (ha shouldSend igaz) */
  items: Array<T & { reason: AlertReason }>;
  /** Csak azok, amik önmagukban is kiváltották a küldést */
  triggers: Array<T & { reason: AlertReason }>;
};

/**
 * A napi riasztás összeállítása.
 *
 * Ha bármelyik alapanyag friss (új, tovább csökkent, vagy lejárt a cooldownja),
 * kimegy az email — és akkor a **teljes** aktuális lista bekerül, hogy Zsanett
 * egyben lássa, miből kell rendelni. Ha egyik sem friss, nem küldünk semmit.
 */
export function selectAlerts<T extends AlertCandidate>(
  candidates: T[],
  lastAlerts: Map<string, LastAlert>,
  cooldownDays: number,
  now: Date,
): AlertDecision<T> {
  const items = candidates.map((c) => ({
    ...c,
    reason: classifyAlert(c, lastAlerts.get(c.rawMaterialId), cooldownDays, now),
  }));
  const triggers = items.filter((i) => i.reason !== 'suppressed');
  return { shouldSend: triggers.length > 0, items, triggers };
}
