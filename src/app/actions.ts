'use server';

import { revalidatePath } from 'next/cache';
import { recalculate } from '@/lib/inventory';

/** "Újraszámolás" gomb a dashboardon — frissíti az átlagfogyást és a rendelési pontokat. */
export async function recalculateAllAction(): Promise<void> {
  await recalculate();
  revalidatePath('/', 'layout');
}
