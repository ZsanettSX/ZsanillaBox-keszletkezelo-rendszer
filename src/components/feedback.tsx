import type { ActionResult } from '@/lib/form';

/** Server action eredményének megjelenítése — siker zölden, hiba pirosan. */
export function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;

  if (state.ok) {
    return state.message ? (
      <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-600/20 ring-inset">
        {state.message}
      </p>
    ) : null;
  }

  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-600/20 ring-inset">
      {state.error}
    </p>
  );
}
