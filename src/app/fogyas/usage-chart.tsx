'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { SeriesPoint } from '@/lib/usage-series';
import { formatQty } from '@/lib/format';

// Egy sorozat van, ezért nincs jelmagyarázat — a cím mondja meg, mi látszik.
// A szín a validált kategorikus 1-es slot; a rács és a tengely szándékosan halvány.
const SERIES = '#2a78d6';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const MUTED = '#898781';

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: TooltipContentProps & { unit: string }) {
  if (!active || !payload?.length) return null;
  // A Recharts érték-típusa string is lehet; nálunk mindig szám, de kényszerítjük.
  const raw = payload[0].value;
  const value = typeof raw === 'number' ? raw : Number(raw ?? 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">
        {formatQty(value)} {unit}
      </p>
    </div>
  );
}

export function UsageChart({ data, unit }: { data: SeriesPoint[]; unit: string }) {
  const allZero = data.every((point) => point.total === 0);

  if (data.length === 0 || allZero) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        Ebben az időszakban nem volt rögzített fogyás.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: AXIS }}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(11,11,11,0.04)' }}
            content={(props) => <ChartTooltip {...props} unit={unit} />}
          />
          {/*
            Animáció nélkül: a belépő animáció requestAnimationFrame-re épül, és
            amíg az nem fut (háttérfül, kikapcsolt animáció, szerver-oldali
            pillanatkép), a sávok nulla magasságon maradnak — vagyis üres a
            grafikon. Egy készletnézetnek mindig az adatot kell mutatnia.
          */}
          <Bar
            dataKey="total"
            fill={SERIES}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
