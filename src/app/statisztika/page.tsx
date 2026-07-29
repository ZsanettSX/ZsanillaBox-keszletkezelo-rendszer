import Link from 'next/link';
import { RangeFilter } from './range-filter';
import { SalesChart } from './sales-chart';
import { SetupNeeded } from '@/components/setup-needed';
import { formatDate, formatQty } from '@/lib/format';
import { toDateOnly } from '@/lib/inventory';
import { resolveRangeDays } from '@/lib/ranges';
import { getProductSalesStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const rangeDays = resolveRangeDays(params.range);

  const end = toDateOnly();
  const start = new Date(end.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000);

  let stats;
  try {
    stats = await getProductSalesStats(start, end);
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  const { rows, total } = stats;
  const best = rows.find((r) => r.quantity > 0);
  const dailyAverage = Math.round((total / rangeDays) * 100) / 100;
  const soldTypes = rows.filter((r) => r.quantity > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Statisztika</h1>
          <p className="text-sm text-slate-500">
            Melyik termékből mennyi fogyott — {formatDate(start)} és {formatDate(end)} között.
          </p>
        </div>
        <RangeFilter range={String(rangeDays)} />
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900">Még nincs termék</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            A statisztika a termékek eladásából épül fel.
          </p>
          <Link href="/termekek" className="btn-primary mt-4">
            Termékek
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Összes eladott darab" value={`${formatQty(total)} db`} />
            <Metric label="Napi átlag" value={`${formatQty(dailyAverage)} db`} />
            <Metric label="Eladott termékféle" value={`${soldTypes} / ${rows.length}`} />
            <Metric label="Legnépszerűbb" value={best ? best.shortName : '–'} />
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Eladás termékenként (darab)
            </h2>
            <SalesChart rows={rows} />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr>
                    <th className="th">Termék</th>
                    <th className="th text-right">Eladott darab</th>
                    <th className="th text-right">Részesedés</th>
                    <th className="th text-right">Napi átlag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.productId} className={row.quantity > 0 ? '' : 'text-slate-400'}>
                      <td className="td font-medium text-slate-900">
                        <Link href={`/termekek/${row.productId}`} className="hover:text-rose-600">
                          {row.name}
                        </Link>
                      </td>
                      <td className="td text-right font-semibold tabular-nums">
                        {formatQty(row.quantity)}
                      </td>
                      <td className="td text-right tabular-nums text-slate-500">
                        {row.quantity > 0 ? `${Math.round(row.share * 100)}%` : '–'}
                      </td>
                      <td className="td text-right tabular-nums text-slate-500">
                        {formatQty(Math.round((row.quantity / rangeDays) * 100) / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            A sztornózott rendelések negatív előjellel szerepelnek, tehát a számok a nettó eladást
            mutatják. Csak azok a termékek látszanak, amelyek fel vannak véve a rendszerbe.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-900" title={value}>
        {value}
      </div>
    </div>
  );
}
