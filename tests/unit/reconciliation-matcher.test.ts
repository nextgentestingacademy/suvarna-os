import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  ReconciliationMatcher,
  MatchValidationError,
} from '@/lib/reconciliation';

describe('Suvarna Milestone 4D-3 — Reconciliation Matcher Unit Tests', () => {
  const matcher = new ReconciliationMatcher({ prisma: {} as any });

  describe('Monetary Amount Validation', () => {
    // Access private validator via test harness or public method
    const validateAmount = (matcher as any).validateMonetaryAmount.bind(matcher);

    it('accepts valid positive numbers, strings, and Decimals', () => {
      const dec1 = validateAmount(100.5, 'testAmount');
      expect(dec1.equals(new Decimal('100.50'))).toBe(true);

      const dec2 = validateAmount('25000.75', 'testAmount');
      expect(dec2.equals(new Decimal('25000.75'))).toBe(true);

      const dec3 = validateAmount(new Decimal('9999.99'), 'testAmount');
      expect(dec3.equals(new Decimal('9999.99'))).toBe(true);
    });

    it('rejects zero or negative amounts', () => {
      expect(() => validateAmount(0, 'amount')).toThrow(MatchValidationError);
      expect(() => validateAmount(-50.0, 'amount')).toThrow(MatchValidationError);
      expect(() => validateAmount('-0.01', 'amount')).toThrow(MatchValidationError);
    });

    it('rejects amounts exceeding 2 decimal places', () => {
      expect(() => validateAmount('10.555', 'amount')).toThrow(MatchValidationError);
      expect(() => validateAmount(10.1234, 'amount')).toThrow(MatchValidationError);
    });

    it('rejects non-numeric strings and NaN', () => {
      expect(() => validateAmount('abc', 'amount')).toThrow(MatchValidationError);
      expect(() => validateAmount(NaN, 'amount')).toThrow(MatchValidationError);
      expect(() => validateAmount(Infinity, 'amount')).toThrow(MatchValidationError);
    });
  });

  describe('Reversal and Discrepancy Reason Validation', () => {
    const dummyCtx: any = {
      role: 'ACCOUNTANT',
      tenantId: 'org-test',
      allowedBranchIds: [],
    };

    it('rejects reversal if reason is missing or shorter than 5 chars', async () => {
      await expect(
        matcher.reverseMatch(dummyCtx, { matchId: 'm1', reason: '' })
      ).rejects.toThrow(MatchValidationError);

      await expect(
        matcher.reverseMatch(dummyCtx, { matchId: 'm1', reason: 'bad' })
      ).rejects.toThrow(MatchValidationError);
    });

    it('rejects marking discrepant if reason is missing or shorter than 5 chars', async () => {
      await expect(
        matcher.markLineDiscrepant(dummyCtx, { statementLineId: 'l1', reason: '   ' })
      ).rejects.toThrow(MatchValidationError);
    });

    it('rejects ignoring statement line if reason is missing or shorter than 5 chars', async () => {
      await expect(
        matcher.ignoreStatementLine(dummyCtx, { statementLineId: 'l1', reason: 'skip' })
      ).rejects.toThrow(MatchValidationError);
    });
  });
});
