import { describe, it, expect } from 'vitest';
import { getIndicativePrice, INDICATIVE_DAILY_RATES } from '@/lib/indicative-pricing';

describe('Suvarna Indicative Pricing Utility', () => {
  it('displays valid static tag price when priceAmount is explicitly recorded on ornament', () => {
    const ornament = {
      priceAmount: '230000.00',
      netWeight: '18.000',
      purity: '22K',
      metalType: 'GOLD',
      makingChargeType: 'PER_GRAM',
      makingChargeValue: '750.00',
    };

    const result = getIndicativePrice(ornament);

    expect(result.hasPrice).toBe(true);
    expect(result.source).toBe('TAG_PRICE');
    expect(result.label).toBe('Tag Estimate');
    expect(result.amount).toBe('230000.00');
    expect(result.formattedPrice).toBe('₹2,30,000.00');
  });

  it('calculates live indicative price from active daily rate when priceAmount is omitted but required inputs are present (PER_GRAM)', () => {
    // 10g 22K gold @ ₹12,150/g = ₹1,21,500 metal. Making @ ₹800/g = ₹8,000. Total = ₹1,29,500.00
    const ornament = {
      priceAmount: null,
      netWeight: '10.000',
      purity: '22K',
      metalType: 'GOLD',
      makingChargeType: 'PER_GRAM',
      makingChargeValue: '800.00',
    };

    const result = getIndicativePrice(ornament);

    expect(result.hasPrice).toBe(true);
    expect(result.source).toBe('CALCULATED_ESTIMATE');
    expect(result.label).toBe('Live Indicative');
    expect(result.amount).toBe('129500.00');
    expect(result.formattedPrice).toBe('₹1,29,500.00');
  });

  it('calculates live indicative price with PERCENTAGE making charges', () => {
    // 20g 24K gold @ ₹13,250/g = ₹2,65,000. Making 10% = ₹26,500. Total = ₹2,91,500.00
    const ornament = {
      priceAmount: null,
      netWeight: '20.000',
      purity: '24K',
      metalType: 'GOLD',
      makingChargeType: 'PERCENTAGE',
      makingChargeValue: '10',
    };

    const result = getIndicativePrice(ornament);

    expect(result.hasPrice).toBe(true);
    expect(result.amount).toBe('291500.00');
    expect(result.formattedPrice).toBe('₹2,91,500.00');
  });

  it('calculates live indicative price with FLAT making charges', () => {
    // 8g 22K gold @ ₹12,150/g = ₹97,200. Making flat = ₹1,000. Total = ₹98,200.00
    const ornament = {
      priceAmount: null,
      netWeight: '8.000',
      purity: '22K',
      metalType: 'GOLD',
      makingChargeType: 'FLAT',
      makingChargeValue: '1000.00',
    };

    const result = getIndicativePrice(ornament);

    expect(result.hasPrice).toBe(true);
    expect(result.amount).toBe('98200.00');
    expect(result.formattedPrice).toBe('₹98,200.00');
  });

  it('returns Price unavailable with concise reason when making charges are not specified (does not fabricate 0)', () => {
    const ornament = {
      priceAmount: null,
      netWeight: '15.000',
      purity: '22K',
      metalType: 'GOLD',
      makingChargeType: null,
      makingChargeValue: null,
    };

    const result = getIndicativePrice(ornament);

    expect(result.hasPrice).toBe(false);
    expect(result.source).toBe('UNAVAILABLE');
    expect(result.formattedPrice).toBe('Price unavailable');
    expect(result.reason).toBe('Making charge not specified');
  });

  it('returns Price unavailable when net weight is missing or zero', () => {
    const ornamentMissingWeight = {
      priceAmount: null,
      netWeight: null,
      purity: '22K',
      metalType: 'GOLD',
      makingChargeType: 'PER_GRAM',
      makingChargeValue: '750.00',
    };

    const result = getIndicativePrice(ornamentMissingWeight);

    expect(result.hasPrice).toBe(false);
    expect(result.formattedPrice).toBe('Price unavailable');
    expect(result.reason).toBe('Missing net weight');
  });

  it('returns Price unavailable when bullion rate is missing for unknown purity', () => {
    const ornamentUnknownPurity = {
      priceAmount: null,
      netWeight: '12.000',
      purity: 'PLATINUM-950',
      metalType: 'PLATINUM',
      makingChargeType: 'PER_GRAM',
      makingChargeValue: '1200.00',
    };

    const result = getIndicativePrice(ornamentUnknownPurity);

    expect(result.hasPrice).toBe(false);
    expect(result.formattedPrice).toBe('Price unavailable');
    expect(result.reason).toBe('No daily rate for PLATINUM-950');
  });
});
