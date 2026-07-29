'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { RANGES } from './ranges';

export type MaterialOption = { id: string; name: string };

export function UsageFilters({
  materials,
  materialId,
  range,
}: {
  materials: MaterialOption[];
  materialId: string;
  range: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    startTransition(() => router.push(`/fogyas?${params.toString()}`));
  };

  return (
    <div className={`flex flex-wrap items-end gap-3 ${pending ? 'opacity-60' : ''}`}>
      <div className="min-w-64 flex-1">
        <label className="label" htmlFor="materialId">
          Alapanyag
        </label>
        <select
          id="materialId"
          value={materialId}
          onChange={(event) => update('materialId', event.target.value)}
          className="field"
        >
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="w-56">
        <label className="label" htmlFor="range">
          Időszak
        </label>
        <select
          id="range"
          value={range}
          onChange={(event) => update('range', event.target.value)}
          className="field"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
