import { saveSettingsAction, testAlertAction } from './actions';
import { SettingsForm, TestAlertButton } from './client-forms';
import { SetupNeeded } from '@/components/setup-needed';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Csak azt mutatjuk meg, hogy be van-e állítva — az értéket soha. */
const CHECKS: Array<{ env: string; label: string; hint: string }> = [
  { env: 'DATABASE_URL', label: 'Adatbázis', hint: 'PostgreSQL kapcsolat (Neon / Railway / Supabase)' },
  { env: 'SHOPIFY_WEBHOOK_SECRET', label: 'Shopify webhook titok', hint: 'A custom app „API secret key” értéke — enélkül minden webhookot elutasítunk' },
  { env: 'SHOPIFY_ADMIN_ACCESS_TOKEN', label: 'Shopify Admin token', hint: 'A webhook regisztrálásához kell (shpat_…)' },
  { env: 'RESEND_API_KEY', label: 'Resend API kulcs', hint: 'Az email küldéséhez' },
  { env: 'ALERT_EMAIL_TO', label: 'Riasztás címzettje', hint: 'Ide megy a napi összesítő' },
  { env: 'CRON_SECRET', label: 'Cron titok', hint: 'A napi futtatás endpointját védi' },
  { env: 'ADMIN_PASSWORD', label: 'Admin jelszó', hint: 'A felület jelszavas védelme (élesben erősen ajánlott)' },
];

export default async function SettingsPage() {
  let settings;
  try {
    settings = await getSettings();
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Beállítások</h1>
        <p className="text-sm text-slate-500">
          Ezek a globális értékek határozzák meg, mikor és mennyit javasol rendelni a rendszer.
        </p>
      </div>

      <div className="card p-6">
        <SettingsForm action={saveSettingsAction} settings={settings} />
      </div>

      <div className="card p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Riasztás kipróbálása</h2>
        <p className="mb-4 text-sm text-slate-500">
          Megmutatja, mi menne ki a napi emailben — küldés és naplózás nélkül.
        </p>
        <TestAlertButton action={testAlertAction} />
      </div>

      <div className="card p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Kapcsolatok állapota</h2>
        <p className="mb-4 text-sm text-slate-500">
          Csak azt jelezzük, be van-e állítva az adott érték — magát az értéket soha nem mutatjuk meg.
        </p>
        <ul className="divide-y divide-slate-100">
          {CHECKS.map((check) => {
            const configured = Boolean(process.env[check.env]?.trim());
            return (
              <li key={check.env} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{check.label}</p>
                  <p className="text-xs text-slate-500">{check.hint}</p>
                  <code className="text-xs text-slate-400">{check.env}</code>
                </div>
                <span
                  className={
                    configured
                      ? 'shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset'
                      : 'shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-500/30 ring-inset'
                  }
                >
                  {configured ? 'beállítva' : 'hiányzik'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Végpontok</h2>
        <p className="mb-4 text-sm text-slate-500">Ezeket kell megadni a Shopifynak és az ütemezőnek.</p>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Shopify webhook cél-URL</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-slate-600">
              {appUrl}/api/webhooks/shopify/orders
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Napi riasztás (cron)</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-slate-600">
              GET {appUrl}/api/cron/daily
            </dd>
            <dd className="mt-0.5 text-xs text-slate-500">
              Authorization: Bearer &lt;CRON_SECRET&gt; fejléccel, vagy ?token=&lt;CRON_SECRET&gt;
              paraméterrel.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
