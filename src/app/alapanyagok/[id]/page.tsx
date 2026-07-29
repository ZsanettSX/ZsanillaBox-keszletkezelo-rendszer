import Link from 'next/link';
import { notFound } from 'next/navigation';
import { deleteMaterialAction, setStockAction, updateMaterialAction } from '../actions';
import { MaterialForm } from '../material-form';
import { DeleteForm, StockForm } from './client-forms';
import { SetupNeeded } from '@/components/setup-needed';
import { StatusBadge } from '@/components/status-badge';
import { prisma } from '@/lib/db';
import { formatDate, formatDays, formatQty, formatQtyWithUnit } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { calcSuggestedOrder, daysOfStockLeft, stockStatus } from '@/lib/reorder';

export const dynamic = 'force-dynamic';

const SOURCE_LABELS: Record<string, string> = {
  shopify_order: 'Shopify rendelés',
  import: 'Import',
  manual: 'Kézi',
  stocktake: 'Leltár',
};

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let material;
  let history;
  let settings;
  try {
    [material, history, settings] = await Promise.all([
      prisma.rawMaterial.findUnique({ where: { id } }),
      prisma.usageHistory.findMany({
        where: { rawMaterialId: id },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      getSettings(),
    ]);
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  if (!material) notFound();

  const reserveDays = material.reserveDays ?? settings.reserveDays;
  const suggested = calcSuggestedOrder({
    avgDailyUsage: material.avgDailyUsage,
    leadTimeDays: material.leadTimeDays,
    reserveDays,
    currentStock: material.currentStock,
    safetyBuffer: material.safetyBuffer,
    orderMultiple: material.orderMultiple,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/alapanyagok" className="text-sm text-slate-500 hover:text-slate-800">
          ← Vissza az alapanyagokhoz
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{material.name}</h1>
          <StatusBadge status={stockStatus(material.currentStock, material.reorderPoint)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Jelenlegi készlet" value={formatQtyWithUnit(material.currentStock, material.unit)} />
        <Metric label="Napi átlagfogyás" value={formatQtyWithUnit(material.avgDailyUsage, material.unit)} />
        <Metric label="Rendelési pont" value={formatQty(material.reorderPoint)} />
        <Metric
          label="Kitart még"
          value={formatDays(daysOfStockLeft(material.currentStock, material.avgDailyUsage))}
        />
      </div>

      {suggested > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm text-rose-900">
            <span className="font-semibold">Javasolt rendelés: </span>
            {formatQtyWithUnit(suggested, material.unit)}
            {material.supplierName ? ` — ${material.supplierName}` : ''}
          </p>
          <p className="mt-1 text-xs text-rose-700">
            {material.leadTimeDays} nap átfutás + {reserveDays} nap tartalék fogyását fedezi.
          </p>
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Leltár / készletkorrekció</h2>
        <StockForm
          action={setStockAction}
          id={material.id}
          currentStock={material.currentStock}
          unit={material.unit}
        />
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Adatok szerkesztése</h2>
        <MaterialForm
          action={updateMaterialAction}
          values={{
            id: material.id,
            name: material.name,
            unit: material.unit,
            currentStock: material.currentStock,
            supplierName: material.supplierName,
            supplierUrl: material.supplierUrl,
            leadTimeDays: material.leadTimeDays,
            safetyBuffer: material.safetyBuffer,
            reserveDays: material.reserveDays,
            orderMultiple: material.orderMultiple,
            notes: material.notes,
            active: material.active,
          }}
          submitLabel="Módosítások mentése"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Utolsó mozgások</h2>
          <p className="text-sm text-slate-500">
            Pozitív = felhasználás, negatív = visszavételezés vagy felfelé korrekció.
          </p>
        </div>
        {history.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">Még nincs rögzített mozgás.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Dátum</th>
                  <th className="th text-right">Mennyiség</th>
                  <th className="th">Forrás</th>
                  <th className="th">Hivatkozás</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="td">{formatDate(h.date)}</td>
                    <td
                      className={`td text-right tabular-nums ${h.quantityUsed < 0 ? 'text-emerald-700' : 'text-slate-900'}`}
                    >
                      {formatQtyWithUnit(h.quantityUsed, material.unit)}
                    </td>
                    <td className="td text-slate-600">{SOURCE_LABELS[h.source] ?? h.source}</td>
                    <td className="td text-slate-500">{h.reference ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card border-red-100 p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Veszélyzóna</h2>
        <p className="mb-3 text-sm text-slate-500">
          A fogyástörténettel rendelkező alapanyagot nem töröljük, csak inaktiváljuk.
        </p>
        <DeleteForm action={deleteMaterialAction} id={material.id} name={material.name} />
      </div>
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
