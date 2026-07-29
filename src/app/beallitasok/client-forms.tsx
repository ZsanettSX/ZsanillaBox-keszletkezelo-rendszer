'use client';

import { useActionState } from 'react';
import { Feedback } from '@/components/feedback';
import { SubmitButton } from '@/components/submit-button';
import type { ActionResult } from '@/lib/form';
import type { AppSettings } from '@/lib/settings';

export function SettingsForm({
  action,
  settings,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  settings: AppSettings;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="reserveDays">
            Tartaléknapok
          </label>
          <input
            id="reserveDays"
            name="reserveDays"
            inputMode="numeric"
            defaultValue={settings.reserveDays}
            className="field"
          />
          <p className="mt-1 text-xs text-slate-500">
            Az átfutási időn felüli puffer. A javaslat ennyivel több napra rendel. Ajánlott: 14.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="usageWindowDays">
            Fogyás-ablak (nap)
          </label>
          <input
            id="usageWindowDays"
            name="usageWindowDays"
            inputMode="numeric"
            defaultValue={settings.usageWindowDays}
            className="field"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ennyi nap fogyásából számoljuk a napi átlagot. Rövidebb ablak gyorsabban reagál, de
            zajosabb. Ajánlott: 60.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="alertCooldownDays">
            Riasztás-szünet (nap)
          </label>
          <input
            id="alertCooldownDays"
            name="alertCooldownDays"
            inputMode="numeric"
            defaultValue={settings.alertCooldownDays}
            className="field"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ennyi napig nem szól újra ugyanarról az alapanyagról — kivéve, ha közben tovább
            csökkent. Ajánlott: 4.
          </p>
        </div>
      </div>

      <SubmitButton>Beállítások mentése</SubmitButton>
    </form>
  );
}

export function TestAlertButton({ action }: { action: () => Promise<ActionResult> }) {
  const [state, formAction] = useActionState(async () => action(), null);

  return (
    <form action={formAction} className="space-y-3">
      <Feedback state={state} />
      <SubmitButton className="btn-secondary" pendingLabel="Számolás…">
        Riasztás próbafutása (email nem megy ki)
      </SubmitButton>
    </form>
  );
}
