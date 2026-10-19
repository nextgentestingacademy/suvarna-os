import { describe, it, expect } from 'vitest';
import { CurrencyMath, Decimal } from '@/lib/decimal';

describe('CurrencyMath — Precision Arithmetic for Jewellery Retail', () => {
  it('eliminates floating point rounding errors on decimal addition', () => {
    // In standard IEEE 754 float: 0.1 + 0.2 === 0.30000000000000004
    const floatSum = 0.1 + 0.2;
    expect(floatSum).not.toBe(0.3);

    // Using CurrencyMath
    const safeSum = CurrencyMath.add(['0.1', '0.2']);
    expect(safeSum.equals(new Decimal('0.3'))).toBe(true);
    expect(safeSum.toFixed(2)).toBe('0.30');
  });

  it('calculates metal value accurately by weight and gram rate', () => {
    // 38.450 grams of 22K gold @ ₹12,150.75 per gram
    const weightGrams = '38.450';
    const ratePerGram = '12150.75';
    const value = CurrencyMath.metalValue(weightGrams, ratePerGram);

    // 38.450 * 12150.75 = 467196.3375 -> rounded to 2 decimals = 467196.34
    expect(value.toFixed(2)).toBe('467196.34');
    expect(CurrencyMath.formatInr(value)).toBe('₹4,67,196.34');
  });

  it('calculates pure gold content based on standard karat factor', () => {
    // 24.000g of 22K gold: 24 * (22/24) = 22.000g
    const pure22k = CurrencyMath.pureWeight('24.000', 22);
    expect(pure22k.toFixed(3)).toBe('22.000');

    // 24.000g of 18K gold: 24 * (18/24) = 18.000g
    const pure18k = CurrencyMath.pureWeight('24.000', 18);
    expect(pure18k.toFixed(3)).toBe('18.000');
  });

  it('computes 3% Indian GST with exact 1.5% CGST and 1.5% SGST split', () => {
    const taxableAmount = '100000.00';
    const breakdown = CurrencyMath.calculateGstBreakdown(taxableAmount, '3.0');

    expect(breakdown.taxableAmount).toBe('100000.00');
    expect(breakdown.cgstRate).toBe('1.50');
    expect(breakdown.cgstAmount).toBe('1500.00');
    expect(breakdown.sgstRate).toBe('1.50');
    expect(breakdown.sgstAmount).toBe('1500.00');
    expect(breakdown.totalTax).toBe('3000.00');
    expect(breakdown.grandTotal).toBe('103000.00');
  });

  it('formats currency according to the Indian Numbering System', () => {
    expect(CurrencyMath.formatInr('1000')).toBe('₹1,000.00');
    expect(CurrencyMath.formatInr('125000')).toBe('₹1,25,000.00');
    expect(CurrencyMath.formatInr('1456789.50')).toBe('₹14,56,789.50');
    expect(CurrencyMath.formatInr('10000000')).toBe('₹1,00,00,000.00'); // 1 Crore
  });

  it('formats gram weights to 3 decimal places', () => {
    expect(CurrencyMath.formatGrams('5')).toBe('5.000 g');
    expect(CurrencyMath.formatGrams('12.4')).toBe('12.400 g');
    expect(CurrencyMath.formatGrams('38.456')).toBe('38.456 g');
  });
});
