'use client';

import { useActionState } from 'react';
import { Feedback } from '@/components/feedback';
import { SubmitButton } from '@/components/submit-button';
import type { ActionResult } from '@/lib/form';

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Leltár: a tényleges készlet beírása. A különbözet fogyásnaplóba kerül. */
export function StockForm({
  action,
  id,
  currentStock,
  unit,
}: {
  action: Action;
  id: string;
  currentStock: number;
  unit: string;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="newStock">
            Tényleges készlet ({unit})
          </label>
          <input
            id="newStock"
            name="newStock"
            inputMode="decimal"
            defaultValue={currentStock}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="note">
            Megjegyzés
          </label>
          <input
            id="note"
            name="note"
            placeholder="pl. leltár 2026-07-29"
            className="field"
          />
        </div>
      </div>
      <SubmitButton className="btn-secondary">Készlet frissítése</SubmitButton>
    </form>
  );
}

export function DeleteForm({ action, id, name }: { action: Action; id: string; name: string }) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Biztosan törlöd a(z) „${name}” alapanyagot?\n\nHa tartozik hozzá recept vagy fogyástörténet, nem töröljük, csak inaktiváljuk.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <SubmitButton className="btn-danger" pendingLabel="Törlés…">
        Alapanyag törlése
      </SubmitButton>
    </form>
  );
}
