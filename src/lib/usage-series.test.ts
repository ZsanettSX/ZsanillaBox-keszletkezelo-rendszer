import { describe, expect, it } from 'vitest';
import { bucketFor, bucketStart, buildUsageSeries } from './usage-series';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('bucketFor', () => {
  it('rövid időszakon napi bontás', () => {
    expect(bucketFor(30)).toBe('day');
  });

  it('néhány hónapon heti bontás', () => {
    expect(bucketFor(90)).toBe('week');
    expect(bucketFor(180)).toBe('week');
  });

  it('egy éven havi bontás', () => {
    expect(bucketFor(365)).toBe('month');
  });
});

describe('bucketStart', () => {
  it('a hetet hétfőre kerekíti', () => {
    // 2026-07-29 szerda → 2026-07-27 hétfő
    expect(bucketStart(d('2026-07-29'), 'week').toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });

  it('a vasárnapot az azt megelőző hétfőhöz sorolja', () => {
    expect(bucketStart(d('2026-08-02'), 'week').toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });

  it('a hónapot a hónap elsejére kerekíti', () => {
    expect(bucketStart(d('2026-07-29'), 'month').toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('buildUsageSeries', () => {
  it('naponta összegzi a fogyást', () => {
    const series = buildUsageSeries(
      [
        { date: d('2026-07-27'), quantityUsed: 2 },
        { date: d('2026-07-27'), quantityUsed: 3 },
        { date: d('2026-07-29'), quantityUsed: 1 },
      ],
      d('2026-07-27'),
      d('2026-07-29'),
      'day',
    );

    expect(series.map((p) => p.total)).toEqual([5, 0, 1]);
  });

  it('a fogyás nélküli időszakot 0-val tölti ki, nem hagyja ki', () => {
    const series = buildUsageSeries([], d('2026-07-01'), d('2026-07-05'), 'day');
    expect(series).toHaveLength(5);
    expect(series.every((p) => p.total === 0)).toBe(true);
  });

  it('hetekbe vonja össze a napokat', () => {
    const series = buildUsageSeries(
      [
        { date: d('2026-07-27'), quantityUsed: 2 },
        { date: d('2026-07-30'), quantityUsed: 4 },
        { date: d('2026-08-04'), quantityUsed: 1 },
      ],
      d('2026-07-27'),
      d('2026-08-04'),
      'week',
    );

    expect(series).toHaveLength(2);
    expect(series[0].total).toBe(6);
    expect(series[1].total).toBe(1);
  });

  it('hónapfordulón is helyesen lép tovább', () => {
    const series = buildUsageSeries([], d('2026-11-15'), d('2027-02-03'), 'month');
    expect(series.map((p) => p.key)).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
  });

  it('a lebegőpontos összeadás maradékát lekerekíti', () => {
    const series = buildUsageSeries(
      [
        { date: d('2026-07-27'), quantityUsed: 0.1 },
        { date: d('2026-07-27'), quantityUsed: 0.2 },
      ],
      d('2026-07-27'),
      d('2026-07-27'),
      'day',
    );
    expect(series[0].total).toBe(0.3);
  });

  it('fordított dátumhatároknál sem pörög végtelenbe', () => {
    expect(buildUsageSeries([], d('2026-08-01'), d('2026-07-01'), 'day')).toEqual([]);
  });
});
