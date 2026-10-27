import { describe, it, expect } from 'vitest';
import {
  calculateLineItemPricing,
  calculateInvoiceTotals,
  getIndianFiscalYear,
  isValidPan,
  BillingValidationError,
  TaxConfiguration,
  LineItemPricingInput,
  PaymentInput,
  DEFAULT_JEWELLERY_TAX_POLICY,
} from '@/lib/billing';
import { Decimal } from '@/lib/decimal';

describe('Suvarna Milestone 3A — Pure Billing Calculations & Validation Unit Tests', () => {
  const intraStateTaxConfig: TaxConfiguration = {
    taxRatePercent: '3.0',
    isInterState: false,
  };

  const interStateTaxConfig: TaxConfiguration = {
    taxRatePercent: '3.0',
    isInterState: true,
  };

  describe('1. Line Item Pricing Modes & Weight Mathematics', () => {
    it('accurately calculates weight-based pricing with per-gram making charge', () => {
      // 10.500g gross, 0.500g stone -> 10.000g net
      // Rate: ₹7,000/g -> Metal: ₹70,000.00
      // Making charge: ₹600/g -> ₹6,000.00
      // Stone charge: ₹1,500.00
      // Pre-tax taxable: 70,000 + 6,000 + 1,500 = ₹77,500.00
      // GST: 3% of 77,500 = ₹2,325.00
      // Line Total: ₹79,825.00
      const input: LineItemPricingInput = {
        ornamentId: 'orn-1',
        pricingMode: 'WEIGHT_BASED',
        grossWeight: '10.500',
        stoneWeight: '0.500',
        ratePerGram: '7000.00',
        makingChargeType: 'PER_GRAM',
        makingChargeRate: '600.00',
        stoneCharges: '1500.00',
      };

      const result = calculateLineItemPricing(input, intraStateTaxConfig);

      expect(result.netWeight.toString()).toBe('10');
      expect(result.netWeight.toFixed(3)).toBe('10.000');
      expect(result.metalValue.toFixed(2)).toBe('70000.00');
      expect(result.makingChargeAmount.toFixed(2)).toBe('6000.00');
      expect(result.stoneCharges.toFixed(2)).toBe('1500.00');
      expect(result.taxableAmount.toFixed(2)).toBe('77500.00');
      expect(result.gstAmount.toFixed(2)).toBe('2325.00');
      expect(result.totalAmount.toFixed(2)).toBe('79825.00');
    });

    it('accurately calculates percentage-based making charge on metal value', () => {
      // 20.000g net @ ₹7,500/g = ₹1,50,000.00
      // Making charge: 12% = 1,50,000 * 0.12 = ₹18,000.00
      // Taxable: ₹1,68,000.00
      // GST: 3% = ₹5,040.00
      // Total: ₹1,73,040.00
      const input: LineItemPricingInput = {
        ornamentId: 'orn-2',
        pricingMode: 'WEIGHT_BASED',
        grossWeight: '20.000',
        stoneWeight: '0.000',
        ratePerGram: '7500.00',
        makingChargeType: 'PERCENTAGE',
        makingChargeRate: '12.00',
      };

      const result = calculateLineItemPricing(input, intraStateTaxConfig);

      expect(result.metalValue.toFixed(2)).toBe('150000.00');
      expect(result.makingChargeAmount.toFixed(2)).toBe('18000.00');
      expect(result.taxableAmount.toFixed(2)).toBe('168000.00');
      expect(result.gstAmount.toFixed(2)).toBe('5040.00');
      expect(result.totalAmount.toFixed(2)).toBe('173040.00');
    });

    it('accurately calculates fixed flat making charge', () => {
      // 5.000g net @ ₹8,000/g = ₹40,000.00
      // Making charge: Flat ₹3,500.00
      // Taxable: ₹43,500.00
      const input: LineItemPricingInput = {
        ornamentId: 'orn-3',
        pricingMode: 'WEIGHT_BASED',
        grossWeight: '5.000',
        ratePerGram: '8000.00',
        makingChargeType: 'FIXED',
        makingChargeRate: '3500.00',
      };

      const result = calculateLineItemPricing(input, intraStateTaxConfig);

      expect(result.makingChargeAmount.toFixed(2)).toBe('3500.00');
      expect(result.taxableAmount.toFixed(2)).toBe('43500.00');
    });

    it('calculates fixed-price item mode correctly', () => {
      // Fixed selling price of ₹85,000.00 with ₹2,000.00 stone charge
      const input: LineItemPricingInput = {
        ornamentId: 'orn-fixed',
        pricingMode: 'FIXED_PRICE',
        grossWeight: '12.000',
        fixedPrice: '85000.00',
        makingChargeType: 'FIXED',
        makingChargeRate: '0.00',
        stoneCharges: '2000.00',
      };

      const result = calculateLineItemPricing(input, intraStateTaxConfig);

      expect(result.metalValue.toFixed(2)).toBe('85000.00');
      expect(result.taxableAmount.toFixed(2)).toBe('87000.00');
      expect(result.gstAmount.toFixed(2)).toBe('2610.00');
      expect(result.totalAmount.toFixed(2)).toBe('89610.00');
    });

    it('applies line-item discount and deducts from taxable amount', () => {
      // 10.000g @ ₹7,000 = ₹70,000 + ₹5,000 MC = ₹75,000
      // Discount: ₹2,500
      // Taxable: ₹72,500.00
      // 3% GST: ₹2,175.00
      // Total: ₹74,675.00
      const input: LineItemPricingInput = {
        ornamentId: 'orn-disc',
        grossWeight: '10.000',
        ratePerGram: '7000.00',
        makingChargeType: 'FIXED',
        makingChargeRate: '5000.00',
        itemDiscount: '2500.00',
      };

      const result = calculateLineItemPricing(input, intraStateTaxConfig);

      expect(result.itemDiscount.toFixed(2)).toBe('2500.00');
      expect(result.taxableAmount.toFixed(2)).toBe('72500.00');
      expect(result.gstAmount.toFixed(2)).toBe('2175.00');
      expect(result.totalAmount.toFixed(2)).toBe('74675.00');
    });
  });

  describe('2. Line Item Input Validation Guards', () => {
    it('rejects zero or negative gross weight', () => {
      expect(() =>
        calculateLineItemPricing(
          { ornamentId: 'orn-x', grossWeight: '0.000', ratePerGram: '7000' },
          intraStateTaxConfig
        )
      ).toThrowError(/Gross weight must be greater than zero/);

      expect(() =>
        calculateLineItemPricing(
          { ornamentId: 'orn-x', grossWeight: '-5.000', ratePerGram: '7000' },
          intraStateTaxConfig
        )
      ).toThrowError(/Gross weight must be greater than zero/);
    });

    it('rejects negative stone weight', () => {
      expect(() =>
        calculateLineItemPricing(
          { ornamentId: 'orn-x', grossWeight: '10.000', stoneWeight: '-1.000', ratePerGram: '7000' },
          intraStateTaxConfig
        )
      ).toThrowError(/Stone weight cannot be negative/);
    });

    it('rejects stone weight exceeding gross weight', () => {
      expect(() =>
        calculateLineItemPricing(
          { ornamentId: 'orn-x', grossWeight: '10.000', stoneWeight: '12.000', ratePerGram: '7000' },
          intraStateTaxConfig
        )
      ).toThrowError(/Stone weight cannot exceed gross weight/);
    });

    it('rejects missing or non-positive rate per gram in weight-based mode', () => {
      expect(() =>
        calculateLineItemPricing(
          { ornamentId: 'orn-x', grossWeight: '10.000', ratePerGram: '0' },
          intraStateTaxConfig
        )
      ).toThrowError(/Metal rate per gram must be greater than zero/);
    });

    it('rejects line item discount exceeding pre-discount price', () => {
      expect(() =>
        calculateLineItemPricing(
          {
            ornamentId: 'orn-x',
            grossWeight: '10.000',
            ratePerGram: '7000',
            itemDiscount: '80000.00', // exceeds 70,000
          },
          intraStateTaxConfig
        )
      ).toThrowError(/Line item discount cannot exceed total item price/);
    });
  });

  describe('3. Invoice Totals, Intra-State vs Inter-State Tax, and Rounding', () => {
    const item1 = calculateLineItemPricing(
      {
        ornamentId: 'orn-1',
        grossWeight: '10.000',
        ratePerGram: '7000.00',
        makingChargeType: 'FIXED',
        makingChargeRate: '3000.00',
      },
      intraStateTaxConfig
    ); // Taxable: 73,000

    const item2 = calculateLineItemPricing(
      {
        ornamentId: 'orn-2',
        grossWeight: '5.000',
        ratePerGram: '7000.00',
        makingChargeType: 'FIXED',
        makingChargeRate: '2000.00',
      },
      intraStateTaxConfig
    ); // Taxable: 37,000

    it('computes intra-state GST with 1.5% CGST and 1.5% SGST split', () => {
      // Subtotal: 73,000 + 37,000 = ₹1,10,000.00
      // CGST: 1.5% = ₹1,650.00
      // SGST: 1.5% = ₹1,650.00
      // Total Tax: ₹3,300.00
      // Grand Total: ₹1,13,300.00
      const totals = calculateInvoiceTotals([item1, item2], [], 0, intraStateTaxConfig);

      expect(totals.subtotal.toFixed(2)).toBe('110000.00');
      expect(totals.isInterState).toBe(false);
      expect(totals.cgstAmount.toFixed(2)).toBe('1650.00');
      expect(totals.sgstAmount.toFixed(2)).toBe('1650.00');
      expect(totals.igstAmount.toFixed(2)).toBe('0.00');
      expect(totals.totalTax.toFixed(2)).toBe('3300.00');
      expect(totals.grandTotal.toFixed(2)).toBe('113300.00');
      expect(totals.paymentStatus).toBe('UNPAID');
      expect(totals.balanceAmount.toFixed(2)).toBe('113300.00');
    });

    it('computes inter-state GST with 3.0% IGST', () => {
      const totals = calculateInvoiceTotals([item1, item2], [], 0, interStateTaxConfig);

      expect(totals.isInterState).toBe(true);
      expect(totals.cgstAmount.toFixed(2)).toBe('0.00');
      expect(totals.sgstAmount.toFixed(2)).toBe('0.00');
      expect(totals.igstAmount.toFixed(2)).toBe('3300.00');
      expect(totals.totalTax.toFixed(2)).toBe('3300.00');
      expect(totals.grandTotal.toFixed(2)).toBe('113300.00');
    });

    it('applies invoice-level discount and recalculates tax on net taxable amount', () => {
      // Subtotal: ₹1,10,000.00
      // Invoice Discount: ₹5,000.00
      // Taxable: ₹1,05,000.00
      // CGST 1.5%: ₹1,575.00, SGST 1.5%: ₹1,575.00 -> Total Tax: ₹3,150.00
      // Grand Total: ₹1,08,150.00
      const totals = calculateInvoiceTotals([item1, item2], [], '5000.00', intraStateTaxConfig);

      expect(totals.discountAmount.toFixed(2)).toBe('5000.00');
      expect(totals.taxableAmount.toFixed(2)).toBe('105000.00');
      expect(totals.totalTax.toFixed(2)).toBe('3150.00');
      expect(totals.grandTotal.toFixed(2)).toBe('108150.00');
    });

    it('applies half-up rounding adjustment to nearest rupee', () => {
      // Item with odd paise: Taxable ₹10,001.25
      // 3% GST: 300.0375 -> ₹300.04 (CGST: 150.02, SGST: 150.02)
      // Unrounded: ₹10,301.29
      // Rounded: ₹10,301.00
      // RoundOff: -0.29
      const itemOdd = calculateLineItemPricing(
        { ornamentId: 'orn-odd', grossWeight: '1.42875', ratePerGram: '7000' },
        intraStateTaxConfig
      );
      const totals = calculateInvoiceTotals([itemOdd], [], 0, intraStateTaxConfig);

      expect(totals.grandTotal.modulo(1).isZero()).toBe(true);
      expect(totals.grandTotal.minus(totals.roundOff).toFixed(2)).toBe(
        totals.taxableAmount.plus(totals.totalTax).toFixed(2)
      );
    });
  });

  describe('4. Payment Balances & Overpayment Protection', () => {
    const item = calculateLineItemPricing(
      { ornamentId: 'orn-p', grossWeight: '10.000', ratePerGram: '7000' },
      intraStateTaxConfig
    ); // Taxable: 70,000, Tax: 2,100, Total: 72,100

    it('marks full payment as PAID with zero balance', () => {
      const payments: PaymentInput[] = [
        { paymentMethod: 'UPI', amount: '50000.00' },
        { paymentMethod: 'CARD', amount: '22100.00' },
      ];

      const totals = calculateInvoiceTotals([item], payments, 0, intraStateTaxConfig);

      expect(totals.paidAmount.toFixed(2)).toBe('72100.00');
      expect(totals.balanceAmount.toFixed(2)).toBe('0.00');
      expect(totals.paymentStatus).toBe('PAID');
    });

    it('marks partial payment with correct outstanding balance', () => {
      const payments: PaymentInput[] = [{ paymentMethod: 'CASH', amount: '25000.00' }];

      const totals = calculateInvoiceTotals([item], payments, 0, intraStateTaxConfig);

      expect(totals.paidAmount.toFixed(2)).toBe('25000.00');
      expect(totals.balanceAmount.toFixed(2)).toBe('47100.00');
      expect(totals.paymentStatus).toBe('PARTIAL');
    });

    it('rejects overpayment exceeding grand total', () => {
      const overpayments: PaymentInput[] = [{ paymentMethod: 'CASH', amount: '75000.00' }];

      expect(() => calculateInvoiceTotals([item], overpayments, 0, intraStateTaxConfig)).toThrowError(
        /Total payments .* cannot exceed invoice grand total/
      );
    });

    it('rejects non-positive payment amounts', () => {
      expect(() =>
        calculateInvoiceTotals([item], [{ paymentMethod: 'CASH', amount: '0.00' }], 0, intraStateTaxConfig)
      ).toThrowError(/Payment amount must be greater than zero/);

      expect(() =>
        calculateInvoiceTotals([item], [{ paymentMethod: 'CASH', amount: '-500.00' }], 0, intraStateTaxConfig)
      ).toThrowError(/Payment amount must be greater than zero/);
    });
  });

  describe('5. Regulatory Helpers & Indian Fiscal Year', () => {
    it('validates Indian PAN card format accurately', () => {
      expect(isValidPan('ABCDE1234F')).toBe(true);
      expect(isValidPan('abcde1234f')).toBe(true); // case-insensitive trimmed
      expect(isValidPan('ABCDE12345')).toBe(false); // last char must be letter
      expect(isValidPan('12345ABCDE')).toBe(false);
      expect(isValidPan('ABCD1234F')).toBe(false); // 4 letters instead of 5
      expect(isValidPan('')).toBe(false);
    });

    it('correctly calculates Indian fiscal year', () => {
      // April 2026 -> 2026-2027
      const apr2026 = new Date(2026, 3, 15);
      expect(getIndianFiscalYear(apr2026)).toBe('2026-2027');

      // October 2026 -> 2026-2027
      const oct2026 = new Date(2026, 9, 23);
      expect(getIndianFiscalYear(oct2026)).toBe('2026-2027');

      // January 2027 -> 2026-2027
      const jan2027 = new Date(2027, 0, 10);
      expect(getIndianFiscalYear(jan2027)).toBe('2026-2027');

      // March 31, 2027 -> 2026-2027
      const mar2027 = new Date(2027, 2, 31);
      expect(getIndianFiscalYear(mar2027)).toBe('2026-2027');

      // April 1, 2027 -> 2027-2028
      const apr2027 = new Date(2027, 3, 1);
      expect(getIndianFiscalYear(apr2027)).toBe('2027-2028');
    });
  });

  describe('6. Complete Jewellery Pricing Formula & Tax Policy Verification', () => {
    it('verifies DEFAULT_JEWELLERY_TAX_POLICY configuration values', () => {
      expect(DEFAULT_JEWELLERY_TAX_POLICY.hsnCode).toBe('7113');
      expect(DEFAULT_JEWELLERY_TAX_POLICY.standardGstRatePercent.toFixed(1)).toBe('3.0');
      expect(DEFAULT_JEWELLERY_TAX_POLICY.intraStateSplit.cgstPercent.toFixed(1)).toBe('1.5');
      expect(DEFAULT_JEWELLERY_TAX_POLICY.intraStateSplit.sgstPercent.toFixed(1)).toBe('1.5');
      expect(DEFAULT_JEWELLERY_TAX_POLICY.interStateGstPercent.toFixed(1)).toBe('3.0');
      expect(DEFAULT_JEWELLERY_TAX_POLICY.panMandatoryThreshold.toFixed(2)).toBe('200000.00');
    });

    it('reconciles comprehensive formula: metalValue + makingCharges + stoneCharges - itemDiscount', () => {
      // 18.250g gross - 1.250g stone = 17.000g net @ ₹7,200/g = ₹1,22,400.00
      // Making charge: 10% on metal = ₹12,240.00
      // Stone charge: ₹4,500.00
      // Line item discount: ₹1,140.00
      // Taxable = 1,22,400 + 12,240 + 4,500 - 1,140 = ₹1,38,000.00
      // GST 3% = ₹4,140.00
      // Total = ₹1,42,140.00
      const item = calculateLineItemPricing(
        {
          ornamentId: 'orn-comp',
          grossWeight: '18.250',
          stoneWeight: '1.250',
          ratePerGram: '7200.00',
          makingChargeType: 'PERCENTAGE',
          makingChargeRate: '10.00',
          stoneCharges: '4500.00',
          itemDiscount: '1140.00',
        },
        intraStateTaxConfig
      );

      expect(item.netWeight.toFixed(3)).toBe('17.000');
      expect(item.metalValue.toFixed(2)).toBe('122400.00');
      expect(item.makingChargeAmount.toFixed(2)).toBe('12240.00');
      expect(item.stoneCharges.toFixed(2)).toBe('4500.00');
      expect(item.itemDiscount.toFixed(2)).toBe('1140.00');
      expect(item.taxableAmount.toFixed(2)).toBe('138000.00');
      expect(item.gstAmount.toFixed(2)).toBe('4140.00');
      expect(item.totalAmount.toFixed(2)).toBe('142140.00');

      // Aggregate into invoice
      const totals = calculateInvoiceTotals([item], [], 0, intraStateTaxConfig);
      expect(totals.subtotal.toFixed(2)).toBe('138000.00');
      expect(totals.taxableAmount.toFixed(2)).toBe('138000.00');
      expect(totals.cgstAmount.toFixed(2)).toBe('2070.00');
      expect(totals.sgstAmount.toFixed(2)).toBe('2070.00');
      expect(totals.totalTax.toFixed(2)).toBe('4140.00');
      expect(totals.grandTotal.toFixed(2)).toBe('142140.00');
    });

    it('enforces exact milligram precision on weights and paise precision on money', () => {
      // 10.12345g rounded to 10.123g (HALF_UP)
      // 0.4567g stone rounded to 0.457g (HALF_UP)
      // net = 10.123 - 0.457 = 9.666g
      const item = calculateLineItemPricing(
        {
          ornamentId: 'orn-prec',
          grossWeight: '10.12345',
          stoneWeight: '0.4567',
          ratePerGram: '7123.456', // 7123.46/g
        },
        intraStateTaxConfig
      );

      expect(item.grossWeight.toFixed(3)).toBe('10.123');
      expect(item.stoneWeight.toFixed(3)).toBe('0.457');
      expect(item.netWeight.toFixed(3)).toBe('9.667');
      expect(item.ratePerGram.toFixed(2)).toBe('7123.46');
    });

    it('verifies TAG-FORT-502 (SKU NK-TEMPLE-22K) authoritative billing reconciliation and indicative tag delta', () => {
      // TAG-FORT-502: 18.200g gross, 0.200g stone -> 18.000g net metal
      // Purity: 22K Gold, Showroom Daily Rate: ₹12,150.00/g
      // Metal Value = 18.000g * ₹12,150 = ₹2,18,700.00
      // Making Charge: ₹750/g (PER_GRAM) = 18.000g * ₹750 = ₹13,500.00
      // Taxable Subtotal = ₹2,18,700.00 + ₹13,500.00 = ₹2,32,200.00
      // GST (3%): ₹6,966.00 (CGST 1.5% ₹3,483.00 + SGST 1.5% ₹3,483.00)
      // Grand Total = ₹2,39,166.00
      // Indicative Showcase Tag Price: ₹2,30,000.00
      // Live Bullion Rate Delta = ₹2,32,200.00 - ₹2,30,000.00 = +₹2,200.00
      const indicativeTagPrice = new Decimal('230000.00');

      const item = calculateLineItemPricing(
        {
          ornamentId: 'TAG-FORT-502',
          pricingMode: 'WEIGHT_BASED',
          grossWeight: '18.200',
          stoneWeight: '0.200',
          ratePerGram: '12150.00',
          makingChargeType: 'PER_GRAM',
          makingChargeRate: '750.00',
        },
        intraStateTaxConfig
      );

      expect(item.netWeight.toFixed(3)).toBe('18.000');
      expect(item.metalValue.toFixed(2)).toBe('218700.00');
      expect(item.makingChargeAmount.toFixed(2)).toBe('13500.00');
      expect(item.taxableAmount.toFixed(2)).toBe('232200.00');
      expect(item.gstAmount.toFixed(2)).toBe('6966.00');
      expect(item.totalAmount.toFixed(2)).toBe('239166.00');

      // Verify the ₹2,200 difference between indicative showroom price and live rate subtotal
      const liveRateDelta = item.taxableAmount.minus(indicativeTagPrice);
      expect(liveRateDelta.toFixed(2)).toBe('2200.00');

      const totals = calculateInvoiceTotals([item], [], 0, intraStateTaxConfig);
      expect(totals.subtotal.toFixed(2)).toBe('232200.00');
      expect(totals.taxableAmount.toFixed(2)).toBe('232200.00');
      expect(totals.cgstAmount.toFixed(2)).toBe('3483.00');
      expect(totals.sgstAmount.toFixed(2)).toBe('3483.00');
      expect(totals.totalTax.toFixed(2)).toBe('6966.00');
      expect(totals.grandTotal.toFixed(2)).toBe('239166.00');
    });
  });
});
