import { describe, it, expect } from 'vitest';
import { buybackService, BuybackValidationError } from '@/lib/buyback';
import { Decimal } from '@/lib/decimal';
import { INDICATIVE_DAILY_RATES, getIndicativePrice } from '@/lib/indicative-pricing';

describe('Unit: Buyback Valuation & Mathematical Engine', () => {
  it('correctly calculates gross metal value = net weight × buying rate and applies disclosed deductions', () => {
    // 25.000g gross, 1.000g stone = 24.000g net @ ₹11,500.00/g = ₹2,76,000.00
    // Deductions: ₹2,500.00 melting loss -> Net payable = ₹2,73,500.00
    const result = buybackService.calculateBuyback({
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '25.000',
      stoneWeight: '1.000',
      appliedRate: '11500.00',
      deductionAmount: '2500.00',
      deductionReason: 'Melting & assay refinement loss',
    });

    expect(result.grossWeight.toFixed(3)).toBe('25.000');
    expect(result.stoneWeight.toFixed(3)).toBe('1.000');
    expect(result.netWeight.toFixed(3)).toBe('24.000');
    expect(result.appliedRate.toFixed(2)).toBe('11500.00');
    expect(result.grossAmount.toFixed(2)).toBe('276000.00');
    expect(result.deductionAmount.toFixed(2)).toBe('2500.00');
    expect(result.deductionReason).toBe('Melting & assay refinement loss');
    expect(result.netPayable.toFixed(2)).toBe('273500.00');
    expect(result.isPanRequired).toBe(true); // > 2,00,000 threshold
  });

  it('calculates exact silver buyback with zero tare stone weight', () => {
    // 100.000g fine silver @ ₹150.00/g = ₹15,000.00
    const result = buybackService.calculateBuyback({
      metalType: 'SILVER',
      purity: 'SILVER',
      grossWeight: 100,
      stoneWeight: 0,
      appliedRate: 150,
    });

    expect(result.netWeight.toFixed(3)).toBe('100.000');
    expect(result.grossAmount.toFixed(2)).toBe('15000.00');
    expect(result.netPayable.toFixed(2)).toBe('15000.00');
    expect(result.deductionAmount.toFixed(2)).toBe('0.00');
    expect(result.isPanRequired).toBe(false);
  });

  it('rejects deduction when amount > 0 but deductionReason is missing', () => {
    expect(() =>
      buybackService.calculateBuyback({
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '10.000',
        appliedRate: '11500.00',
        deductionAmount: '500.00',
        // missing deductionReason
      })
    ).toThrowError(/specific reason must be disclosed/);
  });

  it('rejects deduction exceeding or equal to gross metal value', () => {
    expect(() =>
      buybackService.calculateBuyback({
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '1.000',
        appliedRate: '10000.00', // Gross = 10,000
        deductionAmount: '10000.00',
        deductionReason: 'Complete impurity loss',
      })
    ).toThrowError(/cannot exceed or equal gross metal value/);
  });

  it('rejects invalid or non-positive gross weight, negative stone weight, or zero rate', () => {
    expect(() =>
      buybackService.calculateBuyback({
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '0',
        appliedRate: '11000.00',
      })
    ).toThrowError(BuybackValidationError);

    expect(() =>
      buybackService.calculateBuyback({
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '-5.000',
        appliedRate: '11000.00',
      })
    ).toThrowError(BuybackValidationError);

    expect(() =>
      buybackService.calculateBuyback({
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '10.000',
        stoneWeight: '-1.000',
        appliedRate: '11000.00',
      })
    ).toThrowError(/cannot be negative/);

    expect(() =>
      buybackService.calculateBuyback({
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '10.000',
        stoneWeight: '10.000', // Net = 0
        appliedRate: '11000.00',
      })
    ).toThrowError(/net metal weight must be greater than zero/);

    expect(() =>
      buybackService.calculateBuyback({
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '10.000',
        appliedRate: '0.00',
      })
    ).toThrowError(/greater than zero/);
  });

  it('correctly flags Rule 114B PAN requirement for transactions > ₹2,00,000', () => {
    const belowThreshold = buybackService.calculateBuyback({
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '15.000',
      appliedRate: '11000.00', // ₹1,65,000
    });
    expect(belowThreshold.isPanRequired).toBe(false);

    const aboveThreshold = buybackService.calculateBuyback({
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '20.000',
      appliedRate: '11000.00', // ₹2,20,000
      customerPan: 'ABCDE1234F',
    });
    expect(aboveThreshold.isPanRequired).toBe(true);
    expect(aboveThreshold.isPanValid).toBe(true);

    const invalidPan = buybackService.calculateBuyback({
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '20.000',
      appliedRate: '11000.00',
      customerPan: 'invalid-pan',
    });
    expect(invalidPan.isPanRequired).toBe(true);
    expect(invalidPan.isPanValid).toBe(false);
  });

  it('ensures indicative POS selling rate calculations remain 100% unchanged', () => {
    const item = {
      priceAmount: null,
      netWeight: '10.000',
      purity: '22K',
      metalType: 'GOLD',
      makingChargeType: 'PERCENTAGE',
      makingChargeValue: '12',
    };

    // Standard POS selling rates from baseline
    const posPrice = getIndicativePrice(item, INDICATIVE_DAILY_RATES);
    expect(posPrice.hasPrice).toBe(true);
    // 10.000g * 12150 = 1,21,500. MC = 12% = 14,580. Total = 1,36,080
    expect(posPrice.amount).toBe('136080.00');
  });
});
