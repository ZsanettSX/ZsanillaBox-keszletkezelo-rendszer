/**
 * A Shopify "Orders export" CSV feldolgozása.
 *
 * A formátum sajátossága: egy rendelés több sorban jelenik meg — az elsőben van
 * minden rendelés-szintű adat (dátum, státusz), a további sorokban csak a
 * rendelés azonosítója és a tétel adatai. A dátumot ezért a rendeléshez kell
 * kötni, nem a sorhoz.
 */

export type CsvRow = Record<string, string>;

export type ImportLine = {
  orderName: string;
  date: Date;
  sku: string | null;
  title: string | null;
  quantity: number;
};

export type ParsedCsv = {
  lines: ImportLine[];
  /** Sztornózott rendelések — ezek nem fogyasztottak alapanyagot */
  cancelledOrders: string[];
  /** Rendelések, amelyekhez nem találtunk értelmezhető dátumot */
  ordersWithoutDate: string[];
};

/** Oszlopnév-olvasás kis/nagybetű és felesleges szóköz nélkül. */
function field(row: CsvRow, name: string): string {
  const target = name.toLowerCase().trim();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().trim() === target) return (row[key] ?? '').trim();
  }
  return '';
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  // A Shopify ISO-t exportál ("2026-05-14 09:12:33 +0200"), de a szóközös
  // időzóna-alakot a Date nem mindig eszi meg — normalizáljuk.
  const normalized = raw.replace(/\s([+-]\d{4})$/, '$1').replace(' ', 'T');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseQuantity(raw: string): number {
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseShopifyOrderCsv(rows: CsvRow[]): ParsedCsv {
  // 1. kör: rendelés-szintű adatok összegyűjtése (ezek csak az első sorban vannak)
  const orderDates = new Map<string, Date>();
  const cancelled = new Set<string>();

  for (const row of rows) {
    const orderName = field(row, 'Name');
    if (!orderName) continue;

    if (!orderDates.has(orderName)) {
      const created =
        parseDate(field(row, 'Created at')) ??
        parseDate(field(row, 'Paid at')) ??
        parseDate(field(row, 'Fulfilled at'));
      if (created) orderDates.set(orderName, created);
    }

    if (field(row, 'Cancelled at')) cancelled.add(orderName);

    const financialStatus = field(row, 'Financial Status').toLowerCase();
    if (financialStatus === 'voided') cancelled.add(orderName);
  }

  // 2. kör: tételek kiemelése
  const lines: ImportLine[] = [];
  const ordersWithoutDate = new Set<string>();

  for (const row of rows) {
    const orderName = field(row, 'Name');
    if (!orderName || cancelled.has(orderName)) continue;

    const quantity = parseQuantity(field(row, 'Lineitem quantity'));
    if (quantity <= 0) continue;

    const sku = field(row, 'Lineitem sku') || null;
    const title = field(row, 'Lineitem name') || null;
    if (!sku && !title) continue;

    const date = orderDates.get(orderName);
    if (!date) {
      ordersWithoutDate.add(orderName);
      continue;
    }

    lines.push({ orderName, date, sku, title, quantity });
  }

  return {
    lines,
    cancelledOrders: [...cancelled],
    ordersWithoutDate: [...ordersWithoutDate],
  };
}

/**
 * A Shopify tételnév gyakran variánst is tartalmaz ("Bagoly ZsanillaBox - Kék"),
 * és előfordul zárójeles előtag is ("(ELŐRENDELHETŐ) Bagoly | ZsanillaBox").
 * A párosításhoz ezeket lehántott alakban is megpróbáljuk.
 *
 * A teljes név mindig az első a listában, tehát a pontos egyezés elsőbbséget élvez —
 * a rövidített alakok csak tartalékként jönnek szóba.
 */
export function titleVariants(title: string): string[] {
  const trimmed = title.trim();
  const variants = new Set<string>([trimmed]);

  // Zárójeles előtag, pl. "(ELŐRENDELHETŐ) " — ugyanaz a termék, más címkével.
  const withoutPrefix = trimmed.replace(/^\([^)]*\)\s*/, '').trim();
  if (withoutPrefix && withoutPrefix !== trimmed) variants.add(withoutPrefix);

  for (const base of [...variants]) {
    for (const separator of [' - ', ' – ', ' — ', ' / ']) {
      const index = base.indexOf(separator);
      if (index > 0) variants.add(base.slice(0, index).trim());
    }
  }

  return [...variants];
}
