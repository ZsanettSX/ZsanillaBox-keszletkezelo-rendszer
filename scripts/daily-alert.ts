/**
 * A napi riasztó email futtatása kézzel.
 *
 * Használat:
 *   npm run alert:daily            → élesben küld
 *   npm run alert:daily -- --dry-run → csak megmutatja, mi menne ki
 */
import 'dotenv/config';
import { runDailyAlert } from '../src/lib/alerts';
import { prisma } from '../src/lib/db';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const result = await runDailyAlert({ dryRun });

  console.log('');
  console.log(`Rendelési pont alatti alapanyag: ${result.candidates}`);
  if (result.triggeredBy.length > 0) {
    console.log(`A küldést kiváltotta: ${result.triggeredBy.join(', ')}`);
  }
  console.log(result.sent ? '✓ Email elküldve.' : `Nem ment email — ${result.reason ?? 'ismeretlen ok'}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
