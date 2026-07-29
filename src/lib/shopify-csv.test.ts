import { describe, expect, it } from 'vitest';
import { parseShopifyOrderCsv, titleVariants, type CsvRow } from './shopify-csv';

const header = (over: Partial<CsvRow>): CsvRow => ({
  Name: '#1001',
  'Created at': '2026-05-14 09:12:33 +0200',
  'Cancelled at': '',
  'Financial Status': 'paid',
  'Lineitem quantity': '1',
  'Lineitem name': 'Bagoly ZsanillaBox',
  'Lineitem sku': 'BAGOLY-01',
  ...over,
});

describe('parseShopifyOrderCsv', () => {
  it('kiolvassa az egysoros rendelést', () => {
    const { lines } = parseShopifyOrderCsv([header({})]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ orderName: '#1001', sku: 'BAGOLY-01', quantity: 1 });
    expect(lines[0].date.toISOString()).toBe('2026-05-14T07:12:33.000Z');
  });

  it('a folytatósoroknak is a rendelés dátumát adja', () => {
    // A Shopify a további tételeknél üresen hagyja a rendelés-szintű mezőket.
    const { lines } = parseShopifyOrderCsv([
      header({}),
      header({
        'Created at': '',
        'Financial Status': '',
        'Lineitem name': 'Maci ZsanillaBox',
        'Lineitem sku': 'MACI-01',
        'Lineitem quantity': '2',
      }),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[1].quantity).toBe(2);
    expect(lines[1].date.toISOString()).toBe(lines[0].date.toISOString());
  });

  it('kihagyja a sztornózott rendelést minden tételével együtt', () => {
    const { lines, cancelledOrders } = parseShopifyOrderCsv([
      header({ 'Cancelled at': '2026-05-15 10:00:00 +0200' }),
      header({ 'Created at': '', 'Cancelled at': '', 'Lineitem sku': 'MACI-01' }),
    ]);

    expect(lines).toHaveLength(0);
    expect(cancelledOrders).toEqual(['#1001']);
  });

  it('a voided pénzügyi státuszt is sztornóként kezeli', () => {
    const { lines } = parseShopifyOrderCsv([header({ 'Financial Status': 'voided' })]);
    expect(lines).toHaveLength(0);
  });

  it('kihagyja a nulla darabszámú sorokat', () => {
    const { lines } = parseShopifyOrderCsv([header({ 'Lineitem quantity': '0' })]);
    expect(lines).toHaveLength(0);
  });

  it('dátum nélküli rendelést nem talál ki, hanem jelent', () => {
    const { lines, ordersWithoutDate } = parseShopifyOrderCsv([
      header({ 'Created at': '', 'Paid at': '', 'Fulfilled at': '' }),
    ]);
    expect(lines).toHaveLength(0);
    expect(ordersWithoutDate).toEqual(['#1001']);
  });

  it('a Created at hiányában a Paid at dátumot használja', () => {
    const { lines } = parseShopifyOrderCsv([
      header({ 'Created at': '', 'Paid at': '2026-05-14 09:12:33 +0200' }),
    ]);
    expect(lines).toHaveLength(1);
  });

  it('az oszlopneveket kis/nagybetűtől függetlenül olvassa', () => {
    const { lines } = parseShopifyOrderCsv([
      {
        name: '#2002',
        'created at': '2026-05-14 09:12:33 +0200',
        'lineitem quantity': '3',
        'lineitem name': 'Maci',
      },
    ]);
    expect(lines[0].quantity).toBe(3);
  });
});

describe('titleVariants', () => {
  it('a variáns nélküli alakot is visszaadja', () => {
    expect(titleVariants('Bagoly ZsanillaBox - Kék')).toEqual([
      'Bagoly ZsanillaBox - Kék',
      'Bagoly ZsanillaBox',
    ]);
  });

  it('gondolatjelet is kezel', () => {
    expect(titleVariants('Maci – Rózsaszín')).toContain('Maci');
  });

  it('elválasztó nélkül csak önmagát adja', () => {
    expect(titleVariants('Bagoly')).toEqual(['Bagoly']);
  });
});
