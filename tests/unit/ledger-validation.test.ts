import { describe, it, expect } from 'vitest';
import {
  STARTER_CHART_OF_ACCOUNTS,
  getIndianFiscalYear,
  LedgerValidationError,
  LedgerConflictError,
  LedgerImmutabilityError,
} from '@/lib/ledger';
import { Decimal } from '@/lib/decimal';

describe('Suvarna Milestone 4B — Ledger Validation & Arithmetic Unit Tests', () => {
  describe('Starter Chart of Accounts (COA) Structure & Classifications', () => {
    it('contains the mandated starter accounts with unique codes including cheque clearing', () => {
      expect(STARTER_CHART_OF_ACCOUNTS.length).toBeGreaterThanOrEqual(19);

      const codes = STARTER_CHART_OF_ACCOUNTS.map((a) => a.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(STARTER_CHART_OF_ACCOUNTS.length);
    });

    it('correctly models Bank Transfer Inward Clearing (1045) as ASSET with DEBIT normal balance', () => {
      const bankTransferAccount = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '1045');
      expect(bankTransferAccount).toBeDefined();
      expect(bankTransferAccount?.classification).toBe('ASSET');
      expect(bankTransferAccount?.normalBalance).toBe('DEBIT');
    });

    it('correctly models Cheques in Hand / Clearing (1050) as ASSET with DEBIT normal balance', () => {
      const chequeAccount = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '1050');
      expect(chequeAccount).toBeDefined();
      expect(chequeAccount?.classification).toBe('ASSET');
      expect(chequeAccount?.normalBalance).toBe('DEBIT');
    });

    it('classifies all starter accounts with valid classifications and normal balances', () => {
      const validClassifications = new Set(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);
      const validNormalBalances = new Set(['DEBIT', 'CREDIT']);

      for (const account of STARTER_CHART_OF_ACCOUNTS) {
        expect(validClassifications.has(account.classification)).toBe(true);
        expect(validNormalBalances.has(account.normalBalance)).toBe(true);
        expect(account.name).toBeTruthy();
        expect(account.description).toBeTruthy();
      }
    });

    it('correctly models Rounding Adjustment (4090) as REVENUE with CREDIT normal balance', () => {
      const roundAccount = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '4090');
      expect(roundAccount).toBeDefined();
      expect(roundAccount?.classification).toBe('REVENUE');
      expect(roundAccount?.normalBalance).toBe('CREDIT');
    });

    it('correctly models Sales Discounts (4110) as contra-revenue REVENUE with DEBIT normal balance', () => {
      const discountAccount = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '4110');
      expect(discountAccount).toBeDefined();
      expect(discountAccount?.classification).toBe('REVENUE');
      expect(discountAccount?.normalBalance).toBe('DEBIT');
    });

    it('correctly models Sales Returns (4120) as contra-revenue REVENUE with DEBIT normal balance', () => {
      const returnAccount = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '4120');
      expect(returnAccount).toBeDefined();
      expect(returnAccount?.classification).toBe('REVENUE');
      expect(returnAccount?.normalBalance).toBe('DEBIT');
    });

    it('correctly models Inventory (1210) and COGS (5010) as DEBIT accounts', () => {
      const inventory = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '1210');
      const cogs = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '5010');
      expect(inventory?.classification).toBe('ASSET');
      expect(inventory?.normalBalance).toBe('DEBIT');
      expect(cogs?.classification).toBe('EXPENSE');
      expect(cogs?.normalBalance).toBe('DEBIT');
    });
  });

  describe('Indian Fiscal Year Calculation Helper', () => {
    it('returns 2026-2027 for dates from April 1, 2026 to March 31, 2027', () => {
      expect(getIndianFiscalYear(new Date(2026, 3, 1))).toBe('2026-2027'); // April 1, 2026
      expect(getIndianFiscalYear(new Date(2026, 9, 25))).toBe('2026-2027'); // October 25, 2026
      expect(getIndianFiscalYear(new Date(2026, 11, 31))).toBe('2026-2027'); // December 31, 2026
      expect(getIndianFiscalYear(new Date(2027, 0, 15))).toBe('2026-2027'); // January 15, 2027
      expect(getIndianFiscalYear(new Date(2027, 2, 31, 23, 59, 59))).toBe('2026-2027'); // March 31, 2027
    });

    it('rolls over to 2027-2028 on April 1, 2027', () => {
      expect(getIndianFiscalYear(new Date(2027, 3, 1, 0, 0, 0))).toBe('2027-2028'); // April 1, 2027
    });
  });

  describe('Exact Decimal Double-Entry Balance Arithmetic', () => {
    it('accurately balances standard multi-line GST retail transactions without floating-point errors', () => {
      // Retail Sale of ₹2,39,166 (Metal: ₹2,18,700, Making: ₹13,500, CGST: ₹3,483, SGST: ₹3,483)
      const debits = [
        new Decimal('239166.00'), // 1010 Cash on Hand
      ];
      const credits = [
        new Decimal('218700.00'), // 4010 Precious Metal Revenue
        new Decimal('13500.00'),  // 4020 Making Charges Revenue
        new Decimal('3483.00'),   // 2010 Output CGST
        new Decimal('3483.00'),   // 2020 Output SGST
      ];

      const sumDebits = debits.reduce((acc, val) => acc.plus(val), new Decimal(0));
      const sumCredits = credits.reduce((acc, val) => acc.plus(val), new Decimal(0));

      expect(sumDebits.toFixed(2)).toBe('239166.00');
      expect(sumCredits.toFixed(2)).toBe('239166.00');
      expect(sumDebits.equals(sumCredits)).toBe(true);
    });

    it('detects fractional cent variances that float IEEE 754 would miss', () => {
      const debit = new Decimal('100.00');
      const credit1 = new Decimal('33.33');
      const credit2 = new Decimal('33.33');
      const credit3 = new Decimal('33.33'); // Sum is 99.99, variance 0.01

      const sumCredits = credit1.plus(credit2).plus(credit3);
      expect(debit.equals(sumCredits)).toBe(false);
      expect(debit.minus(sumCredits).toFixed(2)).toBe('0.01');
    });

    it('balances rounding variance using the 4090 Rounding Adjustment account', () => {
      const debit = new Decimal('100.00');
      const credit1 = new Decimal('99.99');
      const roundingAdjustment = new Decimal('0.01'); // 4090 credited

      const sumCredits = credit1.plus(roundingAdjustment);
      expect(debit.equals(sumCredits)).toBe(true);
    });
  });

  describe('Error Types & Immutability', () => {
    it('instantiates LedgerValidationError with correct name and code', () => {
      const err = new LedgerValidationError('Unbalanced entry', 'UNBALANCED');
      expect(err.name).toBe('LedgerValidationError');
      expect(err.code).toBe('UNBALANCED');
      expect(err.message).toBe('Unbalanced entry');
    });

    it('instantiates LedgerConflictError with correct name and code', () => {
      const err = new LedgerConflictError('Duplicate key', 'DUPLICATE');
      expect(err.name).toBe('LedgerConflictError');
      expect(err.code).toBe('DUPLICATE');
    });

    it('instantiates LedgerImmutabilityError with default message', () => {
      const err = new LedgerImmutabilityError();
      expect(err.name).toBe('LedgerImmutabilityError');
      expect(err.code).toBe('IMMUTABLE_RECORD');
      expect(err.message).toContain('immutable');
    });
  });
});
