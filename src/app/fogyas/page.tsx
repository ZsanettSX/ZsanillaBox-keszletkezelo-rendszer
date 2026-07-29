import Link from 'next/link';
import { Suspense } from 'react';
import { UsageFilters } from './filters';
import { DEFAULT_RANGE, RANGES } from './ranges';
import { UsageChart } from './usage-chart';
import { SetupNeeded } from '@/components/setup-needed';
import { prisma } from '@/lib/db';
import { formatDate, formatDays, formatQty, formatQtyWithUnit } from '@/lib/format';
import { toDateOnly } from '@/lib/inventory';
import { daysOfStockLeft } from '@/lib/reorder';
import { bucketFor, buildUsageSeries } from '@/lib/usage-series';

export const dynamic = 'force-dynamic';

const BUCKET_LABELS = { day: 'napi', week: 'heti', month: 'havi' } as const;

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ materialId?: string; range?: string }>;
}) {
  const params = await searchParams;

  let materials;
  try {
    materials = await prisma.rawMaterial.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, unit: true, currentStock: true, avgDailyUsage: true },
    });
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  if (materials.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-base font-semibold text-slate-900">Még nincs mit ábrázolni</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          A fogyás-történet akkor jelenik meg, ha már vannak alapanyagok és rögzített mozgások.
        </p>
        <Link href="/alapanyagok/uj" className="btn-primary mt-4">
          Alapanyag felvitele
        </Link>
      </div>
    );
  }

  const selected = materials.find((m) => m.id === params.materialId) ?? materials[0];
  const rangeDays = RANGES.some((r) => r.value === params.range)
    ? Number(params.range)
    : DEFAULT_RANGE;

  const end = toDateOnly();
  const start = new Date(end.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000);
  const bucket = bucketFor(rangeDays);

  const records = await prisma.usageHistory.findMany({
    where: { rawMaterialId: selected.id, date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    select: { date: true, quantityUsed: true },
  });

  const series = buildUsageSeries(records, start, end, bucket);
  const totalUsed = records.reduce((sum, r) => sum + r.quantityUsed, 0);
  const dailyAverage = totalUsed / rangeDays;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Fogyás-történet</h1>
        <p className="text-sm text-slate-500">
          Alapanyagonként, {BUCKET_LABELS[bucket]} bontásban. A mértékegységek eltérnek, ezért
          egyszerre egy alapanyag látszik.
        </p>
      </div>

      <div className="card p-4">
        <Suspense fallback={<div className="h-16" />}>
          <UsageFilters
            materials={materials}
            materialId={selected.id}
            range={String(rangeDays)}
          />
        </Suspense>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Időszaki fogyás"
          value={formatQtyWithUnit(totalUsed, selected.unit)}
        />
        <Metric
          label="Napi átlag az időszakban"
          value={formatQtyWithUnit(Math.round(dailyAverage * 100) / 100, selected.unit)}
        />
        <Metric label="Jelenlegi készlet" value={formatQtyWithUnit(selected.currentStock, selected.unit)} />
        <Metric
          label="Kitart még"
          value={formatDays(daysOfStockLeft(selected.currentStock, selected.avgDailyUsage))}
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-base font-semibold text-slate-900">{selected.name}</h2>
        <p className="mb-4 text-sm text-slate-500">
          {BUCKET_LABELS[bucket].charAt(0).toUpperCase() + BUCKET_LABELS[bucket].slice(1)} felhasználás
          ({selected.unit}) — {formatDate(start)} – {formatDate(end)}
        </p>
        <UsageChart data={series} unit={selected.unit} />
      </div>

      <details className="card p-5">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Táblázatos nézet
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead>
              <tr>
                <th className="th">Időszak</th>
                <th className="th text-right">Fogyás ({selected.unit})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {series.map((point) => (
                <tr key={point.key}>
                  <td className="td">{point.label}</td>
                  <td className="td text-right tabular-nums">{formatQty(point.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
