'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { formatQty } from '@/lib/format';
import type { ProductSalesRow } from '@/lib/stats';

// Egyetlen sorozat, magnitúdó-összehasonlítás: egy hue elég, jelmagyarázat nem kell.
const SERIES = '#2a78d6';
const GRID = '#e1e0d9';
const MUTED = '#898781';

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const raw = payload[0].value;
  const value = typeof raw === 'number' ? raw : Number(raw ?? 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{formatQty(value)} db</p>
    </div>
  );
}

/** Ennél több sáv olvashatatlanul hosszú oldalt adna; a többi a táblázatban látszik. */
const MAX_BARS = 12;

export function SalesChart({ rows }: { rows: ProductSalesRow[] }) {
  const sold = rows.filter((r) => r.quantity > 0);
  const data = sold.slice(0, MAX_BARS);
  const hidden = sold.length - data.length;

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        Ebben az időszakban nem volt eladás.
      </div>
    );
  }

  // Vízszintes sávok: a terméknevek túl hosszúak függőleges tengelyhez.
  // Soronként 44px, hogy a sávok ne préselődjenek össze sok terméknél.
  const height = Math.max(200, data.length * 44 + 40);

  return (
    <>
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="shortName"
            width={170}
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} content={ChartTooltip} />
          <Bar
            dataKey="quantity"
            fill={SERIES}
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          >
            {/* Kevés sáv van, ezért minden érték kifér a sáv végére. */}
            <LabelList
              dataKey="quantity"
              position="right"
              formatter={(value) => `${formatQty(Number(value ?? 0))} db`}
              style={{ fill: '#52514e', fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    {hidden > 0 && (
      <p className="mt-3 text-xs text-slate-500">
        A grafikonon a legtöbbet fogyó {MAX_BARS} termék látszik. További {hidden} termékből is
        fogyott ebben az időszakban — azok a lenti táblázatban szerepelnek.
      </p>
    )}
    </>
  );
}
