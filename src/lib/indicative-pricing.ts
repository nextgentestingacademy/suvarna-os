import { Decimal } from '@/lib/decimal';

/**
 * Indicative Showroom Daily Market Rates for rate resolution.
 * Matches POS rates and standard showroom bullion feeds.
 */
export const INDICATIVE_DAILY_RATES: Record<string, number> = {
  '24K': 13250,
  '22K': 12150,
  '18K': 9940,
  '14K': 7730,
  'SILVER': 168,
};

export interface IndicativePricingInput {
  priceAmount?: string | number | Decimal | null;
  netWeight?: string | number | Decimal | null;
  purity?: string | null;
  metalType?: string | null;
  makingChargeType?: string | null;
  makingChargeValue?: string | number | Decimal | null;
}

export interface IndicativePriceResult {
  hasPrice: boolean;
  amount: string | null;
  formattedPrice: string;
  source: 'TAG_PRICE' | 'CALCULATED_ESTIMATE' | 'UNAVAILABLE';
  reason?: string;
  label?: string;
}

/**
 * Formats a numeric value or Decimal into Indian Rupee currency string.
 */
export function formatInr(val: string | number | Decimal): string {
  const dec = new Decimal(val);
  const num = dec.toNumber();
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Calculates or resolves the indicative catalogue price for an inventory ornament.
 *
 * Priority:
 * 1. Saved static Tag Price (priceAmount) if explicitly present on the ornament.
 * 2. Calculated indicative price from active daily market rate + net metal weight + making charges.
 * 3. If required inputs are incomplete (e.g. missing rate, weight, or making charge), returns
 *    'Price unavailable' along with a concise diagnostic reason.
 *
 * Note: Catalogue prices are indicative estimates for customer reference and display.
 * Authoritative billing calculation is performed dynamically at POS checkout.
 */
export function getIndicativePrice(
  item: IndicativePricingInput,
  rates: Record<string, number> = INDICATIVE_DAILY_RATES
): IndicativePriceResult {
  // 1. Direct saved tag price on the ornament record
  if (item.priceAmount !== undefined && item.priceAmount !== null && String(item.priceAmount).trim() !== '') {
    try {
      const dec = new Decimal(item.priceAmount);
      if (!dec.isNaN() && dec.greaterThan(0)) {
        return {
          hasPrice: true,
          amount: dec.toFixed(2),
          formattedPrice: formatInr(dec),
          source: 'TAG_PRICE',
          label: 'Tag Estimate',
        };
      }
    } catch {
      // Invalid decimal string, fall through to calculation attempt
    }
  }

  // 2. Validate Net Metal Weight
  if (item.netWeight === undefined || item.netWeight === null || String(item.netWeight).trim() === '') {
    return {
      hasPrice: false,
      amount: null,
      formattedPrice: 'Price unavailable',
      source: 'UNAVAILABLE',
      reason: 'Missing net weight',
    };
  }

  let netWeightDec: Decimal;
  try {
    netWeightDec = new Decimal(item.netWeight);
    if (netWeightDec.isNaN() || netWeightDec.lessThanOrEqualTo(0)) {
      return {
        hasPrice: false,
        amount: null,
        formattedPrice: 'Price unavailable',
        source: 'UNAVAILABLE',
        reason: 'Invalid net weight',
      };
    }
  } catch {
    return {
      hasPrice: false,
      amount: null,
      formattedPrice: 'Price unavailable',
      source: 'UNAVAILABLE',
      reason: 'Invalid net weight',
    };
  }

  // 3. Resolve Daily Bullion Rate for Metal & Purity
  const purityKey = (item.purity || '').toUpperCase().trim();
  const metalKey = (item.metalType || '').toUpperCase().trim();
  let ratePerGram: number | undefined;

  if (metalKey === 'SILVER') {
    ratePerGram = rates['SILVER'];
  } else if (purityKey && rates[purityKey] !== undefined) {
    ratePerGram = rates[purityKey];
  }

  if (ratePerGram === undefined || ratePerGram <= 0) {
    const missingLabel = purityKey || metalKey || 'metal';
    return {
      hasPrice: false,
      amount: null,
      formattedPrice: 'Price unavailable',
      source: 'UNAVAILABLE',
      reason: `No daily rate for ${missingLabel}`,
    };
  }

  // 4. Validate Making Charge
  if (
    !item.makingChargeType ||
    item.makingChargeValue === undefined ||
    item.makingChargeValue === null ||
    String(item.makingChargeValue).trim() === ''
  ) {
    return {
      hasPrice: false,
      amount: null,
      formattedPrice: 'Price unavailable',
      source: 'UNAVAILABLE',
      reason: 'Making charge not specified',
    };
  }

  let mcValueDec: Decimal;
  try {
    mcValueDec = new Decimal(item.makingChargeValue);
    if (mcValueDec.isNaN() || mcValueDec.lessThan(0)) {
      return {
        hasPrice: false,
        amount: null,
        formattedPrice: 'Price unavailable',
        source: 'UNAVAILABLE',
        reason: 'Invalid making charge',
      };
    }
  } catch {
    return {
      hasPrice: false,
      amount: null,
      formattedPrice: 'Price unavailable',
      source: 'UNAVAILABLE',
      reason: 'Invalid making charge',
    };
  }

  // 5. Calculate Indicative Price (Metal Value + Making Charge)
  const metalValue = netWeightDec.times(ratePerGram);
  let makingChargeAmount = new Decimal(0);

  const mcType = item.makingChargeType.toUpperCase().trim();
  if (mcType === 'PER_GRAM') {
    makingChargeAmount = netWeightDec.times(mcValueDec);
  } else if (mcType === 'PERCENTAGE') {
    makingChargeAmount = metalValue.times(mcValueDec.dividedBy(100));
  } else if (mcType === 'FLAT' || mcType === 'FIXED') {
    makingChargeAmount = mcValueDec;
  } else {
    return {
      hasPrice: false,
      amount: null,
      formattedPrice: 'Price unavailable',
      source: 'UNAVAILABLE',
      reason: `Unsupported making charge type: ${item.makingChargeType}`,
    };
  }

  const totalIndicative = metalValue.plus(makingChargeAmount);

  return {
    hasPrice: true,
    amount: totalIndicative.toFixed(2),
    formattedPrice: formatInr(totalIndicative),
    source: 'CALCULATED_ESTIMATE',
    label: 'Live Indicative',
  };
}
