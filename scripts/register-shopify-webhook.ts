/**
 * A Shopify webhookok regisztrálása az Admin API-n keresztül.
 *
 * Előfeltétel a .env-ben: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, APP_URL
 * Használat: npm run shopify:register-webhook
 *
 * A már meglévő, ugyanarra az URL-re mutató webhookot nem duplikálja.
 */
import 'dotenv/config';

// A Shopify egy API-verziót nagyjából egy évig támogat, ezért ezt frissen kell tartani.
// Igazítsd ahhoz, ami az app "Webhooks API version" mezőjében szerepel.
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? '2026-07';
const TOPICS = ['orders/create', 'orders/cancelled'];

type Webhook = { id: number; topic: string; address: string };

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function shopifyFetch(path: string, init?: RequestInit) {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shop) fail('Hiányzik a SHOPIFY_SHOP_DOMAIN (pl. zsanillabox.myshopify.com).');
  if (!token) fail('Hiányzik a SHOPIFY_ADMIN_ACCESS_TOKEN (a custom app Admin API tokenje).');

  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    fail(`Shopify API hiba (${response.status} ${response.statusText}):\n${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  if (!appUrl) fail('Hiányzik az APP_URL (a rendszer publikus címe).');
  if (appUrl.startsWith('http://localhost')) {
    fail(
      'Az APP_URL localhost-ra mutat. A Shopify csak publikus HTTPS címre tud webhookot küldeni —\n' +
        '  előbb deployold a rendszert, vagy használj ngrok-ot teszteléshez.',
    );
  }

  const address = `${appUrl}/api/webhooks/shopify/orders`;
  console.log(`\nCél URL: ${address}\n`);

  const { webhooks } = (await shopifyFetch('webhooks.json')) as { webhooks: Webhook[] };

  for (const topic of TOPICS) {
    const existing = webhooks.find((w) => w.topic === topic && w.address === address);
    if (existing) {
      console.log(`• ${topic} — már regisztrálva (id: ${existing.id})`);
      continue;
    }

    const created = (await shopifyFetch('webhooks.json', {
      method: 'POST',
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    })) as { webhook: Webhook };

    console.log(`✓ ${topic} — regisztrálva (id: ${created.webhook.id})`);
  }

  console.log(
    '\nKész. Ellenőrizd, hogy a SHOPIFY_WEBHOOK_SECRET a custom app "API secret key" értéke,\n' +
      'különben minden bejövő webhookot elutasít a HMAC-ellenőrzés.\n',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
