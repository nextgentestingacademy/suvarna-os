import { describe, it, expect } from 'vitest';
import { formatIndianCurrencyWords, convertIntegerToIndianWords } from '@/lib/number-to-words';

describe('Indian Currency In Words (Lakhs & Crores Numbering System)', () => {
  it('converts basic integers to Indian words', () => {
    expect(convertIntegerToIndianWords(0)).toBe('Zero');
    expect(convertIntegerToIndianWords(5)).toBe('Five');
    expect(convertIntegerToIndianWords(15)).toBe('Fifteen');
    expect(convertIntegerToIndianWords(85)).toBe('Eighty Five');
    expect(convertIntegerToIndianWords(450)).toBe('Four Hundred Fifty');
    expect(convertIntegerToIndianWords(1000)).toBe('One Thousand');
    expect(convertIntegerToIndianWords(25400)).toBe('Twenty Five Thousand Four Hundred');
    expect(convertIntegerToIndianWords(100000)).toBe('One Lakh');
    expect(convertIntegerToIndianWords(125400)).toBe('One Lakh Twenty Five Thousand Four Hundred');
    expect(convertIntegerToIndianWords(10000000)).toBe('One Crore');
    expect(convertIntegerToIndianWords(25000000)).toBe('Two Crore Fifty Lakh');
  });

  it('formats full Indian Rupee sentences with "Rupees ... Only"', () => {
    expect(formatIndianCurrencyWords(0)).toBe('Rupees Zero Only');
    expect(formatIndianCurrencyWords(125400)).toBe('Rupees One Lakh Twenty Five Thousand Four Hundred Only');
    expect(formatIndianCurrencyWords('200000')).toBe('Rupees Two Lakh Only');
    expect(formatIndianCurrencyWords('467500.00')).toBe('Rupees Four Lakh Sixty Seven Thousand Five Hundred Only');
  });

  it('handles fractional paise amounts accurately', () => {
    expect(formatIndianCurrencyWords('1500.50')).toBe('Rupees One Thousand Five Hundred and Fifty Paise Only');
    expect(formatIndianCurrencyWords(100.25)).toBe('Rupees One Hundred and Twenty Five Paise Only');
  });
});
