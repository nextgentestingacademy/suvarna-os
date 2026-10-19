import Decimal from 'decimal.js';

// Configure standard precision for jewellery domain
// Weights: typically 3 decimal places (e.g. 0.001 g)
// Money & rates: 2 decimal places (e.g. ₹ 0.01)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export class CurrencyMath {
  /**
   * Safely adds an array of rupee amounts without floating-point errors.
   */
  static add(amounts: (number | string | Decimal)[]): Decimal {
    return amounts.reduce<Decimal>((sum, val) => sum.plus(new Decimal(val)), new Decimal(0));
  }

  /**
   * Calculates gross metal value: weightGrams * ratePerGram
   */
  static metalValue(weightGrams: number | string | Decimal, ratePerGram: number | string | Decimal): Decimal {
    const weight = new Decimal(weightGrams);
    const rate = new Decimal(ratePerGram);
    return weight.times(rate);
  }

  /**
   * Calculates pure metal weight based on karat purity.
   * e.g., 22K = 22 / 24, 18K = 18 / 24
   */
  static pureWeight(grossGrams: number | string | Decimal, karat: number): Decimal {
    const gross = new Decimal(grossGrams);
    const factor = new Decimal(karat).dividedBy(new Decimal(24));
    return gross.times(factor);
  }

  /**
   * Calculates configurable GST breakdown.
   * Standard Indian jewellery GST is 3% total (split equally into 1.5% CGST and 1.5% SGST for intra-state).
   * Returns subtotal, cgst, sgst, and grandTotal with exact 2-decimal rounding.
   */
  static calculateGstBreakdown(taxableAmount: number | string | Decimal, totalGstPercent: number | string = '3.0') {
    const taxable = new Decimal(taxableAmount);
    const totalRate = new Decimal(totalGstPercent);
    const halfRate = totalRate.dividedBy(2);

    const cgst = taxable.times(halfRate).dividedBy(100);
    const sgst = taxable.times(halfRate).dividedBy(100);
    const totalTax = cgst.plus(sgst);
    const grandTotal = taxable.plus(totalTax);

    return {
      taxableAmount: taxable.toFixed(2),
      cgstRate: halfRate.toFixed(2),
      cgstAmount: cgst.toFixed(2),
      sgstRate: halfRate.toFixed(2),
      sgstAmount: sgst.toFixed(2),
      totalTax: totalTax.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
    };
  }

  /**
   * Formats a number or Decimal to Indian Rupee (INR) representation: ₹ 1,24,500.00
   */
  static formatInr(amount: number | string | Decimal): string {
    const dec = new Decimal(amount);
    const parts = dec.toFixed(2).split('.');
    let integerPart = parts[0];
    const decimalPart = parts[1];

    // Indian Numbering System formatting: last 3 digits, then groups of 2
    const lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);
    if (otherNumbers !== '') {
      integerPart = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
    } else {
      integerPart = lastThree;
    }

    return `₹${integerPart}.${decimalPart}`;
  }

  /**
   * Formats gram weight to 3 decimal places (e.g. 24.850 g)
   */
  static formatGrams(grams: number | string | Decimal): string {
    const dec = new Decimal(grams);
    return `${dec.toFixed(3)} g`;
  }
}

export { Decimal };
