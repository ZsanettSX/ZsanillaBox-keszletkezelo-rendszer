'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { formatQty } from '@/lib/format';
import { recordStockReceipts, type StockReceiptInput } from '@/lib/inventory';
import { FormError, optStr, runAction, type ActionResult } from '@/lib/form';

const QTY_PREFIX = 'qty_';

/** Ugyanaz a tolerancia, mint a többi űrlapon: a magyar tizedesvessző is jó. */
function parseQuantity(raw: string): number {
  return Number(raw.replace(/\s/g, '').replace(',', '.'));
}

function parseDate(raw: string | null): Date {
  if (!raw) return new Date();
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function saveReceiptsAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const receipts: StockReceiptInput[] = [];
    const invalidIds: string[] = [];
    const negativeIds: string[] = [];

    for (const [key, value] of fd.entries()) {
      if (!key.startsWith(QTY_PREFIX) || typeof value !== 'string') continue;
      const text = value.trim();
      if (!text) continue;

      const rawMaterialId = key.slice(QTY_PREFIX.length);
      const quantity = parseQuantity(text);

      if (!Number.isFinite(quantity)) invalidIds.push(rawMaterialId);
      else if (quantity < 0) negativeIds.push(rawMaterialId);
      else if (quantity > 0) receipts.push({ rawMaterialId, quantity });
    }

    // A hibás sorokat névvel jelezzük vissza, hogy ne kelljen keresgélni.
    if (invalidIds.length > 0 || negativeIds.length > 0) {
      const names = await nameLookup([...invalidIds, ...negativeIds]);
      if (invalidIds.length > 0) {
        throw new FormError(
          `Ezekbe a sorokba számot írj: ${invalidIds.map((id) => names.get(id) ?? id).join(', ')}.`,
        );
      }
      throw new FormError(
        `A bevételezés csak pozitív mennyiséget fogad: ${negativeIds.map((id) => names.get(id) ?? id).join(', ')}. ` +
          `Ha lefelé kell javítanod a készletet, használd az alapanyag oldalán a Leltár dobozt.`,
      );
    }

    if (receipts.length === 0) {
      throw new FormError('Egyetlen sorba sem írtál mennyiséget.');
    }

    const date = parseDate(typeof fd.get('date') === 'string' ? (fd.get('date') as string) : null);
    const note = optStr(fd, 'note');
    const count = await recordStockReceipts(receipts, { date, note: note ?? undefined });

    revalidatePath('/bevetelezes');
    revalidatePath('/alapanyagok');
    revalidatePath('/');

    const total = receipts.reduce((sum, r) => sum + r.quantity, 0);
    return `${count} alapanyag készlete nőtt, összesen ${formatQty(total)} egységgel.`;
  });
}

async function nameLookup(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.rawMaterial.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}
