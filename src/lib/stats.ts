import { prisma } from './db';
import { roundQty } from './reorder';

export type ProductSalesRow = {
  productId: string;
  name: string;
  /** Rövidített név a grafikonhoz (a "| ZsanillaBox" utótag nélkül) */
  shortName: string;
  quantity: number;
  /** Részesedés az időszak összes eladásából, 0–1 */
  share: number;
};

/** A hosszú terméknevek a grafikon tengelyén olvashatatlanok lennének. */
export function shortenProductName(name: string): string {
  return name.split('|')[0].trim() || name;
}

/**
 * Termékenkénti eladás egy időszakra, csökkenő sorrendben.
 *
 * A nem fogyott termékek is szerepelnek nullával — az is információ, hogy
 * valamiből egyetlen darab sem ment el.
 */
export async function getProductSalesStats(
  start: Date,
  end: Date,
): Promise<{ rows: ProductSalesRow[]; total: number }> {
  const [products, grouped] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.productSale.groupBy({
      by: ['productId'],
      where: { date: { gte: start, lte: end } },
      _sum: { quantity: true },
    }),
  ]);

  const soldByProduct = new Map(grouped.map((g) => [g.productId, g._sum.quantity ?? 0]));
  const total = products.reduce((sum, p) => sum + Math.max(0, soldByProduct.get(p.id) ?? 0), 0);

  const rows = products
    .map((p) => {
      const quantity = roundQty(soldByProduct.get(p.id) ?? 0);
      return {
        productId: p.id,
        name: p.name,
        shortName: shortenProductName(p.name),
        quantity,
        share: total > 0 ? Math.max(0, quantity) / total : 0,
      };
    })
    .sort((a, b) => b.quantity - a.quantity);

  return { rows, total: roundQty(total) };
}
