'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Feedback } from '@/components/feedback';
import { SubmitButton } from '@/components/submit-button';
import type { ActionResult } from '@/lib/form';

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export type MaterialOption = { id: string; name: string; unit: string };

export function ProductForm({
  action,
  values,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: Action;
  values?: { id?: string; name: string; shopifyProductId: string | null; sku: string | null; active: boolean };
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      <Feedback state={state} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="label">Terméknév *</label>
          <input
            name="name"
            required
            defaultValue={values?.name ?? ''}
            placeholder="pl. Bagoly ZsanillaBox"
            className="field"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Shopify termék-azonosító</label>
          <input
            name="shopifyProductId"
            defaultValue={values?.shopifyProductId ?? ''}
            placeholder="pl. 7412563987456"
            className="field"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ez köti össze a Shopify-rendeléssel. Nélküle az élő webhook nem tudja levonni a készletet.
          </p>
        </div>
        <div>
          <label className="label">SKU</label>
          <input name="sku" defaultValue={values?.sku ?? ''} className="field" />
        </div>
      </div>

      {values?.id && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="active"
            defaultChecked={values.active}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
          />
          Aktív
        </label>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

/** Új receptsor: melyik alapanyagból mennyi kell egy darab termékhez. */
export function AddRecipeItemForm({
  action,
  productId,
  materials,
}: {
  action: Action;
  productId: string;
  materials: MaterialOption[];
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <Feedback state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="label">Alapanyag</label>
          <select name="rawMaterialId" required defaultValue="" className="field">
            <option value="" disabled>
              Válassz alapanyagot…
            </option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="label">Mennyiség / darab</label>
          <input name="quantityPerUnit" inputMode="decimal" required placeholder="pl. 0,5" className="field" />
        </div>
        <SubmitButton>Hozzáadás</SubmitButton>
      </div>
    </form>
  );
}

/** Meglévő receptsor mennyiségének módosítása. */
export function RecipeQuantityForm({
  action,
  productId,
  rawMaterialId,
  quantityPerUnit,
}: {
  action: Action;
  productId: string;
  rawMaterialId: string;
  quantityPerUnit: number;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rawMaterialId" value={rawMaterialId} />
      <input
        name="quantityPerUnit"
        inputMode="decimal"
        defaultValue={quantityPerUnit}
        className="field w-28 py-1.5 text-right"
        aria-label="Mennyiség darabonként"
      />
      <SubmitButton className="btn-secondary px-2 py-1.5 text-xs">Mentés</SubmitButton>
      {state && !state.ok && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function DeleteRecipeItemForm({ action, id }: { action: Action; id: string }) {
  const [, formAction] = useActionState(action, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn-danger px-2 py-1.5 text-xs" pendingLabel="…">
        Törlés
      </SubmitButton>
    </form>
  );
}

export function DeleteProductForm({ action, id, name }: { action: Action; id: string; name: string }) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Biztosan törlöd a(z) „${name}” terméket a receptjével együtt?`)) {
          event.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <SubmitButton className="btn-danger" pendingLabel="Törlés…">
        Termék törlése
      </SubmitButton>
    </form>
  );
}
