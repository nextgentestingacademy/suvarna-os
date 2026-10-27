import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { parseGenericCsv, tokenizeCsv, parseDate, parseMoneyDecimal } from '@/lib/reconciliation/parsers/generic-csv';
import { CsvColumnMapping } from '@/lib/reconciliation/parsers/types';

describe('Suvarna Reconciliation Parser — Unit Tests', () => {
  const standardMapping: CsvColumnMapping = {
    dateColumn: 'Date',
    descriptionColumn: 'Narration',
    referenceColumn: 'Chq/Ref No',
    amountMode: 'SEPARATE_COLUMNS',
    debitColumn: 'Withdrawal Amt',
    creditColumn: 'Deposit Amt',
    balanceColumn: 'Closing Balance',
    dateFormat: 'AUTO',
  };

  it('correctly tokenizes CSV lines with commas inside quotes and escaped quotes', () => {
    const csv = 'Date,Narration,Amount\r\n2026-10-25,"Payment for ""Bridal Set"", Mumbai",50000.00\n2026-10-26,Normal row,1000.00';
    const grid = tokenizeCsv(csv);
    expect(grid).toHaveLength(3);
    expect(grid[1][1]).toBe('Payment for "Bridal Set", Mumbai');
    expect(grid[1][2]).toBe('50000.00');
    expect(grid[2][0]).toBe('2026-10-26');
  });

  it('parses valid generic CSV with separate debit/credit columns', () => {
    const csv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
2026-10-20,UPI/CR/1234567890/Customer,1234567890,,25000.00,125000.00
2026-10-21,CHQ CLG / 99281,99281,,50000.00,175000.00
2026-10-22,ATM CASH WDL / FORT,,,10000.00,165000.00`;

    // Note: line 3 has debit in Withdrawal Amt:
    const fixedCsv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
2026-10-20,UPI/CR/1234567890/Customer,1234567890,,25000.00,125000.00
2026-10-21,CHQ CLG / 99281,99281,,50000.00,175000.00
2026-10-22,ATM CASH WDL / FORT,,10000.00,,165000.00`;

    const res = parseGenericCsv(fixedCsv, standardMapping);
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(3);
    expect(res.errors).toHaveLength(0);

    expect(res.rows[0].lineType).toBe('CREDIT');
    expect(res.rows[0].amount.toString()).toBe('25000');
    expect(res.rows[0].referenceNumber).toBe('1234567890');

    expect(res.rows[2].lineType).toBe('DEBIT');
    expect(res.rows[2].amount.toString()).toBe('10000');
  });

  it('parses Indian DD/MM/YYYY and DD-MM-YYYY date formats correctly', () => {
    const d1 = parseDate('25/10/2026');
    expect(d1).toBeDefined();
    expect(d1?.getUTCFullYear()).toBe(2026);
    expect(d1?.getUTCMonth()).toBe(9); // 0-indexed: 9 = October
    expect(d1?.getUTCDate()).toBe(25);

    const d2 = parseDate('05-11-2026');
    expect(d2?.getUTCDate()).toBe(5);
    expect(d2?.getUTCMonth()).toBe(10); // November
  });

  it('normalizes Indian currency strings by stripping commas and rupee symbols', () => {
    const dec = parseMoneyDecimal('₹ 1,50,000.50');
    expect(dec).toBeDefined();
    expect(dec?.toString()).toBe('150000.5');
  });

  it('rejects files with missing required header columns', () => {
    const csv = `TxDate,Description,Amount\n2026-10-25,Test,100`;
    const res = parseGenericCsv(csv, standardMapping);
    expect(res.success).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.some((e) => e.field === 'Date')).toBe(true);
  });

  it('rejects rows with non-numeric, negative, or zero monetary amounts', () => {
    const csv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
2026-10-25,Invalid Amount,REF-1,,-500.00,1000.00
2026-10-26,Zero Amount,REF-2,,0.00,1000.00
2026-10-27,Corrupted,REF-3,,INVALID,1000.00`;

    const res = parseGenericCsv(csv, standardMapping);
    expect(res.success).toBe(false);
    expect(res.errors).toHaveLength(3);
    expect(res.errors[0].lineNumber).toBe(2);
    expect(res.errors[1].lineNumber).toBe(3);
    expect(res.errors[2].lineNumber).toBe(4);
  });

  it('rejects rows where both debit and credit amounts are positive', () => {
    const csv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
2026-10-25,Conflicting amounts,REF-1,100.00,200.00,1000.00`;

    const res = parseGenericCsv(csv, standardMapping);
    expect(res.success).toBe(false);
    expect(res.errors[0].message).toContain('Both debit and credit amounts cannot be positive');
  });

  it('sanitizes descriptions starting with formula characters (=, +, -, @)', () => {
    const csv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
2026-10-25,=cmd|'/C calc'!A0,REF-1,,1000.00,1000.00`;

    const res = parseGenericCsv(csv, standardMapping);
    expect(res.success).toBe(true);
    expect(res.rows[0].description).toBe(`'=cmd|'/C calc'!A0`);
  });

  it('computes identical fingerprints for duplicate-looking lines as a review signal', () => {
    const csv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
2026-10-25,Customer Cash Tender,TXN-99,,10000.00,20000.00
2026-10-25,Customer Cash Tender,TXN-99,,10000.00,30000.00`;

    const res = parseGenericCsv(csv, standardMapping);
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].duplicateFingerprint).toBe(res.rows[1].duplicateFingerprint);
  });

  it('supports single amount with type column (CR/DR)', () => {
    const typeMapping: CsvColumnMapping = {
      dateColumn: 'Txn Date',
      descriptionColumn: 'Particulars',
      amountMode: 'SINGLE_AMOUNT_WITH_TYPE',
      amountColumn: 'Amount',
      typeColumn: 'Type',
      creditTypeValue: 'CR',
      debitTypeValue: 'DR',
    };

    const csv = `Txn Date,Particulars,Amount,Type
2026-10-25,UPI Credit,15000.00,CR
2026-10-26,Vendor Debit,8000.00,DR`;

    const res = parseGenericCsv(csv, typeMapping);
    expect(res.success).toBe(true);
    expect(res.rows[0].lineType).toBe('CREDIT');
    expect(res.rows[0].amount.toString()).toBe('15000');
    expect(res.rows[1].lineType).toBe('DEBIT');
    expect(res.rows[1].amount.toString()).toBe('8000');
  });

  it('supports signed amount column (positive = credit, negative = debit)', () => {
    const signedMapping: CsvColumnMapping = {
      dateColumn: 'Date',
      descriptionColumn: 'Details',
      amountMode: 'SIGNED_AMOUNT',
      amountColumn: 'Net Amount',
    };

    const csv = `Date,Details,Net Amount
2026-10-25,Customer Inflow,22000.00
2026-10-26,Bank Fee Outflow,-250.00`;

    const res = parseGenericCsv(csv, signedMapping);
    expect(res.success).toBe(true);
    expect(res.rows[0].lineType).toBe('CREDIT');
    expect(res.rows[0].amount.toString()).toBe('22000');
    expect(res.rows[1].lineType).toBe('DEBIT');
    expect(res.rows[1].amount.toString()).toBe('250');
  });
});
