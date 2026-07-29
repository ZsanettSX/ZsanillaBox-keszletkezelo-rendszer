'use server';

import { revalidatePath } from 'next/cache';
import { runDailyAlert } from '@/lib/alerts';
import { saveSettings } from '@/lib/settings';
import { FormError, int, runAction, type ActionResult } from '@/lib/form';

export async function saveSettingsAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const usageWindowDays = int(fd, 'usageWindowDays', 60, 'Fogyás-ablak');
    if (usageWindowDays < 7) {
      throw new FormError('A fogyás-ablak legalább 7 nap legyen, különben túl zajos az átlag.');
    }

    await saveSettings({
      reserveDays: int(fd, 'reserveDays', 14, 'Tartaléknapok'),
      usageWindowDays,
      alertCooldownDays: int(fd, 'alertCooldownDays', 4, 'Riasztás-szünet'),
    });

    revalidatePath('/', 'layout');
    return 'Beállítások mentve. A rendelési pontok a következő újraszámolásnál frissülnek.';
  });
}

/** Próbafutás: kiszámol mindent, de nem küld emailt és nem naplóz. */
export async function testAlertAction(): Promise<ActionResult> {
  return runAction(async () => {
    const result = await runDailyAlert({ dryRun: true });

    if (result.candidates === 0) {
      return 'Próbafutás kész: jelenleg egyetlen alapanyagból sem kell rendelni, így nem menne ki email.';
    }
    if (result.triggeredBy.length === 0) {
      return `Próbafutás kész: ${result.candidates} alapanyag van a rendelési pont alatt, de mindegyikről ment már riasztás — most nem menne ki email.`;
    }
    return `Próbafutás kész: ${result.candidates} alapanyagról menne email. Kiváltotta: ${result.triggeredBy.join(', ')}.`;
  });
}
