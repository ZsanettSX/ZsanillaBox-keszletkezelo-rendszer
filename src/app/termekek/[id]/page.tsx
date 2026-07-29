import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  deleteProductAction,
  deleteRecipeItemAction,
  updateProductAction,
  upsertRecipeItemAction,
} from '../actions';
import {
  AddRecipeItemForm,
  DeleteProductForm,
  DeleteRecipeItemForm,
  ProductForm,
  RecipeQuantityForm,
} from '../client-forms';
import { SetupNeeded } from '@/components/setup-needed';
import { prisma } from '@/lib/db';
import { formatQtyWithUnit } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let product;
  let materials;
  try {
    [product, materials] = await Promise.all([
      prisma.product.findUnique({
        where: { id },
        include: {
          recipeItems: { include: { rawMaterial: true }, orderBy: { rawMaterial: { name: 'asc' } } },
        },
      }),
      prisma.rawMaterial.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, unit: true },
      }),
    ]);
  } catch (error) {
    return <SetupNeeded error={error} />;
  }

  if (!product) notFound();

  const usedIds = new Set(product.recipeItems.map((r) => r.rawMaterialId));
  const availableMaterials = materials.filter((m) => !usedIds.has(m.id));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/termekek" className="text-sm text-slate-500 hover:text-slate-800">
          ← Vissza a termékekhez
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{product.name}</h1>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Recept (BOM)</h2>
          <p className="text-sm text-slate-500">
            Mennyi kell <strong>egy darab</strong> termékhez. Ezt vonja le a rendszer minden eladott
            darab után.
          </p>
        </div>

        {product.recipeItems.length === 0 ? (
          <p className="px-6 py-5 text-sm text-amber-800">
            Ehhez a termékhez még nincs recept, ezért az eladása nem csökkenti a készletet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Alapanyag</th>
                  <th className="th">Mennyiség / darab</th>
                  <th className="th text-right">Készleten</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {product.recipeItems.map((item) => (
                  <tr key={item.id}>
                    <td className="td font-medium text-slate-900">
                      <Link
                        href={`/alapanyagok/${item.rawMaterialId}`}
                        className="hover:text-rose-600"
                      >
                        {item.rawMaterial.name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">({item.rawMaterial.unit})</span>
                    </td>
                    <td className="td">
                      <RecipeQuantityForm
                        action={upsertRecipeItemAction}
                        productId={product.id}
                        rawMaterialId={item.rawMaterialId}
                        quantityPerUnit={item.quantityPerUnit}
                      />
                    </td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {formatQtyWithUnit(item.rawMaterial.currentStock, item.rawMaterial.unit)}
                    </td>
                    <td className="td text-right">
                      <DeleteRecipeItemForm action={deleteRecipeItemAction} id={item.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          {availableMaterials.length === 0 ? (
            <p className="text-sm text-slate-500">
              {materials.length === 0 ? (
                <>
                  Előbb vigyél fel alapanyagokat az{' '}
                  <Link href="/alapanyagok/uj" className="text-rose-600 underline">
                    Alapanyagok
                  </Link>{' '}
                  oldalon.
                </>
              ) : (
                'Minden alapanyag szerepel már a receptben.'
              )}
            </p>
          ) : (
            <AddRecipeItemForm
              action={upsertRecipeItemAction}
              productId={product.id}
              materials={availableMaterials}
            />
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Termékadatok</h2>
        <ProductForm
          action={updateProductAction}
          values={{
            id: product.id,
            name: product.name,
            shopifyProductId: product.shopifyProductId,
            sku: product.sku,
            active: product.active,
          }}
          submitLabel="Mentés"
        />
      </div>

      <div className="card border-red-100 p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Veszélyzóna</h2>
        <p className="mb-3 text-sm text-slate-500">
          A termék törlésével a receptje is elvész. A már rögzített fogyástörténet megmarad.
        </p>
        <DeleteProductForm action={deleteProductAction} id={product.id} name={product.name} />
      </div>
    </div>
  );
}
