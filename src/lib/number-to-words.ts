/**
 * Converts a number or decimal amount to Indian currency words
 * according to the Indian numbering system (Lakhs, Crores).
 * e.g. 125400 -> "Rupees One Lakh Twenty-Five Thousand Four Hundred Only"
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function convertBelowThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += `${ONES[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    str += `${TENS[Math.floor(n / 10)]} `;
    n %= 10;
  }
  if (n > 0) {
    str += `${ONES[n]} `;
  }
  return str.trim();
}

/**
 * Converts an integer amount into Indian number system words (Crores, Lakhs, Thousands).
 */
export function convertIntegerToIndianWords(num: number): string {
  if (num === 0) return 'Zero';
  if (num < 0) return `Minus ${convertIntegerToIndianWords(Math.abs(num))}`;

  let words = '';

  const crores = Math.floor(num / 10000000);
  num %= 10000000;

  const lakhs = Math.floor(num / 100000);
  num %= 100000;

  const thousands = Math.floor(num / 1000);
  num %= 1000;

  const hundreds = num;

  if (crores > 0) {
    words += `${convertIntegerToIndianWords(crores)} Crore `;
  }
  if (lakhs > 0) {
    words += `${convertBelowThousand(lakhs)} Lakh `;
  }
  if (thousands > 0) {
    words += `${convertBelowThousand(thousands)} Thousand `;
  }
  if (hundreds > 0) {
    words += `${convertBelowThousand(hundreds)} `;
  }

  return words.trim();
}

/**
 * Formats an amount as Indian Rupees in words.
 * e.g. 152000.50 -> "Rupees One Lakh Fifty-Two Thousand and Fifty Paise Only"
 */
export function formatIndianCurrencyWords(amount: number | string): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount) || numericAmount === 0) {
    return 'Rupees Zero Only';
  }

  const isNegative = numericAmount < 0;
  const absAmount = Math.abs(numericAmount);
  const rupees = Math.floor(absAmount);
  const paise = Math.round((absAmount - rupees) * 100);

  let result = isNegative ? 'Minus Rupees ' : 'Rupees ';
  result += convertIntegerToIndianWords(rupees);

  if (paise > 0) {
    result += ` and ${convertBelowThousand(paise)} Paise`;
  }

  result += ' Only';
  return result;
}
