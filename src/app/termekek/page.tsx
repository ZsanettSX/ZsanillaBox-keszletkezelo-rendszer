import Link from 'next/link';
import { createProductAction } from './actions';
import { ProductForm } from './client-forms';
import { SetupNeeded } from '@/components/setup-needed';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  let products;
  try {
    products = await prisma.product.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { recipeItems: true } } },
    });
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  const missingRecipe = products.filter((p) => p.active && p._count.recipeItems === 0);
  const missingShopifyId = products.filter((p) => p.active && !p.shopifyProductId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Termékek & receptek</h1>
        <p className="text-sm text-slate-500">
          A recept mondja meg, mi fogy egy eladott termékből. Enélkül a rendszer nem tud levonni
          semmit.
        </p>
      </div>

      {(missingRecipe.length > 0 || missingShopifyId.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {missingRecipe.length > 0 && (
            <p>
              <span className="font-semibold">{missingRecipe.length} terméknek nincs receptje</span>{' '}
              — ezek eladásakor nem fog csökkenni a készlet.
            </p>
          )}
          {missingShopifyId.length > 0 && (
            <p className="mt-1">
              <span className="font-semibold">
                {missingShopifyId.length} terméknek hiányzik a Shopify-azonosítója
              </span>{' '}
              — ezekhez az élő webhook nem tud rendelést párosítani.
            </p>
          )}
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Új termék</h2>
        <ProductForm action={createProductAction} submitLabel="Termék felvitele" resetOnSuccess />
      </div>

      {products.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Termék</th>
                  <th className="th">SKU</th>
                  <th className="th">Shopify ID</th>
                  <th className="th text-right">Receptsorok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className={p.active ? 'hover:bg-slate-50' : 'bg-slate-50/60 opacity-60'}>
                    <td className="td font-medium text-slate-900">
                      <Link href={`/termekek/${p.id}`} className="hover:text-rose-600">
                        {p.name}
                      </Link>
                      {!p.active && (
                        <span className="ml-2 text-xs font-normal text-slate-500">(inaktív)</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{p.sku ?? '–'}</td>
                    <td className="td font-mono text-xs text-slate-500">
                      {p.shopifyProductId ?? (
                        <span className="font-sans text-amber-700">hiányzik</span>
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {p._count.recipeItems === 0 ? (
                        <span className="text-amber-700">nincs recept</span>
                      ) : (
                        p._count.recipeItems
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
