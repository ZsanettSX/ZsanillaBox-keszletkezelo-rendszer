'use client';

import { useActionState, useEffect, useState } from 'react';
import { Feedback } from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import type { ActionResult } from '@/lib/form';
import { formatQty, formatQtyWithUnit } from '@/lib/format';
import type { StockStatus } from '@/lib/reorder';

export type ReceiptRow = {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  suggestedOrder: number;
  status: StockStatus;
  lastReceipt: string | null;
};

export type ReceiptGroup = { supplier: string; items: ReceiptRow[] };

export function ReceiptForm({
  action,
  groups,
  defaultDate,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  groups: ReceiptGroup[];
  defaultDate: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [values, setValues] = useState<Record<string, string>>({});

  // Sikeres mentés után ürítsük a mezőket, különben a következő bevételezésnél
  // véletlenül kétszer könyvelnénk ugyanazt.
  useEffect(() => {
    if (state?.ok) setValues({});
  }, [state]);

  const filled = Object.values(values).filter((v) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0;
  }).length;

  const setValue = (id: string, value: string) =>
    setValues((prev) => ({ ...prev, [id]: value }));

  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />

      {groups.map((group) => (
        <div key={group.supplier} className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
            {group.supplier || 'Nincs megadva beszállító'}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Alapanyag</th>
                  <th className="th text-right">Jelenlegi készlet</th>
                  <th className="th text-right">Javasolt</th>
                  <th className="th text-right">Utoljára vetted</th>
                  <th className="th text-right">Most vettem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="td">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      {(row.status === 'critical' || row.status === 'reorder') && (
                        <div className="mt-1">
                          <StatusBadge status={row.status} />
                        </div>
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {formatQtyWithUnit(row.currentStock, row.unit)}
                    </td>
                    <td className="td text-right tabular-nums">
                      {row.suggestedOrder > 0 ? (
                        <button
                          type="button"
                          onClick={() => setValue(row.id, String(row.suggestedOrder))}
                          className="cursor-pointer rounded px-1.5 py-0.5 font-medium text-rose-600 underline decoration-dotted hover:bg-rose-50"
                          title="Beírás a mennyiség mezőbe"
                        >
                          {formatQty(row.suggestedOrder)}
                        </button>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className="td text-right text-slate-500">{row.lastReceipt ?? '–'}</td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-2">
                        <input
                          name={`qty_${row.id}`}
                          inputMode="decimal"
                          value={values[row.id] ?? ''}
                          onChange={(event) => setValue(row.id, event.target.value)}
                          placeholder="0"
                          aria-label={`${row.name} – vásárolt mennyiség`}
                          className="field w-28 py-1.5 text-right"
                        />
                        <span className="w-20 text-left text-xs text-slate-500">{row.unit}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="card sticky bottom-4 p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <label className="label" htmlFor="date">
              Beérkezés dátuma
            </label>
            <input id="date" name="date" type="date" defaultValue={defaultDate} className="field" />
          </div>
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="note">
              Megjegyzés (opcionális)
            </label>
            <input
              id="note"
              name="note"
              placeholder="pl. Fonalnagyker rendelés #4521"
              className="field"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {filled === 0 ? 'Nincs kitöltött sor' : `${filled} alapanyag`}
            </span>
            <SubmitButton pendingLabel="Mentés…">Bevételezés mentése</SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}
