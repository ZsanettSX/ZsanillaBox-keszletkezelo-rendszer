/**
 * Shopify történeti rendelés-export importálása a fogyásnaplóba.
 *
 * Használat:
 *   npm run import:shopify -- ./imports/orders_export.csv
 *   npm run import:shopify -- ./imports/orders_export.csv --dry-run
 *   npm run import:shopify -- ./imports/orders_export.csv --replace
 *
 * Alapértelmezésben NEM nyúl a jelenlegi készlethez: a múltbeli rendeléseket a
 * mai, kézzel felvitt készletből nem szabad még egyszer levonni. Csak akkor
 * használd az --apply-stock kapcsolót, ha a felvitt készlet a történeti időszak
 * ELEJI állapotot tükrözi.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { prisma } from '../src/lib/db';
import { recalculate, toDateOnly } from '../src/lib/inventory';
import { explodeBom, roundQty } from '../src/lib/reorder';
import { parseShopifyOrderCsv, titleVariants, type CsvRow } from '../src/lib/shopify-csv';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const replace = args.includes('--replace');
const applyStock = args.includes('--apply-stock');

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function main() {
  if (!filePath) {
    fail('Add meg a CSV fájl elérési útját. Például:\n  npm run import:shopify -- ./imports/orders_export.csv');
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    fail(`Nem találom a fájlt: ${filePath}`);
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as CsvRow[];

  console.log(`\nBeolvasva: ${rows.length} sor a(z) ${filePath} fájlból.`);

  const { lines, cancelledOrders, ordersWithoutDate } = parseShopifyOrderCsv(rows);
  console.log(`Feldolgozható tétel: ${lines.length}`);
  if (cancelledOrders.length) console.log(`Kihagyott sztornó rendelés: ${cancelledOrders.length}`);
  if (ordersWithoutDate.length) {
    console.log(`⚠ Dátum nélküli (ezért kihagyott) rendelés: ${ordersWithoutDate.length}`);
  }
  if (lines.length === 0) fail('Nincs importálható tétel.');

  // ── Termékek párosítása ────────────────────────────────────────────────────
  const products = await prisma.product.findMany({ include: { recipeItems: true } });
  if (products.length === 0) {
    fail(
      'Nincs egyetlen termék sem az adatbázisban.\n' +
        '  A spec szerinti sorrend: előbb az alapanyagok és a receptek, utána az import.',
    );
  }

  const bySku = new Map<string, (typeof products)[number]>();
  const byName = new Map<string, (typeof products)[number]>();
  for (const product of products) {
    if (product.sku) bySku.set(product.sku.toLowerCase(), product);
    byName.set(product.name.toLowerCase(), product);
  }

  const recipeRows = products.flatMap((p) =>
    p.recipeItems.map((r) => ({
      productId: p.id,
      rawMaterialId: r.rawMaterialId,
      quantityPerUnit: r.quantityPerUnit,
    })),
  );

  const unmatched = new Map<string, number>();
  const noRecipe = new Map<string, number>();
  /** kulcs: "YYYY-MM-DD|rawMaterialId" → mennyiség */
  const aggregated = new Map<string, number>();
  let matchedLines = 0;

  for (const line of lines) {
    let product = line.sku ? bySku.get(line.sku.toLowerCase()) : undefined;
    if (!product && line.title) {
      for (const variant of titleVariants(line.title)) {
        product = byName.get(variant.toLowerCase());
        if (product) break;
      }
    }

    const label = line.title ?? line.sku ?? '(ismeretlen)';
    if (!product) {
      unmatched.set(label, (unmatched.get(label) ?? 0) + line.quantity);
      continue;
    }
    if (product.recipeItems.length === 0) {
      noRecipe.set(product.name, (noRecipe.get(product.name) ?? 0) + line.quantity);
      continue;
    }

    matchedLines++;
    const usage = explodeBom([{ productId: product.id, quantity: line.quantity }], recipeRows);
    const dateKey = toDateOnly(line.date).toISOString().slice(0, 10);
    for (const [rawMaterialId, quantity] of usage) {
      const key = `${dateKey}|${rawMaterialId}`;
      aggregated.set(key, (aggregated.get(key) ?? 0) + quantity);
    }
  }

  console.log(`\nPárosított tétel: ${matchedLines} / ${lines.length}`);

  if (unmatched.size > 0) {
    console.log(`\n⚠ Nem találtam hozzájuk terméket (${unmatched.size} féle):`);
    for (const [name, qty] of [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`   • ${name} — ${qty} db`);
    }
    console.log('   Vedd fel ezeket a Termékek oldalon (a névnek vagy a SKU-nak egyeznie kell).');
  }

  if (noRecipe.size > 0) {
    console.log(`\n⚠ Megvan a termék, de nincs receptje (${noRecipe.size} féle):`);
    for (const [name, qty] of [...noRecipe.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   • ${name} — ${qty} db`);
    }
  }

  if (aggregated.size === 0) fail('Egyetlen tételt sem sikerült alapanyag-fogyásra bontani.');

  const records = [...aggregated.entries()].map(([key, quantity]) => {
    const [dateKey, rawMaterialId] = key.split('|');
    return {
      rawMaterialId,
      date: new Date(`${dateKey}T00:00:00.000Z`),
      quantityUsed: roundQty(quantity, 4),
      source: 'import',
      reference: 'Shopify történeti export',
    };
  });

  const dates = records.map((r) => r.date.getTime());
  console.log(
    `\nÍrandó fogyás-sorok: ${records.length} db, ` +
      `${new Date(Math.min(...dates)).toISOString().slice(0, 10)} – ` +
      `${new Date(Math.max(...dates)).toISOString().slice(0, 10)} között.`,
  );

  if (dryRun) {
    console.log('\n✓ Próbafutás (--dry-run): semmit nem írtam az adatbázisba.\n');
    return;
  }

  // Kétszeri import duplázná a fogyást, ezért ezt külön meg kell erősíteni.
  const existing = await prisma.usageHistory.count({ where: { source: 'import' } });
  if (existing > 0 && !replace) {
    fail(
      `Már van ${existing} korábban importált fogyás-sor.\n` +
        '  Ha újra akarod importálni, futtasd a --replace kapcsolóval (a régi import sorokat törli).\n' +
        '  A Shopify-webhookból és a kézi korrekciókból származó sorokhoz ez nem nyúl.',
    );
  }

  if (existing > 0 && replace) {
    const deleted = await prisma.usageHistory.deleteMany({ where: { source: 'import' } });
    console.log(`Törölve ${deleted.count} korábbi import sor.`);
  }

  await prisma.usageHistory.createMany({ data: records });
  console.log(`✓ Beírva ${records.length} fogyás-sor.`);

  if (applyStock) {
    const totals = new Map<string, number>();
    for (const record of records) {
      totals.set(record.rawMaterialId, (totals.get(record.rawMaterialId) ?? 0) + record.quantityUsed);
    }
    await prisma.$transaction(
      [...totals.entries()].map(([rawMaterialId, quantity]) =>
        prisma.rawMaterial.update({
          where: { id: rawMaterialId },
          data: { currentStock: { decrement: quantity } },
        }),
      ),
    );
    console.log(`✓ Készlet csökkentve ${totals.size} alapanyagnál (--apply-stock).`);
  } else {
    console.log('ℹ A jelenlegi készlethez nem nyúltam (ez az alapértelmezés).');
  }

  const count = await recalculate();
  console.log(`✓ Újraszámolva ${count} alapanyag átlagfogyása és rendelési pontja.\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
