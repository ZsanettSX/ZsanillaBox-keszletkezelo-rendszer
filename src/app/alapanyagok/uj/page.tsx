import Link from 'next/link';
import { createMaterialAction } from '../actions';
import { EMPTY_MATERIAL, MaterialForm } from '../material-form';

export default function NewMaterialPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/alapanyagok" className="text-sm text-slate-500 hover:text-slate-800">
          ← Vissza az alapanyagokhoz
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Új alapanyag</h1>
      </div>

      <div className="card p-6">
        <MaterialForm
          action={createMaterialAction}
          values={EMPTY_MATERIAL}
          submitLabel="Alapanyag mentése"
          includeStock
        />
      </div>
    </div>
  );
}
