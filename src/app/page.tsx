import Link from 'next/link';
import { recalculateAllAction } from './actions';
import { SetupNeeded } from '@/components/setup-needed';
import { StatusBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import { getInventoryOverview, type DashboardRow } from '@/lib/inventory';
import { formatDays, formatQty, formatQtyWithUnit } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let rows: DashboardRow[];
  try {
    rows = await getInventoryOverview();
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  const toOrder = rows.filter((r) => r.status === 'critical' || r.status === 'reorder');
  const warning = rows.filter((r) => r.status === 'warning');
  const ok = rows.filter((r) => r.status === 'ok');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Áttekintés</h1>
          <p className="text-sm text-slate-500">
            Miből kell rendelni, és mennyit — a fogyás és az átfutási idő alapján.
          </p>
        </div>
        <form action={recalculateAllAction}>
          <SubmitButton className="btn-secondary" pendingLabel="Számolás…">
            Újraszámolás
          </SubmitButton>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Rendelni kell" value={toOrder.length} tone="red" />
            <StatTile label="Fogytán" value={warning.length} tone="amber" />
            <StatTile label="Rendben" value={ok.length} tone="emerald" />
            <StatTile label="Összes alapanyag" value={rows.length} tone="slate" />
          </div>

          <Section
            title="Most kell rendelni"
            description="Ezeknél a készlet elérte vagy átlépte a rendelési pontot."
            rows={toOrder}
            emptyText="Semmiből nem kell rendelni. 🎉"
            groupBySupplier
          />

          <Section
            title="Hamarosan fogytán"
            description="Még a rendelési pont felett vannak, de közelítenek hozzá."
            rows={warning}
            emptyText="Nincs figyelmeztetést igénylő alapanyag."
          />
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-8 text-center">
      <h2 className="text-base font-semibold text-slate-900">Még nincs egyetlen alapanyag sem</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Kezdd az alapanyagok felvitelével (fonalak, biztonsági szemek, tömőanyag, …), utána jöhetnek
        a termékek és a receptek.
      </p>
      <Link href="/alapanyagok" className="btn-primary mt-4">
        Alapanyag felvitele
      </Link>
    </div>
  );
}

const TONES = {
  red: 'text-red-700',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  slate: 'text-slate-900',
} as const;

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${TONES[tone]}`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  description,
  rows,
  emptyText,
  groupBySupplier = false,
}: {
  title: string;
  description: string;
  rows: DashboardRow[];
  emptyText: string;
  groupBySupplier?: boolean;
}) {
  const groups = groupBySupplier ? groupBy(rows) : [{ supplier: null, items: rows }];

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      {rows.length === 0 ? (
        <div className="card px-4 py-6 text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.supplier ?? '—'} className="card overflow-hidden">
              {group.supplier !== null && (
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                  {group.supplier || 'Nincs megadva beszállító'}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="th">Alapanyag</th>
                      <th className="th">Állapot</th>
                      <th className="th text-right">Készlet</th>
                      <th className="th text-right">Rendelési pont</th>
                      <th className="th text-right">Javasolt rendelés</th>
                      <th className="th text-right">Kitart</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.items.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="td font-medium text-slate-900">
                          <Link href={`/alapanyagok/${row.id}`} className="hover:text-rose-600">
                            {row.name}
                          </Link>
                        </td>
                        <td className="td">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="td text-right tabular-nums">
                          {formatQtyWithUnit(row.currentStock, row.unit)}
                        </td>
                        <td className="td text-right tabular-nums text-slate-500">
                          {formatQty(row.reorderPoint)}
                        </td>
                        <td className="td text-right font-semibold tabular-nums text-slate-900">
                          {row.suggestedOrder > 0
                            ? formatQtyWithUnit(row.suggestedOrder, row.unit)
                            : '–'}
                        </td>
                        <td className="td text-right tabular-nums text-slate-500">
                          {formatDays(row.daysLeft)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function groupBy(rows: DashboardRow[]): Array<{ supplier: string; items: DashboardRow[] }> {
  const map = new Map<string, DashboardRow[]>();
  for (const row of rows) {
    const key = row.supplierName ?? '';
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'hu'))
    .map(([supplier, items]) => ({ supplier, items }));
}
