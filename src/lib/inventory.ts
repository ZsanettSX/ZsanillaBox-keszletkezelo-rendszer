import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { getSettings } from './settings';
import {
  calcAvgDailyUsage,
  calcReorderPoint,
  calcSuggestedOrder,
  daysOfStockLeft,
  explodeBom,
  roundQty,
  stockStatus,
  type StockStatus,
} from './reorder';

/** A @db.Date oszlopokhoz UTC-éjfélre normalizált dátum kell. */
export function toDateOnly(input: Date = new Date()): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export type UsageSource = 'shopify_order' | 'import' | 'manual' | 'stocktake';

/**
 * Ezek a források jelentenek valódi, ismétlődő keresletet — az átlagfogyás és a
 * fogyás-grafikon ezekből számol.
 *
 * A `stocktake` szándékosan kimarad. A leltár-korrekció egyszeri esemény: lefelé
 * eltérés (elveszett, elrontott darab) nem jelez jövőbeli keresletet, felfelé
 * korrekció pedig negatív fogyásként épp lehúzná az átlagot — így egy elgépelt
 * szám vagy egy mértékegység-váltás némán elrontaná az összes rendelési pontot.
 * A korrekció attól még bekerül a naplóba, és látszik az alapanyag oldalán.
 */
export const DEMAND_SOURCES: UsageSource[] = ['shopify_order', 'import', 'manual'];

/**
 * Készletlevonás + fogyásnapló egy tranzakcióban.
 *
 * A `usage` map kulcsa alapanyag-id, értéke a felhasznált mennyiség (pozitív = fogyás).
 * A művelet mindig lefut, akkor is, ha a készlet negatívba fordul — a negatív
 * készlet valós információ (többet adtunk el, mint amit nyilvántartunk), nem hiba,
 * amit el kellene rejteni.
 *
 * `adjustStock: false` esetén csak a napló íródik. A történeti importnál ez a helyes:
 * a jelenlegi készletet Zsanett a mai állapot szerint viszi fel, abból nem szabad
 * még egyszer levonni a múltbeli rendeléseket.
 */
export async function applyUsage(
  usage: Map<string, number>,
  opts: { date?: Date; source: UsageSource; reference?: string; adjustStock?: boolean },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (usage.size === 0) return;
  const date = toDateOnly(opts.date);
  const adjustStock = opts.adjustStock ?? true;
  const client = tx ?? prisma;

  const run = async (db: Prisma.TransactionClient) => {
    for (const [rawMaterialId, quantity] of usage) {
      if (quantity === 0) continue;
      if (adjustStock) {
        await db.rawMaterial.update({
          where: { id: rawMaterialId },
          data: { currentStock: { decrement: quantity } },
        });
      }
      await db.usageHistory.create({
        data: {
          rawMaterialId,
          date,
          quantityUsed: quantity,
          source: opts.source,
          reference: opts.reference ?? null,
        },
      });
    }
  };

  if (tx) await run(client as Prisma.TransactionClient);
  else await prisma.$transaction(run);
}

/**
 * Újraszámolja az átlagfogyást és a rendelési pontot.
 * `materialIds` nélkül minden aktív alapanyagra lefut.
 */
export async function recalculate(materialIds?: string[]): Promise<number> {
  const settings = await getSettings();
  const windowStart = toDateOnly(
    new Date(Date.now() - settings.usageWindowDays * 24 * 60 * 60 * 1000),
  );

  const materials = await prisma.rawMaterial.findMany({
    where: materialIds?.length ? { id: { in: materialIds } } : undefined,
    select: { id: true, leadTimeDays: true, safetyBuffer: true },
  });
  if (materials.length === 0) return 0;

  const sums = await prisma.usageHistory.groupBy({
    by: ['rawMaterialId'],
    where: {
      date: { gte: windowStart },
      rawMaterialId: { in: materials.map((m) => m.id) },
      source: { in: DEMAND_SOURCES },
    },
    _sum: { quantityUsed: true },
  });
  const usedByMaterial = new Map(sums.map((s) => [s.rawMaterialId, s._sum.quantityUsed ?? 0]));

  await prisma.$transaction(
    materials.map((m) => {
      const avgDailyUsage = calcAvgDailyUsage(
        usedByMaterial.get(m.id) ?? 0,
        settings.usageWindowDays,
      );
      const reorderPoint = calcReorderPoint({
        avgDailyUsage,
        leadTimeDays: m.leadTimeDays,
        safetyBuffer: m.safetyBuffer,
      });
      return prisma.rawMaterial.update({
        where: { id: m.id },
        data: { avgDailyUsage, reorderPoint },
      });
    }),
  );

  return materials.length;
}

export type DashboardRow = {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  supplierName: string | null;
  supplierUrl: string | null;
  leadTimeDays: number;
  safetyBuffer: number;
  avgDailyUsage: number;
  reorderPoint: number;
  reserveDays: number;
  suggestedOrder: number;
  daysLeft: number | null;
  status: StockStatus;
};

/** Minden aktív alapanyag a számolt státusszal — a dashboard és az email közös forrása. */
export async function getInventoryOverview(): Promise<DashboardRow[]> {
  const settings = await getSettings();
  const materials = await prisma.rawMaterial.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });

  return materials.map((m) => {
    const reserveDays = m.reserveDays ?? settings.reserveDays;
    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      currentStock: roundQty(m.currentStock),
      supplierName: m.supplierName,
      supplierUrl: m.supplierUrl,
      leadTimeDays: m.leadTimeDays,
      safetyBuffer: m.safetyBuffer,
      avgDailyUsage: m.avgDailyUsage,
      reorderPoint: m.reorderPoint,
      reserveDays,
      suggestedOrder: calcSuggestedOrder({
        avgDailyUsage: m.avgDailyUsage,
        leadTimeDays: m.leadTimeDays,
        reserveDays,
        currentStock: m.currentStock,
        safetyBuffer: m.safetyBuffer,
        orderMultiple: m.orderMultiple,
      }),
      daysLeft: daysOfStockLeft(m.currentStock, m.avgDailyUsage),
      status: stockStatus(m.currentStock, m.reorderPoint),
    };
  });
}

/** Csak azok, amiknél a készlet elérte vagy átlépte a rendelési pontot. */
export async function getMaterialsToReorder(): Promise<DashboardRow[]> {
  const rows = await getInventoryOverview();
  return rows.filter((r) => r.status === 'critical' || r.status === 'reorder');
}

/**
 * Leltár: a készlet abszolút beállítása. A különbözetet fogyásnaplóba írjuk,
 * hogy a történet konzisztens maradjon a készlettel.
 */
export async function setStockLevel(
  rawMaterialId: string,
  newStock: number,
  note?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const material = await tx.rawMaterial.findUniqueOrThrow({
      where: { id: rawMaterialId },
      select: { currentStock: true },
    });
    const delta = roundQty(material.currentStock - newStock, 4);
    await tx.rawMaterial.update({
      where: { id: rawMaterialId },
      data: { currentStock: newStock },
    });
    if (delta !== 0) {
      await tx.usageHistory.create({
        data: {
          rawMaterialId,
          date: toDateOnly(),
          quantityUsed: delta,
          source: 'stocktake',
          reference: note ?? 'Kézi készletkorrekció',
        },
      });
    }
  });
  await recalculate([rawMaterialId]);
}

export type StockReceiptInput = { rawMaterialId: string; quantity: number };

/**
 * Bevételezés: a megvásárolt mennyiség hozzáadása a készlethez.
 *
 * Szándékosan NEM ír a fogyásnaplóba. A beszerzés nem negatív fogyás — ha oda
 * kerülne, lehúzná a számolt napi átlagot, és a rendszer épp akkor rendelne
 * kevesebbet, amikor a legtöbbre lenne szükség.
 *
 * Negatív mennyiség is megengedett: ezzel javítható egy téves bevételezés vagy
 * könyvelhető egy beszállítónak visszaküldött tétel — anélkül, hogy nem létező
 * fogyás keletkezne a naplóban.
 *
 * Az átlagfogyás és a rendelési pont sem a készletből számolódik, ezért itt
 * nincs szükség újraszámolásra.
 */
export async function recordStockReceipts(
  receipts: StockReceiptInput[],
  opts: { date?: Date; note?: string } = {},
): Promise<number> {
  const items = receipts.filter((r) => Number.isFinite(r.quantity) && r.quantity !== 0);
  if (items.length === 0) return 0;

  const date = toDateOnly(opts.date);
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.rawMaterial.update({
        where: { id: item.rawMaterialId },
        data: { currentStock: { increment: item.quantity } },
      });
      await tx.stockReceipt.create({
        data: {
          rawMaterialId: item.rawMaterialId,
          date,
          quantity: item.quantity,
          note: opts.note ?? null,
        },
      });
    }
  });

  return items.length;
}

export type ShopifyOrderLine = { shopifyProductId: string; quantity: number };

/**
 * Shopify rendelés tételeit alapanyag-fogyásra bontja és könyveli.
 * Visszaadja, mely termékekhez nem találtunk receptet — ezeket jelezni kell,
 * különben csendben elveszne a fogyás.
 */
export async function applyShopifyOrder(
  lines: ShopifyOrderLine[],
  opts: { date?: Date; reference?: string },
): Promise<{ appliedMaterialIds: string[]; unmatchedProductIds: string[] }> {
  const shopifyIds = [...new Set(lines.map((l) => l.shopifyProductId))];
  const products = await prisma.product.findMany({
    where: { shopifyProductId: { in: shopifyIds } },
    select: { id: true, shopifyProductId: true, recipeItems: true },
  });

  const byShopifyId = new Map(products.map((p) => [p.shopifyProductId!, p]));
  const unmatchedProductIds = shopifyIds.filter((id) => {
    const p = byShopifyId.get(id);
    return !p || p.recipeItems.length === 0;
  });

  const usage = explodeBom(
    lines
      .filter((l) => byShopifyId.has(l.shopifyProductId))
      .map((l) => ({ productId: byShopifyId.get(l.shopifyProductId)!.id, quantity: l.quantity })),
    products.flatMap((p) =>
      p.recipeItems.map((r) => ({
        productId: p.id,
        rawMaterialId: r.rawMaterialId,
        quantityPerUnit: r.quantityPerUnit,
      })),
    ),
  );

  await applyUsage(usage, { date: opts.date, source: 'shopify_order', reference: opts.reference });
  const appliedMaterialIds = [...usage.keys()];
  if (appliedMaterialIds.length) await recalculate(appliedMaterialIds);

  return { appliedMaterialIds, unmatchedProductIds };
}
