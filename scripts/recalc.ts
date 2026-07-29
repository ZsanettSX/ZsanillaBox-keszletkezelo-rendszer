/**
 * Az átlagfogyás és a rendelési pont újraszámolása minden alapanyagra.
 * Használat: npm run recalc
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { getInventoryOverview, recalculate } from '../src/lib/inventory';
import { formatQty } from '../src/lib/format';

async function main() {
  const count = await recalculate();
  console.log(`✓ Újraszámolva: ${count} alapanyag.\n`);

  const rows = await getInventoryOverview();
  const toOrder = rows.filter((r) => r.status === 'critical' || r.status === 'reorder');

  if (toOrder.length === 0) {
    console.log('Egyetlen alapanyagból sem kell rendelni.\n');
    return;
  }

  console.log(`Rendelni kell (${toOrder.length}):`);
  for (const row of toOrder) {
    console.log(
      `  • ${row.name}: készlet ${formatQty(row.currentStock)} ${row.unit}, ` +
        `rendelési pont ${formatQty(row.reorderPoint)}, ` +
        `javasolt ${formatQty(row.suggestedOrder)} ${row.unit}`,
    );
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
