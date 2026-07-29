import crypto from 'node:crypto';

/**
 * A Shopify webhook aláírásának ellenőrzése.
 *
 * Fontos: a HMAC-et a **nyers** kérés-törzsre kell számolni, nem a JSON.parse →
 * JSON.stringify körbeforgatott változatra, mert az átrendezheti a mezőket.
 *
 * Az összehasonlítás időzítés-független (timingSafeEqual), hogy az aláírás
 * ne legyen byte-onként kitalálható.
 */
export function verifyShopifyHmac(
  rawBody: string,
  headerHmac: string | null,
  secret: string,
): boolean {
  if (!headerHmac || !secret) return false;

  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest();

  let received: Buffer;
  try {
    received = Buffer.from(headerHmac, 'base64');
  } catch {
    return false;
  }

  if (received.length !== digest.length) return false;
  return crypto.timingSafeEqual(digest, received);
}

export type ShopifyLineItem = {
  product_id?: number | string | null;
  variant_id?: number | string | null;
  quantity?: number | null;
  title?: string | null;
  sku?: string | null;
};

export type ShopifyOrderPayload = {
  id?: number | string;
  name?: string;
  created_at?: string;
  test?: boolean;
  line_items?: ShopifyLineItem[];
};

export type ParsedOrderLine = {
  shopifyProductId: string;
  quantity: number;
  title: string | null;
  sku: string | null;
};

/**
 * A rendelés tételeiből kiszedi a termék-azonosítót és a darabszámot.
 * Az azonos termékre eső sorokat összevonja (a Shopify külön sorba teszi a
 * variánsokat, de a recept termék szintű).
 */
export function parseOrderLines(payload: ShopifyOrderPayload): ParsedOrderLine[] {
  const byProduct = new Map<string, ParsedOrderLine>();

  for (const item of payload.line_items ?? []) {
    if (item.product_id === null || item.product_id === undefined) continue;
    const shopifyProductId = String(item.product_id);
    const quantity = Number(item.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const existing = byProduct.get(shopifyProductId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      byProduct.set(shopifyProductId, {
        shopifyProductId,
        quantity,
        title: item.title ?? null,
        sku: item.sku ?? null,
      });
    }
  }

  return [...byProduct.values()];
}

/** A rendelés dátuma; ha hiányzik vagy hibás, a mai nap. */
export function orderDate(payload: ShopifyOrderPayload): Date {
  if (!payload.created_at) return new Date();
  const parsed = new Date(payload.created_at);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
