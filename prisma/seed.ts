/**
 * Mintaadat a rendszer kipróbálásához.
 *
 * Használat:
 *   npm run db:seed            → csak üres adatbázisra fut
 *   npm run db:seed -- --force → törli a meglévő adatot és újratölti
 *
 * FIGYELEM: ez kitalált mintaadat. Az éles indulásnál töröld (--force nélkül
 * üres adatbázison kezdj), és vidd fel a valós alapanyagokat és receptúrákat.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { recalculate, toDateOnly } from '../src/lib/inventory';

const force = process.argv.includes('--force');

/** Determinisztikus álvéletlen, hogy a minta minden futásnál ugyanaz legyen. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const MATERIALS = [
  { name: 'Himalaya Dolphin Baby fonal – világoskék', unit: 'gombolyag', currentStock: 12, supplierName: 'Fonalnagyker', leadTimeDays: 10, safetyBuffer: 3, orderMultiple: 5 },
  { name: 'Himalaya Dolphin Baby fonal – rózsaszín', unit: 'gombolyag', currentStock: 8, supplierName: 'Fonalnagyker', leadTimeDays: 10, safetyBuffer: 3, orderMultiple: 5 },
  { name: 'Himalaya Dolphin Baby fonal – fehér', unit: 'gombolyag', currentStock: 25, supplierName: 'Fonalnagyker', leadTimeDays: 10, safetyBuffer: 3, orderMultiple: 5 },
  { name: 'Biztonsági szem 12 mm', unit: 'pár', currentStock: 40, supplierName: 'Kellékbolt', leadTimeDays: 21, safetyBuffer: 20, orderMultiple: 25 },
  { name: 'Tömőanyag', unit: 'gramm', currentStock: 2400, supplierName: 'Kellékbolt', leadTimeDays: 21, safetyBuffer: 500, orderMultiple: 500 },
  { name: 'Horgolótű 4 mm', unit: 'db', currentStock: 30, supplierName: 'Kellékbolt', leadTimeDays: 21, safetyBuffer: 10, orderMultiple: 10 },
  { name: 'Ajándékdoboz', unit: 'db', currentStock: 55, supplierName: 'Csomagoló Kft.', leadTimeDays: 7, safetyBuffer: 20, orderMultiple: 50 },
  { name: 'Leírás-füzet', unit: 'db', currentStock: 70, supplierName: 'Nyomda', leadTimeDays: 14, safetyBuffer: 25, orderMultiple: 50 },
];

const PRODUCTS = [
  {
    name: 'Bagoly ZsanillaBox',
    sku: 'ZB-BAGOLY',
    shopifyProductId: '9000000000001',
    dailyRate: 0.9,
    recipe: [
      ['Himalaya Dolphin Baby fonal – világoskék', 1],
      ['Himalaya Dolphin Baby fonal – fehér', 0.5],
      ['Biztonsági szem 12 mm', 1],
      ['Tömőanyag', 40],
      ['Horgolótű 4 mm', 1],
      ['Ajándékdoboz', 1],
      ['Leírás-füzet', 1],
    ] as const,
  },
  {
    name: 'Maci ZsanillaBox',
    sku: 'ZB-MACI',
    shopifyProductId: '9000000000002',
    dailyRate: 0.6,
    recipe: [
      ['Himalaya Dolphin Baby fonal – rózsaszín', 1.5],
      ['Biztonsági szem 12 mm', 1],
      ['Tömőanyag', 55],
      ['Horgolótű 4 mm', 1],
      ['Ajándékdoboz', 1],
      ['Leírás-füzet', 1],
    ] as const,
  },
  {
    name: 'Nyuszi ZsanillaBox',
    sku: 'ZB-NYUSZI',
    shopifyProductId: '9000000000003',
    dailyRate: 0.4,
    recipe: [
      ['Himalaya Dolphin Baby fonal – fehér', 1.2],
      ['Biztonsági szem 12 mm', 1],
      ['Tömőanyag', 45],
      ['Horgolótű 4 mm', 1],
      ['Ajándékdoboz', 1],
      ['Leírás-füzet', 1],
    ] as const,
  },
];

const HISTORY_DAYS = 90;

async function main() {
  const existing = await prisma.rawMaterial.count();
  if (existing > 0 && !force) {
    console.log(
      `\nMár van ${existing} alapanyag az adatbázisban — a seed nem futott le.\n` +
        'Ha tényleg felül akarod írni: npm run db:seed -- --force\n',
    );
    return;
  }

  if (force) {
    // A sorrend számít: a gyerek rekordok előbb.
    await prisma.usageHistory.deleteMany();
    await prisma.reorderLog.deleteMany();
    await prisma.recipeItem.deleteMany();
    await prisma.processedOrder.deleteMany();
    await prisma.product.deleteMany();
    await prisma.rawMaterial.deleteMany();
    console.log('Meglévő adatok törölve.');
  }

  const materialIds = new Map<string, string>();
  for (const material of MATERIALS) {
    const created = await prisma.rawMaterial.create({ data: material });
    materialIds.set(material.name, created.id);
  }
  console.log(`✓ ${MATERIALS.length} alapanyag létrehozva.`);

  const productRecipes: Array<{ dailyRate: number; items: Array<{ rawMaterialId: string; quantityPerUnit: number }> }> = [];

  for (const product of PRODUCTS) {
    const items = product.recipe.map(([materialName, quantity]) => ({
      rawMaterialId: materialIds.get(materialName)!,
      quantityPerUnit: quantity,
    }));

    await prisma.product.create({
      data: {
        name: product.name,
        sku: product.sku,
        shopifyProductId: product.shopifyProductId,
        recipeItems: { create: items },
      },
    });

    productRecipes.push({ dailyRate: product.dailyRate, items });
  }
  console.log(`✓ ${PRODUCTS.length} termék létrehozva recepttel.`);

  // ── Fogyástörténet: 90 nap, hétvégén erősebb forgalommal ────────────────────
  const random = makeRandom(20260729);
  const records: Array<{ rawMaterialId: string; date: Date; quantityUsed: number; source: string; reference: string }> = [];
  const today = toDateOnly();

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    const date = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const weekendBoost = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1.6 : 1;

    for (const product of productRecipes) {
      const expected = product.dailyRate * weekendBoost;
      // Egész darabszám: a törtrészt valószínűségként kezeljük.
      const sold = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
      if (sold === 0) continue;

      for (const item of product.items) {
        records.push({
          rawMaterialId: item.rawMaterialId,
          date,
          quantityUsed: item.quantityPerUnit * sold,
          source: 'import',
          reference: 'Mintaadat',
        });
      }
    }
  }

  await prisma.usageHistory.createMany({ data: records });
  console.log(`✓ ${records.length} fogyás-sor létrehozva (${HISTORY_DAYS} nap).`);

  const count = await recalculate();
  console.log(`✓ Újraszámolva ${count} alapanyag.\n`);
  console.log('Indítsd el a felületet: npm run dev\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
