import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { applyUsage, recalculate, recordProductSales, type UsageSource } from '@/lib/inventory';
import { explodeBom } from '@/lib/reorder';
import { orderDate, parseOrderLines, verifyShopifyHmac, type ShopifyOrderPayload } from '@/lib/shopify';

// A HMAC-ellenőrzéshez node:crypto kell, és a nyers kérés-törzs is.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A Shopify 5 másodperc után időtúllépésnek veszi a választ és újraküld — az
// idempotencia miatt ez nem okoz kettős levonást, de hagyjunk bőven időt.
export const maxDuration = 30;

const CANCEL_TOPICS = new Set(['orders/cancelled', 'orders/delete']);

export async function POST(request: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[shopify-webhook] Hiányzik a SHOPIFY_WEBHOOK_SECRET, a kérést elutasítjuk.');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  // A HMAC-et a nyers törzsre kell számolni — a JSON újraszerializálása elrontaná.
  const rawBody = await request.text();
  const signature = request.headers.get('x-shopify-hmac-sha256');

  if (!verifyShopifyHmac(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'invalid_hmac' }, { status: 401 });
  }

  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyOrderPayload;
  } catch {
    // Érvénytelen JSON-t nincs értelme újraküldetni.
    return NextResponse.json({ error: 'invalid_json' }, { status: 200 });
  }

  const orderId = payload.id === undefined ? null : String(payload.id);
  if (!orderId) return NextResponse.json({ error: 'missing_order_id' }, { status: 200 });

  if (payload.test === true) {
    return NextResponse.json({ skipped: 'test_order' }, { status: 200 });
  }

  const topic = request.headers.get('x-shopify-topic') ?? 'orders/create';
  const isCancellation = CANCEL_TOPICS.has(topic);
  // A sztornót külön kulccsal könyveljük, hogy önmagában is idempotens legyen.
  const idempotencyKey = isCancellation ? `cancelled:${orderId}` : orderId;

  try {
    // Sztornózni csak azt tudjuk, amit korábban le is vontunk.
    if (isCancellation) {
      const original = await prisma.processedOrder.findUnique({
        where: { shopifyOrderId: orderId },
      });
      if (!original) {
        return NextResponse.json({ skipped: 'order_was_never_applied' }, { status: 200 });
      }
    }

    const lines = parseOrderLines(payload);
    if (lines.length === 0) {
      return NextResponse.json({ skipped: 'no_line_items' }, { status: 200 });
    }

    const products = await prisma.product.findMany({
      where: { shopifyProductId: { in: lines.map((l) => l.shopifyProductId) } },
      select: { id: true, shopifyProductId: true, recipeItems: true },
    });
    const byShopifyId = new Map(products.map((p) => [p.shopifyProductId!, p]));

    const unmatched = lines
      .filter((l) => {
        const product = byShopifyId.get(l.shopifyProductId);
        return !product || product.recipeItems.length === 0;
      })
      .map((l) => `${l.title ?? l.shopifyProductId} (${l.shopifyProductId})`);

    const sign = isCancellation ? -1 : 1;
    // Termékszintű tételek: ezekből lesz a recept-robbantás és a statisztika is.
    const productLines = lines
      .filter((l) => byShopifyId.has(l.shopifyProductId))
      .map((l) => ({
        productId: byShopifyId.get(l.shopifyProductId)!.id,
        quantity: l.quantity * sign,
      }));

    const usage = explodeBom(
      productLines,
      products.flatMap((p) =>
        p.recipeItems.map((r) => ({
          productId: p.id,
          rawMaterialId: r.rawMaterialId,
          quantityPerUnit: r.quantityPerUnit,
        })),
      ),
    );

    // Az idempotencia-bejegyzés és a levonás egy tranzakcióban: ha a rendelés
    // már fel volt dolgozva, az egyedi kulcs ütközik és a levonás visszagördül,
    // így az újraküldött webhook nem von le kétszer.
    await prisma.$transaction(async (tx) => {
      await tx.processedOrder.create({
        data: {
          shopifyOrderId: idempotencyKey,
          orderName: payload.name ?? null,
        },
      });
      const reference = isCancellation
        ? `Sztornó: ${payload.name ?? orderId}`
        : (payload.name ?? orderId);

      await recordProductSales(
        productLines,
        { date: orderDate(payload), source: 'shopify_order', reference },
        tx,
      );

      await applyUsage(
        usage,
        {
          date: orderDate(payload),
          source: 'shopify_order' satisfies UsageSource,
          reference,
        },
        tx,
      );
    });

    const affected = [...usage.keys()];
    if (affected.length > 0) await recalculate(affected);

    if (unmatched.length > 0) {
      console.warn(
        `[shopify-webhook] ${payload.name ?? orderId}: nincs recept ezekhez a termékekhez: ${unmatched.join(', ')}`,
      );
    }

    return NextResponse.json({
      ok: true,
      applied: affected.length,
      unmatchedProducts: unmatched,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Ezt a rendelést már feldolgoztuk — a Shopify újraküldése normális.
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[shopify-webhook] Feldolgozási hiba:', error);
    // 500-ra a Shopify újrapróbálkozik, ami adatbázis-kimaradásnál pont jó.
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
