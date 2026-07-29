import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { orderDate, parseOrderLines, verifyShopifyHmac } from './shopify';

const SECRET = 'teszt-titok';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

describe('verifyShopifyHmac', () => {
  const body = JSON.stringify({ id: 1, line_items: [] });

  it('elfogadja a helyes aláírást', () => {
    expect(verifyShopifyHmac(body, sign(body), SECRET)).toBe(true);
  });

  it('elutasítja, ha más titokkal írták alá', () => {
    expect(verifyShopifyHmac(body, sign(body, 'masik-titok'), SECRET)).toBe(false);
  });

  it('elutasítja, ha a törzs megváltozott', () => {
    const signature = sign(body);
    expect(verifyShopifyHmac(body + ' ', signature, SECRET)).toBe(false);
  });

  it('elutasítja a hiányzó fejlécet', () => {
    expect(verifyShopifyHmac(body, null, SECRET)).toBe(false);
  });

  it('elutasít, ha nincs beállítva titok — nem esik vissza "engedélyezőre"', () => {
    expect(verifyShopifyHmac(body, sign(body), '')).toBe(false);
  });

  it('rossz hosszúságú aláírásnál sem dob kivételt', () => {
    expect(verifyShopifyHmac(body, 'rovid', SECRET)).toBe(false);
  });

  it('az ékezetes (többbájtos) tartalmat is helyesen kezeli', () => {
    const utf8Body = JSON.stringify({ title: 'Bagoly ZsanillaBox – kék fonallal' });
    expect(verifyShopifyHmac(utf8Body, sign(utf8Body), SECRET)).toBe(true);
  });
});

describe('parseOrderLines', () => {
  it('kiszedi a termékeket és a darabszámot', () => {
    const lines = parseOrderLines({
      line_items: [
        { product_id: 111, quantity: 2, title: 'Bagoly' },
        { product_id: 222, quantity: 1, title: 'Maci' },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ shopifyProductId: '111', quantity: 2 });
  });

  it('összevonja az azonos termék variánsait', () => {
    const lines = parseOrderLines({
      line_items: [
        { product_id: 111, variant_id: 1, quantity: 2 },
        { product_id: 111, variant_id: 2, quantity: 3 },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
  });

  it('kihagyja a termék-azonosító nélküli sorokat (pl. egyedi tétel)', () => {
    const lines = parseOrderLines({
      line_items: [{ product_id: null, quantity: 1 }, { product_id: 111, quantity: 1 }],
    });
    expect(lines).toHaveLength(1);
  });

  it('kihagyja a nulla vagy hiányzó darabszámot', () => {
    expect(parseOrderLines({ line_items: [{ product_id: 1, quantity: 0 }] })).toHaveLength(0);
    expect(parseOrderLines({ line_items: [{ product_id: 1 }] })).toHaveLength(0);
  });

  it('üres rendelésnél üres listát ad', () => {
    expect(parseOrderLines({})).toEqual([]);
  });
});

describe('orderDate', () => {
  it('a Shopify dátumát használja', () => {
    expect(orderDate({ created_at: '2026-07-01T10:00:00+02:00' }).toISOString()).toBe(
      '2026-07-01T08:00:00.000Z',
    );
  });

  it('hibás dátumnál a mai napra esik vissza', () => {
    expect(orderDate({ created_at: 'nem-datum' })).toBeInstanceOf(Date);
    expect(Number.isNaN(orderDate({ created_at: 'nem-datum' }).getTime())).toBe(false);
  });
});
