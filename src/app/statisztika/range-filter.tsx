'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RANGES } from '@/lib/ranges';

export function RangeFilter({ range }: { range: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={`w-56 ${pending ? 'opacity-60' : ''}`}>
      <label className="label" htmlFor="range">
        Időszak
      </label>
      <select
        id="range"
        value={range}
        onChange={(event) => startTransition(() => router.push(`/statisztika?range=${event.target.value}`))}
        className="field"
      >
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
