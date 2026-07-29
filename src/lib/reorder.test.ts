import { describe, expect, it } from 'vitest';
import {
  calcAvgDailyUsage,
  calcReorderPoint,
  calcSuggestedOrder,
  classifyAlert,
  daysOfStockLeft,
  explodeBom,
  roundQty,
  selectAlerts,
  stockStatus,
} from './reorder';

describe('calcAvgDailyUsage', () => {
  it('a teljes ablakkal oszt, nem csak a fogyásos napokkal', () => {
    expect(calcAvgDailyUsage(120, 60)).toBe(2);
  });

  it('nulla vagy negatív ablaknál 0-t ad vissza osztás helyett', () => {
    expect(calcAvgDailyUsage(120, 0)).toBe(0);
    expect(calcAvgDailyUsage(120, -5)).toBe(0);
  });

  it('a nettó negatív fogyást (több visszavételezés, mint felhasználás) 0-ra vágja', () => {
    expect(calcAvgDailyUsage(-30, 60)).toBe(0);
  });
});

describe('calcReorderPoint', () => {
  it('átlagfogyás * átfutási idő + puffer', () => {
    expect(calcReorderPoint({ avgDailyUsage: 2, leadTimeDays: 10, safetyBuffer: 5 })).toBe(25);
  });

  it('puffer nélkül is működik', () => {
    expect(calcReorderPoint({ avgDailyUsage: 0.5, leadTimeDays: 14, safetyBuffer: 0 })).toBe(7);
  });

  it('nincs fogyás → a rendelési pont a puffer', () => {
    expect(calcReorderPoint({ avgDailyUsage: 0, leadTimeDays: 14, safetyBuffer: 3 })).toBe(3);
  });
});

describe('calcSuggestedOrder', () => {
  it('az átfutási idő + tartaléknapok fogyását fedezi a meglévő készleten felül', () => {
    // 2/nap * (10 + 14) = 48 célkészlet, 20 van → 28 kell
    expect(
      calcSuggestedOrder({ avgDailyUsage: 2, leadTimeDays: 10, reserveDays: 14, currentStock: 20 }),
    ).toBe(28);
  });

  it('0-t ad, ha a készlet már fedezi az időszakot', () => {
    expect(
      calcSuggestedOrder({ avgDailyUsage: 2, leadTimeDays: 10, reserveDays: 14, currentStock: 60 }),
    ).toBe(0);
  });

  it('a biztonsági puffert is beleszámolja a célkészletbe', () => {
    expect(
      calcSuggestedOrder({
        avgDailyUsage: 2,
        leadTimeDays: 10,
        reserveDays: 14,
        currentStock: 20,
        safetyBuffer: 10,
      }),
    ).toBe(38);
  });

  it('felfelé kerekít a legkisebb rendelhető tételre', () => {
    // 28 kellene, de csak 10-esével lehet rendelni → 30
    expect(
      calcSuggestedOrder({
        avgDailyUsage: 2,
        leadTimeDays: 10,
        reserveDays: 14,
        currentStock: 20,
        orderMultiple: 10,
      }),
    ).toBe(30);
  });

  it('negatív készletnél (túlfogyás) a hiányt is pótolja', () => {
    expect(
      calcSuggestedOrder({ avgDailyUsage: 1, leadTimeDays: 10, reserveDays: 10, currentStock: -5 }),
    ).toBe(25);
  });
});

describe('stockStatus', () => {
  it('elfogyott készlet → kritikus', () => {
    expect(stockStatus(0, 25)).toBe('critical');
    expect(stockStatus(-3, 25)).toBe('critical');
  });

  it('rendelési pont alatt vagy azon → rendelni kell', () => {
    expect(stockStatus(25, 25)).toBe('reorder');
    expect(stockStatus(10, 25)).toBe('reorder');
  });

  it('a rendelési pont 30%-os sávjában → figyelmeztetés', () => {
    expect(stockStatus(30, 25)).toBe('warning');
    expect(stockStatus(32.5, 25)).toBe('warning');
  });

  it('bőven felette → rendben', () => {
    expect(stockStatus(100, 25)).toBe('ok');
  });

  it('nulla rendelési pontnál nincs sárga sáv', () => {
    expect(stockStatus(5, 0)).toBe('ok');
  });
});

describe('daysOfStockLeft', () => {
  it('készlet / napi fogyás', () => {
    expect(daysOfStockLeft(50, 2)).toBe(25);
  });

  it('null, ha nincs mérhető fogyás', () => {
    expect(daysOfStockLeft(50, 0)).toBeNull();
  });
});

describe('explodeBom', () => {
  const recipes = [
    { productId: 'bagoly', rawMaterialId: 'fonal-kek', quantityPerUnit: 1 },
    { productId: 'bagoly', rawMaterialId: 'szem-12mm', quantityPerUnit: 2 },
    { productId: 'maci', rawMaterialId: 'fonal-kek', quantityPerUnit: 0.5 },
    { productId: 'maci', rawMaterialId: 'tomoanyag', quantityPerUnit: 30 },
  ];

  it('egy tételt receptre bont', () => {
    const usage = explodeBom([{ productId: 'bagoly', quantity: 3 }], recipes);
    expect(usage.get('fonal-kek')).toBe(3);
    expect(usage.get('szem-12mm')).toBe(6);
  });

  it('több termék közös alapanyagát összevonja', () => {
    const usage = explodeBom(
      [
        { productId: 'bagoly', quantity: 2 },
        { productId: 'maci', quantity: 4 },
      ],
      recipes,
    );
    expect(usage.get('fonal-kek')).toBe(4); // 2*1 + 4*0.5
    expect(usage.get('szem-12mm')).toBe(4);
    expect(usage.get('tomoanyag')).toBe(120);
  });

  it('recept nélküli terméket kihagy, nem dob hibát', () => {
    const usage = explodeBom([{ productId: 'ismeretlen', quantity: 5 }], recipes);
    expect(usage.size).toBe(0);
  });

  it('a lebegőpontos maradékot lekerekíti', () => {
    const usage = explodeBom([{ productId: 'maci', quantity: 3 }], [
      { productId: 'maci', rawMaterialId: 'fonal', quantityPerUnit: 0.1 },
    ]);
    expect(usage.get('fonal')).toBe(0.3);
  });
});

describe('roundQty', () => {
  it('levágja a lebegőpontos szemetet', () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });
});

describe('classifyAlert', () => {
  const now = new Date('2026-07-29T08:00:00Z');
  const cand = { rawMaterialId: 'x', currentStock: 10 };

  it('korábbi riasztás nélkül új', () => {
    expect(classifyAlert(cand, undefined, 4, now)).toBe('new');
  });

  it('cooldownon belül, változatlan készlettel elnyomott', () => {
    const last = { sentAt: new Date('2026-07-28T08:00:00Z'), stockAtSend: 10 };
    expect(classifyAlert(cand, last, 4, now)).toBe('suppressed');
  });

  it('cooldownon belül is szól, ha tovább csökkent', () => {
    const last = { sentAt: new Date('2026-07-28T08:00:00Z'), stockAtSend: 15 };
    expect(classifyAlert(cand, last, 4, now)).toBe('decreased');
  });

  it('lejárt cooldown után újra szól', () => {
    const last = { sentAt: new Date('2026-07-20T08:00:00Z'), stockAtSend: 10 };
    expect(classifyAlert(cand, last, 4, now)).toBe('cooldown_expired');
  });

  it('a cooldown pontos határa már szól', () => {
    const last = { sentAt: new Date('2026-07-25T08:00:00Z'), stockAtSend: 10 };
    expect(classifyAlert(cand, last, 4, now)).toBe('cooldown_expired');
  });
});

describe('selectAlerts', () => {
  const now = new Date('2026-07-29T08:00:00Z');

  it('nem küld, ha minden tétel elnyomott', () => {
    const decision = selectAlerts(
      [{ rawMaterialId: 'a', currentStock: 10 }],
      new Map([['a', { sentAt: new Date('2026-07-28T08:00:00Z'), stockAtSend: 10 }]]),
      4,
      now,
    );
    expect(decision.shouldSend).toBe(false);
  });

  it('egyetlen új tétel az egész (aktuális) listát kiküldi', () => {
    const decision = selectAlerts(
      [
        { rawMaterialId: 'regi', currentStock: 10 },
        { rawMaterialId: 'uj', currentStock: 2 },
      ],
      new Map([['regi', { sentAt: new Date('2026-07-28T08:00:00Z'), stockAtSend: 10 }]]),
      4,
      now,
    );
    expect(decision.shouldSend).toBe(true);
    expect(decision.items).toHaveLength(2);
    expect(decision.triggers.map((t) => t.rawMaterialId)).toEqual(['uj']);
  });

  it('üres jelöltlistánál nem küld', () => {
    expect(selectAlerts([], new Map(), 4, now).shouldSend).toBe(false);
  });
});
