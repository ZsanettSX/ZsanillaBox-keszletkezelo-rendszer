/**
 * Integrációs tesztek valódi PostgreSQL szemantikával.
 *
 * A PGlite a Postgres WASM-ra fordított változata: ugyanaz a motor, csak
 * folyamaton belül fut. Így a tranzakciók, az egyedi kulcsok és a groupBy
 * ugyanúgy viselkednek, mint élesben — szemben egy kézzel írt mock-kal, ami
 * pont a kockázatos részeket hazudná el.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MIGRATIONS_DIR = 'prisma/migrations';
const WEBHOOK_SECRET = 'teszt-webhook-titok';

vi.mock('./db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PrismaPGlite } = await import('pglite-prisma-adapter');
  const { PrismaClient } = await import('@prisma/client');

  process.env.DATABASE_URL ??= 'postgresql://pglite/pglite';

  const pglite = new PGlite();

  // Minden migrációt sorrendben lefuttatunk, hogy a teszt-séma együtt mozogjon
  // az élessel — egy új migráció után ne kelljen itt is átírni semmit.
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((entry) => statSync(join(MIGRATIONS_DIR, entry)).isDirectory())
    .sort();

  for (const migration of migrations) {
    // A BOM-mal kiírt fájlt a Postgres szintaktikai hibaként látná.
    const sql = readFileSync(join(MIGRATIONS_DIR, migration, 'migration.sql'), 'utf8').replace(
      /^﻿/,
      '',
    );
    await pglite.exec(sql);
  }

  return { prisma: new PrismaClient({ adapter: new PrismaPGlite(pglite) }) };
});

const sentEmails: Array<{ subject: string }> = [];
vi.mock('./email', async () => {
  const actual = await vi.importActual<typeof import('./email')>('./email');
  return {
    ...actual,
    sendAlertEmail: vi.fn(async (email: { subject: string }) => {
      sentEmails.push(email);
      return { sent: true, id: 'teszt' };
    }),
  };
});

const { prisma } = await import('./db');
const {
  applyShopifyOrder,
  applyUsage,
  getInventoryOverview,
  recalculate,
  recordStockReceipts,
  setStockLevel,
  toDateOnly,
} = await import('./inventory');
const { runDailyAlert } = await import('./alerts');

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function resetDatabase() {
  await prisma.usageHistory.deleteMany();
  await prisma.stockReceipt.deleteMany();
  await prisma.reorderLog.deleteMany();
  await prisma.recipeItem.deleteMany();
  await prisma.processedOrder.deleteMany();
  await prisma.product.deleteMany();
  await prisma.rawMaterial.deleteMany();
  await prisma.setting.deleteMany();
  sentEmails.length = 0;
}

async function makeMaterial(over: Partial<{ name: string; currentStock: number; leadTimeDays: number; safetyBuffer: number; unit: string }> = {}) {
  return prisma.rawMaterial.create({
    data: {
      name: over.name ?? 'Fonal',
      unit: over.unit ?? 'gombolyag',
      currentStock: over.currentStock ?? 100,
      leadTimeDays: over.leadTimeDays ?? 10,
      safetyBuffer: over.safetyBuffer ?? 5,
    },
  });
}

beforeEach(resetDatabase);

describe('applyUsage', () => {
  it('csökkenti a készletet és naplózza a fogyást', async () => {
    const material = await makeMaterial({ currentStock: 50 });

    await applyUsage(new Map([[material.id, 12]]), { source: 'manual', reference: 'teszt' });

    const after = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    expect(after.currentStock).toBe(38);

    const history = await prisma.usageHistory.findMany({ where: { rawMaterialId: material.id } });
    expect(history).toHaveLength(1);
    expect(history[0].quantityUsed).toBe(12);
    expect(history[0].source).toBe('manual');
  });

  it('adjustStock: false esetén csak naplóz — ez kell a történeti importhoz', async () => {
    const material = await makeMaterial({ currentStock: 50 });

    await applyUsage(new Map([[material.id, 12]]), { source: 'import', adjustStock: false });

    const after = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    expect(after.currentStock).toBe(50);
    expect(await prisma.usageHistory.count()).toBe(1);
  });

  it('negatív mennyiséggel visszateszi a készletet (sztornó)', async () => {
    const material = await makeMaterial({ currentStock: 50 });

    await applyUsage(new Map([[material.id, -5]]), { source: 'shopify_order' });

    const after = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    expect(after.currentStock).toBe(55);
  });
});

describe('recalculate', () => {
  it('a 60 napos ablak fogyásából számol átlagot és rendelési pontot', async () => {
    const material = await makeMaterial({ leadTimeDays: 10, safetyBuffer: 5 });

    // 120 egység az ablakon belül → 2/nap → rendelési pont 2*10+5 = 25
    await prisma.usageHistory.createMany({
      data: [
        { rawMaterialId: material.id, date: toDateOnly(daysAgo(10)), quantityUsed: 60, source: 'import' },
        { rawMaterialId: material.id, date: toDateOnly(daysAgo(30)), quantityUsed: 60, source: 'import' },
      ],
    });

    await recalculate();

    const after = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    expect(after.avgDailyUsage).toBe(2);
    expect(after.reorderPoint).toBe(25);
  });

  it('az ablakon kívüli régi fogyást nem számolja bele', async () => {
    const material = await makeMaterial();

    await prisma.usageHistory.create({
      data: { rawMaterialId: material.id, date: toDateOnly(daysAgo(200)), quantityUsed: 600, source: 'import' },
    });

    await recalculate();

    const after = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    expect(after.avgDailyUsage).toBe(0);
  });
});

describe('getInventoryOverview', () => {
  it('a rendelési pont alatti készletet jelöli és mennyiséget javasol', async () => {
    const material = await makeMaterial({ currentStock: 20, leadTimeDays: 10, safetyBuffer: 5 });
    await prisma.usageHistory.create({
      data: { rawMaterialId: material.id, date: toDateOnly(daysAgo(5)), quantityUsed: 120, source: 'import' },
    });
    await recalculate();

    const [row] = await getInventoryOverview();

    expect(row.status).toBe('reorder');
    // cél: 2/nap * (10 + 14 nap) + 5 puffer = 53, készlet 20 → 33
    expect(row.suggestedOrder).toBe(33);
  });
});

describe('setStockLevel', () => {
  it('leltárnál a különbözetet naplózza', async () => {
    const material = await makeMaterial({ currentStock: 50 });

    await setStockLevel(material.id, 42, 'leltár');

    const after = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    expect(after.currentStock).toBe(42);

    const [entry] = await prisma.usageHistory.findMany({ where: { rawMaterialId: material.id } });
    expect(entry.quantityUsed).toBe(8);
    expect(entry.source).toBe('stocktake');
  });

  it('felfelé korrekciónál negatív fogyást ír', async () => {
    const material = await makeMaterial({ currentStock: 50 });

    await setStockLevel(material.id, 60);

    const [entry] = await prisma.usageHistory.findMany({ where: { rawMaterialId: material.id } });
    expect(entry.quantityUsed).toBe(-10);
  });
});

describe('recordStockReceipts', () => {
  it('növeli a készletet és naplózza a beszerzést', async () => {
    const material = await makeMaterial({ currentStock: 50 });

    const count = await recordStockReceipts([{ rawMaterialId: material.id, quantity: 30 }], {
      note: 'teszt rendelés',
    });

    expect(count).toBe(1);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } })).currentStock).toBe(80);

    const [receipt] = await prisma.stockReceipt.findMany({ where: { rawMaterialId: material.id } });
    expect(receipt.quantity).toBe(30);
    expect(receipt.note).toBe('teszt rendelés');
  });

  it('NEM ír a fogyásnaplóba, így az átlagfogyás változatlan marad', async () => {
    // Ez a lényeg: ha a beszerzés negatív fogyásként kerülne be, lehúzná az
    // átlagot, és a rendszer épp akkor rendelne kevesebbet, amikor kellene.
    const material = await makeMaterial({ currentStock: 10, leadTimeDays: 10, safetyBuffer: 0 });
    await prisma.usageHistory.create({
      data: { rawMaterialId: material.id, date: toDateOnly(daysAgo(5)), quantityUsed: 120, source: 'import' },
    });
    await recalculate([material.id]);
    const before = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });

    await recordStockReceipts([{ rawMaterialId: material.id, quantity: 500 }]);
    await recalculate([material.id]);
    const after = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });

    expect(await prisma.usageHistory.count({ where: { rawMaterialId: material.id } })).toBe(1);
    expect(after.avgDailyUsage).toBe(before.avgDailyUsage);
    expect(after.reorderPoint).toBe(before.reorderPoint);
    expect(after.currentStock).toBe(510);
  });

  it('a nulla és negatív sorokat kihagyja', async () => {
    const material = await makeMaterial({ currentStock: 50 });

    const count = await recordStockReceipts([
      { rawMaterialId: material.id, quantity: 0 },
      { rawMaterialId: material.id, quantity: -5 },
    ]);

    expect(count).toBe(0);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } })).currentStock).toBe(50);
    expect(await prisma.stockReceipt.count()).toBe(0);
  });

  it('több alapanyagot egy tranzakcióban könyvel', async () => {
    const a = await makeMaterial({ name: 'A', currentStock: 10 });
    const b = await makeMaterial({ name: 'B', currentStock: 20 });

    const count = await recordStockReceipts([
      { rawMaterialId: a.id, quantity: 5 },
      { rawMaterialId: b.id, quantity: 7 },
    ]);

    expect(count).toBe(2);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: a.id } })).currentStock).toBe(15);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: b.id } })).currentStock).toBe(27);
  });
});

describe('applyShopifyOrder', () => {
  it('recept szerint bontja a rendelést és jelzi a recept nélküli terméket', async () => {
    const yarn = await makeMaterial({ name: 'Fonal', currentStock: 100 });
    const eyes = await makeMaterial({ name: 'Szem', currentStock: 40, unit: 'pár' });

    await prisma.product.create({
      data: {
        name: 'Bagoly',
        shopifyProductId: '111',
        recipeItems: {
          create: [
            { rawMaterialId: yarn.id, quantityPerUnit: 1.5 },
            { rawMaterialId: eyes.id, quantityPerUnit: 1 },
          ],
        },
      },
    });

    const result = await applyShopifyOrder(
      [
        { shopifyProductId: '111', quantity: 2 },
        { shopifyProductId: '999', quantity: 1 },
      ],
      { reference: '#1001' },
    );

    expect(result.unmatchedProductIds).toEqual(['999']);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: yarn.id } })).currentStock).toBe(97);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: eyes.id } })).currentStock).toBe(38);
  });
});

describe('runDailyAlert', () => {
  async function seedLowStock() {
    const material = await makeMaterial({ currentStock: 10, leadTimeDays: 10, safetyBuffer: 5 });
    await prisma.usageHistory.create({
      data: { rawMaterialId: material.id, date: toDateOnly(daysAgo(5)), quantityUsed: 120, source: 'import' },
    });
    return material;
  }

  it('küld, ha van rendelési pont alatti alapanyag', async () => {
    await seedLowStock();

    const result = await runDailyAlert();

    expect(result.sent).toBe(true);
    expect(sentEmails).toHaveLength(1);
    expect(await prisma.reorderLog.count()).toBe(1);
  });

  it('másodszorra hallgat, ha a készlet nem csökkent tovább', async () => {
    await seedLowStock();
    await runDailyAlert();

    const second = await runDailyAlert();

    expect(second.sent).toBe(false);
    expect(sentEmails).toHaveLength(1);
  });

  it('újra szól, ha közben tovább csökkent a készlet', async () => {
    const material = await seedLowStock();
    await runDailyAlert();

    await prisma.rawMaterial.update({ where: { id: material.id }, data: { currentStock: 4 } });
    const second = await runDailyAlert();

    expect(second.sent).toBe(true);
    expect(sentEmails).toHaveLength(2);
  });

  it('nem küld, ha mindenből van elég', async () => {
    await makeMaterial({ currentStock: 1000 });

    const result = await runDailyAlert();

    expect(result.sent).toBe(false);
    expect(sentEmails).toHaveLength(0);
  });
});

describe('Shopify webhook endpoint', () => {
  async function seedProduct() {
    const yarn = await makeMaterial({ name: 'Fonal', currentStock: 100 });
    await prisma.product.create({
      data: {
        name: 'Bagoly',
        shopifyProductId: '111',
        recipeItems: { create: [{ rawMaterialId: yarn.id, quantityPerUnit: 2 }] },
      },
    });
    return yarn;
  }

  function makeRequest(payload: unknown, opts: { secret?: string; topic?: string } = {}) {
    const body = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', opts.secret ?? WEBHOOK_SECRET)
      .update(body, 'utf8')
      .digest('base64');

    return new Request('http://localhost/api/webhooks/shopify/orders', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': signature,
        'x-shopify-topic': opts.topic ?? 'orders/create',
      },
    });
  }

  const order = {
    id: 5001,
    name: '#1001',
    created_at: '2026-07-20T10:00:00Z',
    line_items: [{ product_id: 111, quantity: 3 }],
  };

  it('elutasítja a hibás aláírást, és nem nyúl a készlethez', async () => {
    const yarn = await seedProduct();
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/shopify/orders/route');

    const response = await POST(makeRequest(order, { secret: 'rossz-titok' }));

    expect(response.status).toBe(401);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: yarn.id } })).currentStock).toBe(100);
  });

  it('levonja a készletet a recept szerint', async () => {
    const yarn = await seedProduct();
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/shopify/orders/route');

    const response = await POST(makeRequest(order));

    expect(response.status).toBe(200);
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: yarn.id } })).currentStock).toBe(94);
  });

  it('az újraküldött webhook nem von le kétszer', async () => {
    const yarn = await seedProduct();
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/shopify/orders/route');

    await POST(makeRequest(order));
    const second = await POST(makeRequest(order));

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: yarn.id } })).currentStock).toBe(94);
  });

  it('sztornónál visszateszi a készletet', async () => {
    const yarn = await seedProduct();
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/shopify/orders/route');

    await POST(makeRequest(order));
    await POST(makeRequest(order, { topic: 'orders/cancelled' }));

    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: yarn.id } })).currentStock).toBe(100);
  });

  it('nem tesz vissza készletet olyan rendelésre, amit sosem vontunk le', async () => {
    const yarn = await seedProduct();
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/shopify/orders/route');

    await POST(makeRequest(order, { topic: 'orders/cancelled' }));

    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: yarn.id } })).currentStock).toBe(100);
  });

  it('a teszt-rendelést kihagyja', async () => {
    const yarn = await seedProduct();
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/shopify/orders/route');

    await POST(makeRequest({ ...order, test: true }));

    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: yarn.id } })).currentStock).toBe(100);
  });
});
