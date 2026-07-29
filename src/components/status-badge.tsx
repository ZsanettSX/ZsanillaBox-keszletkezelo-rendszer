import type { StockStatus } from '@/lib/reorder';

const STYLES: Record<StockStatus, { label: string; className: string }> = {
  critical: { label: 'Elfogyott', className: 'bg-red-100 text-red-800 ring-red-600/20' },
  reorder: { label: 'Rendelni kell', className: 'bg-red-50 text-red-700 ring-red-500/20' },
  warning: { label: 'Fogytán', className: 'bg-amber-50 text-amber-800 ring-amber-500/30' },
  ok: { label: 'Rendben', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
};

export function StatusBadge({ status }: { status: StockStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.className}`}
    >
      {s.label}
    </span>
  );
}

export const STATUS_LABELS = STYLES;
