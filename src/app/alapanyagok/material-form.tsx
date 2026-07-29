'use client';

import { useActionState } from 'react';
import { Feedback } from '@/components/feedback';
import { SubmitButton } from '@/components/submit-button';
import type { ActionResult } from '@/lib/form';

export type MaterialFormValues = {
  id?: string;
  name: string;
  unit: string;
  currentStock: number;
  supplierName: string | null;
  supplierUrl: string | null;
  leadTimeDays: number;
  safetyBuffer: number;
  reserveDays: number | null;
  orderMultiple: number;
  notes: string | null;
  active: boolean;
};

export const EMPTY_MATERIAL: MaterialFormValues = {
  name: '',
  unit: 'db',
  currentStock: 0,
  supplierName: null,
  supplierUrl: null,
  leadTimeDays: 14,
  safetyBuffer: 0,
  reserveDays: null,
  orderMultiple: 0,
  notes: null,
  active: true,
};

export function MaterialForm({
  action,
  values,
  submitLabel,
  /** Új alapanyagnál a kezdőkészletet is bekérjük; szerkesztésnél a leltár űrlap külön van. */
  includeStock = false,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  values: MaterialFormValues;
  submitLabel: string;
  includeStock?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <Feedback state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            Megnevezés *
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={values.name}
            placeholder="pl. Himalaya Dolphin Baby fonal – világoskék"
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="unit">
            Mértékegység *
          </label>
          <input
            id="unit"
            name="unit"
            required
            defaultValue={values.unit}
            placeholder="gombolyag / db / gramm"
            className="field"
          />
        </div>

        {includeStock && (
          <div>
            <label className="label" htmlFor="currentStock">
              Jelenlegi készlet
            </label>
            <input
              id="currentStock"
              name="currentStock"
              inputMode="decimal"
              defaultValue={values.currentStock}
              className="field"
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="supplierName">
            Beszállító
          </label>
          <input
            id="supplierName"
            name="supplierName"
            defaultValue={values.supplierName ?? ''}
            placeholder="pl. Fonalbolt Kft."
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="supplierUrl">
            Beszállító linkje
          </label>
          <input
            id="supplierUrl"
            name="supplierUrl"
            type="url"
            defaultValue={values.supplierUrl ?? ''}
            placeholder="https://…"
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="leadTimeDays">
            Átfutási idő (nap) *
          </label>
          <input
            id="leadTimeDays"
            name="leadTimeDays"
            inputMode="numeric"
            defaultValue={values.leadTimeDays}
            className="field"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ennyi nap telik el a megrendeléstől a beérkezésig.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="safetyBuffer">
            Biztonsági puffer ({values.unit || 'egység'})
          </label>
          <input
            id="safetyBuffer"
            name="safetyBuffer"
            inputMode="decimal"
            defaultValue={values.safetyBuffer}
            className="field"
          />
          <p className="mt-1 text-xs text-slate-500">
            Fix tartalék, amit sosem szeretnél felélni.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="reserveDays">
            Tartaléknapok (egyedi)
          </label>
          <input
            id="reserveDays"
            name="reserveDays"
            inputMode="numeric"
            defaultValue={values.reserveDays ?? ''}
            placeholder="üresen: globális beállítás"
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="orderMultiple">
            Rendelési egység
          </label>
          <input
            id="orderMultiple"
            name="orderMultiple"
            inputMode="decimal"
            defaultValue={values.orderMultiple}
            className="field"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ha csak kiszerelésben lehet rendelni (pl. 10-esével), írd be ide. 0 = nincs kerekítés.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Megjegyzés
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={values.notes ?? ''}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="active"
              defaultChecked={values.active}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
            />
            Aktív (szerepeljen a listákban és a riasztásokban)
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
