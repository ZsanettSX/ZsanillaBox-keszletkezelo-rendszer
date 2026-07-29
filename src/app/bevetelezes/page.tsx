import Link from 'next/link';
import { saveReceiptsAction } from './actions';
import { ReceiptForm, type ReceiptGroup, type ReceiptRow } from './receipt-form';
import { SetupNeeded } from '@/components/setup-needed';
import { prisma } from '@/lib/db';
import { formatDate, toInputDate } from '@/lib/format';
import { getInventoryOverview } from '@/lib/inventory';

export const dynamic = 'force-dynamic';

export default async function ReceiptPage() {
  let rows;
  let lastReceipts;
  try {
    [rows, lastReceipts] = await Promise.all([
      getInventoryOverview(),
      prisma.stockReceipt.groupBy({ by: ['rawMaterialId'], _max: { date: true } }),
    ]);
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-base font-semibold text-slate-900">Még nincs alapanyag</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Bevételezni csak meglévő alapanyagra lehet.
        </p>
        <Link href="/alapanyagok/uj" className="btn-primary mt-4">
          Alapanyag felvitele
        </Link>
      </div>
    );
  }

  const lastByMaterial = new Map(
    lastReceipts.map((r) => [r.rawMaterialId, r._max.date ? formatDate(r._max.date) : null]),
  );

  // Beszállítónként csoportosítunk: egy szállítmány jellemzően egy beszállítótól jön.
  const bySupplier = new Map<string, ReceiptRow[]>();
  for (const row of rows) {
    const key = row.supplierName ?? '';
    const item: ReceiptRow = {
      id: row.id,
      name: row.name,
      unit: row.unit,
      currentStock: row.currentStock,
      suggestedOrder: row.suggestedOrder,
      status: row.status,
      lastReceipt: lastByMaterial.get(row.id) ?? null,
    };
    const list = bySupplier.get(key);
    if (list) list.push(item);
    else bySupplier.set(key, [item]);
  }

  const groups: ReceiptGroup[] = [...bySupplier.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'hu'))
    .map(([supplier, items]) => ({ supplier, items }));

  const toOrder = rows.filter((r) => r.status === 'critical' || r.status === 'reorder').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Bevételezés</h1>
        <p className="text-sm text-slate-500">
          Írd a sorok mellé, mennyit vettél az adott alapanyagból, add meg a beérkezés dátumát, és
          mentsd el egyben. A rendszer ennyivel megnöveli a készletet.
        </p>
      </div>

      {toOrder > 0 && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {toOrder} alapanyag van a rendelési pont alatt. A <strong>Javasolt</strong> oszlopban lévő
          számra kattintva beírhatod a javasolt mennyiséget.
        </p>
      )}

      <ReceiptForm
        action={saveReceiptsAction}
        groups={groups}
        defaultDate={toInputDate(new Date())}
      />

      <div className="space-y-1 text-xs text-slate-500">
        <p>
          A bevételezés nem számít fogyásnak, ezért nem befolyásolja az átlagfogyást és a rendelési
          pontot.
        </p>
        <p>
          <strong>Elgépelted egy korábbi bevételezést?</strong> Írj be ide negatív számot ugyanarra
          az alapanyagra — így a készlet visszaáll anélkül, hogy nem létező fogyás keletkezne.
        </p>
        <p>
          Ha nem beszerzés miatt tér el a készlet (elveszett vagy elrontott darab, leltárkülönbözet),
          azt az alapanyag oldalán a <em>Leltár</em> dobozzal javítsd.
        </p>
      </div>
    </div>
  );
}
