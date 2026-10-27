import { describe, it, expect } from 'vitest';
import {
  getIstDateRange,
  formatIstDate,
  formatInr,
  serializeReportData,
  IST_OFFSET_MS,
} from '@/lib/reports';
import { Decimal } from 'decimal.js';

describe('Reports Foundation — IST Date, Timezone & Fiscal Year Boundaries', () => {
  it('correctly calculates MTD date range in Indian Standard Time (UTC+05:30)', () => {
    // Reference date: 26 October 2026 at 21:11 IST
    const refDate = new Date('2026-10-26T21:11:00+05:30');
    const range = getIstDateRange({ date: refDate, type: 'MTD' });

    // 1st Oct 2026 00:00:00.000 IST == 30th Sep 2026 18:30:00.000 UTC
    expect(range.startDate.toISOString()).toBe('2026-09-30T18:30:00.000Z');

    // 31st Oct 2026 23:59:59.999 IST == 31st Oct 2026 18:29:59.999 UTC
    expect(range.endDate.toISOString()).toBe('2026-10-31T18:29:59.999Z');

    expect(range.fiscalYear).toBe('2026-2027');
  });

  it('correctly calculates Indian Financial Year date range (April 1 to March 31)', () => {
    // Reference date: 15 October 2026
    const refDate = new Date('2026-10-15T10:00:00+05:30');
    const range = getIstDateRange({ date: refDate, type: 'FY' });

    // 1st April 2026 00:00:00.000 IST == 31st March 2026 18:30:00.000 UTC
    expect(range.startDate.toISOString()).toBe('2026-03-31T18:30:00.000Z');

    // 31st March 2027 23:59:59.999 IST == 31st March 2027 18:29:59.999 UTC
    expect(range.endDate.toISOString()).toBe('2027-03-31T18:29:59.999Z');

    expect(range.fiscalYear).toBe('2026-2027');
  });

  it('handles January date in the same Indian Financial Year', () => {
    // Reference date: 15 January 2027 (still FY 2026-2027)
    const refDate = new Date('2027-01-15T12:00:00+05:30');
    const range = getIstDateRange({ date: refDate, type: 'FY' });

    expect(range.fiscalYear).toBe('2026-2027');
    expect(range.startDate.toISOString()).toBe('2026-03-31T18:30:00.000Z');
    expect(range.endDate.toISOString()).toBe('2027-03-31T18:29:59.999Z');
  });

  it('handles month-end boundary on leap year February', () => {
    // Leap year February 2028 (29 days)
    const refDate = new Date('2028-02-10T12:00:00+05:30');
    const range = getIstDateRange({ date: refDate, type: 'MTD' });

    // 1st Feb 2028 00:00:00.000 IST == 31st Jan 2028 18:30:00.000 UTC
    expect(range.startDate.toISOString()).toBe('2028-01-31T18:30:00.000Z');

    // 29th Feb 2028 23:59:59.999 IST == 29th Feb 2028 18:29:59.999 UTC
    expect(range.endDate.toISOString()).toBe('2028-02-29T18:29:59.999Z');
  });

  it('handles TODAY date range for a single day in IST', () => {
    const refDate = new Date('2026-10-26T15:30:00+05:30');
    const range = getIstDateRange({ date: refDate, type: 'TODAY' });

    // 26th Oct 00:00:00.000 IST == 25th Oct 18:30:00.000 UTC
    expect(range.startDate.toISOString()).toBe('2026-10-25T18:30:00.000Z');

    // 26th Oct 23:59:59.999 IST == 26th Oct 18:29:59.999 UTC
    expect(range.endDate.toISOString()).toBe('2026-10-26T18:29:59.999Z');
  });

  it('validates custom date ranges correctly', () => {
    const from = '2026-10-01T00:00:00.000Z';
    const to = '2026-10-15T23:59:59.999Z';
    const range = getIstDateRange({ type: 'CUSTOM', from, to });

    expect(range.startDate.toISOString()).toBe(from);
    expect(range.endDate.toISOString()).toBe(to);

    expect(() =>
      getIstDateRange({ type: 'CUSTOM', from: '2026-10-20', to: '2026-10-10' })
    ).toThrow("'from' date cannot be after 'to' date.");
  });

  it('correctly interprets date-only string in YYYY-MM-DD as full IST calendar day boundaries (F-05)', () => {
    // Custom date-only strings representing 1st Oct to 25th Oct 2026 in IST
    const range = getIstDateRange({
      type: 'CUSTOM',
      from: '2026-10-01',
      to: '2026-10-25',
    });

    // Start: 2026-10-01 00:00:00.000 IST == 2026-09-30 18:30:00.000 UTC
    expect(range.startDate.toISOString()).toBe('2026-09-30T18:30:00.000Z');

    // End: 2026-10-25 23:59:59.999 IST == 2026-10-25 18:29:59.999 UTC
    expect(range.endDate.toISOString()).toBe('2026-10-25T18:29:59.999Z');

    // Midnight transaction at the beginning of the end date in IST (2026-10-25 00:00:00.000 IST)
    const midnightOnEndDate = new Date('2026-10-25T00:00:00.000+05:30');
    expect(midnightOnEndDate.getTime()).toBeGreaterThanOrEqual(range.startDate.getTime());
    expect(midnightOnEndDate.getTime()).toBeLessThanOrEqual(range.endDate.getTime());

    // Late evening transaction on the end date in IST (2026-10-25 21:45:00.000 IST)
    const eveningTxOnEndDate = new Date('2026-10-25T21:45:00.000+05:30');
    expect(eveningTxOnEndDate.getTime()).toBeGreaterThanOrEqual(range.startDate.getTime());
    expect(eveningTxOnEndDate.getTime()).toBeLessThanOrEqual(range.endDate.getTime());

    // Transaction after the end date in IST (2026-10-26 00:00:01.000 IST)
    const nextDayTx = new Date('2026-10-26T00:00:01.000+05:30');
    expect(nextDayTx.getTime()).toBeGreaterThan(range.endDate.getTime());

    // Explicit ISO timestamp does not have IST offset double applied
    const explicitIsoRange = getIstDateRange({
      type: 'CUSTOM',
      from: '2026-10-01T04:00:00.000Z',
      to: '2026-10-25T20:00:00.000Z',
    });
    expect(explicitIsoRange.startDate.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(explicitIsoRange.endDate.toISOString()).toBe('2026-10-25T20:00:00.000Z');
  });

  it('formats dates consistently in Indian Standard Time (IST)', () => {
    // 26 Oct 2026 14:30 IST
    const date = new Date('2026-10-26T09:00:00.000Z'); // 09:00 UTC == 14:30 IST
    const formattedDateOnly = formatIstDate(date);
    expect(formattedDateOnly).toBe('26 Oct 2026');

    const formattedWithTime = formatIstDate(date, true);
    expect(formattedWithTime).toContain('26 Oct 2026');
    expect(formattedWithTime).toContain('02:30');
    expect(formattedWithTime).toContain('pm');
  });

  it('formats INR currency with Indian comma separators', () => {
    expect(formatInr('7811804.50')).toBe('₹78,11,804.50');
    expect(formatInr(new Decimal('13250'))).toBe('₹13,250.00');
    expect(formatInr(0)).toBe('₹0.00');
  });

  it('safely serializes Prisma Decimal instances across server/client boundary', () => {
    const rawData = {
      grossSales: new Decimal('7811804.50'),
      netWeight: new Decimal('79.500'),
      nested: {
        amount: new Decimal('15000.00'),
        count: 5,
        status: 'COMPLETED',
      },
      list: [
        { price: new Decimal('500.25') },
        { price: new Decimal('1200.75') },
      ],
      nullValue: null,
      undefinedValue: undefined,
    };

    const serialized = serializeReportData(rawData);

    expect(typeof serialized.grossSales).toBe('string');
    expect(serialized.grossSales).toBe('7811804.5');
    expect(typeof serialized.nested.amount).toBe('string');
    expect(serialized.nested.amount).toBe('15000');
    expect(serialized.nested.count).toBe(5);
    expect(serialized.list[0].price).toBe('500.25');
  });
});
