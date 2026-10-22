import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  isValidIndianPhone,
  isValidPAN,
  isValidPincode,
  validateCustomerName,
  validateAlternatePhone,
  validateCity,
  validateState,
  validateCustomerDate,
  INDIAN_STATES_AND_UTS,
} from '@/lib/customer';

describe('Customer Validation & Normalization Unit Tests', () => {
  describe('normalizePhoneNumber', () => {
    it('normalizes 10-digit standard Indian mobile numbers', () => {
      expect(normalizePhoneNumber('9820012345')).toBe('9820012345');
    });

    it('strips whitespace, dashes, and parentheses', () => {
      expect(normalizePhoneNumber('  98200-12345  ')).toBe('9820012345');
      expect(normalizePhoneNumber('(982) 001-2345')).toBe('9820012345');
      expect(normalizePhoneNumber('98200 12345')).toBe('9820012345');
    });

    it('strips leading country code +91 and 91', () => {
      expect(normalizePhoneNumber('+91 9820012345')).toBe('9820012345');
      expect(normalizePhoneNumber('919820012345')).toBe('9820012345');
      expect(normalizePhoneNumber('+91-98200-12345')).toBe('9820012345');
    });

    it('strips leading trunk zero (098...)', () => {
      expect(normalizePhoneNumber('09820012345')).toBe('9820012345');
    });

    it('handles empty or blank inputs gracefully', () => {
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber('   ')).toBe('');
    });
  });

  describe('isValidIndianPhone', () => {
    it('accepts valid 10-digit Indian numbers starting with 6, 7, 8, 9', () => {
      expect(isValidIndianPhone('9820012345')).toBe(true);
      expect(isValidIndianPhone('8820012345')).toBe(true);
      expect(isValidIndianPhone('7820012345')).toBe(true);
      expect(isValidIndianPhone('6820012345')).toBe(true);
      expect(isValidIndianPhone('+91 98200 12345')).toBe(true);
    });

    it('rejects numbers not starting with 6-9', () => {
      expect(isValidIndianPhone('5820012345')).toBe(false);
      expect(isValidIndianPhone('1820012345')).toBe(false);
      expect(isValidIndianPhone('0820012345')).toBe(false);
    });

    it('rejects invalid lengths', () => {
      expect(isValidIndianPhone('98200')).toBe(false);
      expect(isValidIndianPhone('982001234567')).toBe(false);
      expect(isValidIndianPhone('')).toBe(false);
    });
  });

  describe('validateCustomerName', () => {
    it('accepts legitimate English names with letters and spaces', () => {
      const res = validateCustomerName('Meera Joshi');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('Meera Joshi');
    });

    it('accepts Indian Unicode names (Devanagari, Tamil, Bengali)', () => {
      expect(validateCustomerName('मीरा जोशी').valid).toBe(true);
      expect(validateCustomerName('மீரா ஜோஷி').valid).toBe(true);
      expect(validateCustomerName('মীরা জোশী').valid).toBe(true);
    });

    it('accepts initials with periods, hyphens, and apostrophes', () => {
      expect(validateCustomerName('R. K. Narayan').valid).toBe(true);
      expect(validateCustomerName("O'Connor").valid).toBe(true);
      expect(validateCustomerName('Marie-Claire').valid).toBe(true);
    });

    it('rejects names containing digits or numbers', () => {
      const res = validateCustomerName('Customer 123');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('cannot contain numbers');
    });

    it('rejects empty, whitespace-only, or single-character names', () => {
      expect(validateCustomerName('').valid).toBe(false);
      expect(validateCustomerName('   ').valid).toBe(false);
      expect(validateCustomerName('A').valid).toBe(false);
    });

    it('rejects special symbols like @#$%^&*', () => {
      expect(validateCustomerName('Meera @ Joshi').valid).toBe(false);
      expect(validateCustomerName('Priya #1').valid).toBe(false);
    });
  });

  describe('validateAlternatePhone', () => {
    it('allows blank, null, or undefined values (optional field)', () => {
      expect(validateAlternatePhone('').valid).toBe(true);
      expect(validateAlternatePhone('   ').valid).toBe(true);
      expect(validateAlternatePhone(null).valid).toBe(true);
      expect(validateAlternatePhone(undefined).valid).toBe(true);
    });

    it('validates and normalizes valid 10-digit Indian numbers when provided', () => {
      const res = validateAlternatePhone('+91 98200 54321');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('9820054321');
    });

    it('rejects invalid or non-10-digit numbers when populated', () => {
      const res1 = validateAlternatePhone('12345');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('valid 10-digit Indian phone number');

      const res2 = validateAlternatePhone('5820012345');
      expect(res2.valid).toBe(false);
    });
  });

  describe('validateCity', () => {
    it('allows blank or null city (optional field)', () => {
      expect(validateCity('').valid).toBe(true);
      expect(validateCity(null).valid).toBe(true);
    });

    it('accepts legitimate city names in English and Unicode', () => {
      expect(validateCity('Mumbai').valid).toBe(true);
      expect(validateCity('New Delhi').valid).toBe(true);
      expect(validateCity('तिरुचिरापल्ली').valid).toBe(true);
    });

    it('rejects cities containing numbers or digits', () => {
      const res = validateCity('Mumbai 400001');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('cannot contain numbers');
    });
  });

  describe('validateState', () => {
    it('allows blank or null state (optional field)', () => {
      expect(validateState('').valid).toBe(true);
      expect(validateState(null).valid).toBe(true);
    });

    it('accepts and normalizes all 36 Indian States and Union Territories case-insensitively', () => {
      expect(validateState('maharashtra').normalized).toBe('Maharashtra');
      expect(validateState('KARNATAKA').normalized).toBe('Karnataka');
      expect(validateState('delhi').normalized).toBe('Delhi');
      expect(validateState('Tamil Nadu').normalized).toBe('Tamil Nadu');
      expect(validateState('Ladakh').normalized).toBe('Ladakh');
      expect(INDIAN_STATES_AND_UTS.length).toBe(36);
    });

    it('rejects non-existent or foreign states', () => {
      const res = validateState('California');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('valid Indian State or Union Territory');
    });
  });

  describe('validateCustomerDate', () => {
    const currentYear = new Date().getFullYear();

    it('allows blank or null dates (optional fields)', () => {
      expect(validateCustomerDate('', 'BIRTHDAY').valid).toBe(true);
      expect(validateCustomerDate(null, 'ANNIVERSARY').valid).toBe(true);
    });

    it('accepts valid birthday within 0-120 years', () => {
      const res = validateCustomerDate('1990-05-15', 'BIRTHDAY');
      expect(res.valid).toBe(true);
      expect(res.date).toBeInstanceOf(Date);
      expect(res.date?.getUTCFullYear()).toBe(1990);
    });

    it('rejects future birthdays', () => {
      const futureYear = currentYear + 1;
      const res = validateCustomerDate(`${futureYear}-01-01`, 'BIRTHDAY');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('cannot be in the future');
    });

    it('rejects birthdays older than 120 years (e.g. 0011-01-01 or 1800)', () => {
      const res = validateCustomerDate('0011-01-01', 'BIRTHDAY');
      expect(res.valid).toBe(false);
      expect(res.error).toContain(`Year must be between ${currentYear - 120} and ${currentYear}`);
    });

    it('rejects invalid calendar dates like Feb 30 or April 31', () => {
      const res1 = validateCustomerDate('2000-02-30', 'BIRTHDAY');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Invalid calendar date');

      const res2 = validateCustomerDate('1995-04-31', 'ANNIVERSARY');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Invalid calendar date');
    });

    it('accepts leap year Feb 29 and rejects non-leap year Feb 29', () => {
      expect(validateCustomerDate('2000-02-29', 'BIRTHDAY').valid).toBe(true); // 2000 is leap year
      expect(validateCustomerDate('2001-02-29', 'BIRTHDAY').valid).toBe(false); // 2001 not leap year
    });

    it('enforces anniversary year limits (currentYear - 100 to currentYear + 1)', () => {
      expect(validateCustomerDate('1900-01-01', 'ANNIVERSARY').valid).toBe(false);
      expect(validateCustomerDate(`${currentYear}-06-15`, 'ANNIVERSARY').valid).toBe(true);
    });
  });

  describe('isValidPAN', () => {
    it('accepts valid 10-character Indian PAN numbers', () => {
      expect(isValidPAN('ABCDE1234F')).toBe(true);
      expect(isValidPAN('abcde1234f')).toBe(true);
      expect(isValidPAN('BNZPK9876M')).toBe(true);
    });

    it('accepts empty or null PAN (since it is optional)', () => {
      expect(isValidPAN('')).toBe(true);
    });

    it('rejects malformed PAN formats', () => {
      expect(isValidPAN('12345ABCDE')).toBe(false);
      expect(isValidPAN('ABCD12345F')).toBe(false);
      expect(isValidPAN('ABCDE12345')).toBe(false);
      expect(isValidPAN('TOOLONGPAN123')).toBe(false);
    });
  });

  describe('isValidPincode', () => {
    it('accepts valid 6-digit Indian PIN codes', () => {
      expect(isValidPincode('400001')).toBe(true);
      expect(isValidPincode('110001')).toBe(true);
      expect(isValidPincode('560001')).toBe(true);
    });

    it('accepts empty or null pincode (since it is optional)', () => {
      expect(isValidPincode('')).toBe(true);
    });

    it('rejects malformed PIN codes', () => {
      expect(isValidPincode('40001')).toBe(false);
      expect(isValidPincode('4000001')).toBe(false);
      expect(isValidPincode('ABC400')).toBe(false);
    });
  });
});
