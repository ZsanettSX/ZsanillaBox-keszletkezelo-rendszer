import Link from 'next/link';
import { SetupNeeded } from '@/components/setup-needed';
import { StatusBadge } from '@/components/status-badge';
import { prisma } from '@/lib/db';
import { formatQty, formatQtyWithUnit } from '@/lib/format';
import { stockStatus } from '@/lib/reorder';

export const dynamic = 'force-dynamic';

export default async function MaterialsPage() {
  let materials;
  try {
    materials = await prisma.rawMaterial.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Alapanyagok</h1>
          <p className="text-sm text-slate-500">
            {materials.length} alapanyag. A készletet a Shopify-rendelések automatikusan csökkentik.
          </p>
        </div>
        <Link href="/alapanyagok/uj" className="btn-primary">
          + Új alapanyag
        </Link>
      </div>

      {materials.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-600">
          Még nincs alapanyag. Kezdd azzal, hogy felviszed a fonalakat, biztonsági szemeket,
          tömőanyagot – mindent, amiből fogy.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Megnevezés</th>
                  <th className="th">Állapot</th>
                  <th className="th text-right">Készlet</th>
                  <th className="th text-right">Napi fogyás</th>
                  <th className="th text-right">Rendelési pont</th>
                  <th className="th">Beszállító</th>
                  <th className="th text-right">Átfutás</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((m) => (
                  <tr key={m.id} className={m.active ? 'hover:bg-slate-50' : 'bg-slate-50/60 opacity-60'}>
                    <td className="td font-medium text-slate-900">
                      <Link href={`/alapanyagok/${m.id}`} className="hover:text-rose-600">
                        {m.name}
                      </Link>
                      {!m.active && (
                        <span className="ml-2 text-xs font-normal text-slate-500">(inaktív)</span>
                      )}
                    </td>
                    <td className="td">
                      <StatusBadge status={stockStatus(m.currentStock, m.reorderPoint)} />
                    </td>
                    <td className="td text-right tabular-nums">
                      {formatQtyWithUnit(m.currentStock, m.unit)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-500">
                      {formatQty(m.avgDailyUsage)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-500">
                      {formatQty(m.reorderPoint)}
                    </td>
                    <td className="td text-slate-600">{m.supplierName ?? '–'}</td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {m.leadTimeDays} nap
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
