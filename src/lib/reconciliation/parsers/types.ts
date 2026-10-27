import { Decimal } from 'decimal.js';

export type StatementLineType = 'CREDIT' | 'DEBIT';

export interface NormalizedStatementRow {
  lineNumber: number;
  transactionDate: Date;
  valueDate?: Date | null;
  description: string;
  referenceNumber?: string | null;
  lineType: StatementLineType;
  amount: Decimal;
  runningBalance?: Decimal | null;
  duplicateFingerprint: string;
}

export interface StatementRowError {
  lineNumber: number;
  field?: string;
  message: string;
}

export type CsvAmountMode = 'SEPARATE_COLUMNS' | 'SINGLE_AMOUNT_WITH_TYPE' | 'SIGNED_AMOUNT';
export type CsvDateFormat = 'ISO' | 'DMY_SLASH' | 'DMY_DASH' | 'AUTO' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';

export interface CsvColumnMapping {
  dateColumn: string;
  valueDateColumn?: string;
  descriptionColumn: string;
  referenceColumn?: string;
  amountMode: CsvAmountMode;
  debitColumn?: string;
  creditColumn?: string;
  amountColumn?: string;
  typeColumn?: string;
  creditTypeValue?: string; // e.g. "CR", "CREDIT", "Deposit"
  debitTypeValue?: string;  // e.g. "DR", "DEBIT", "Withdrawal"
  balanceColumn?: string;
  dateFormat?: CsvDateFormat;
}

export interface ParseResult {
  success: boolean;
  rows: NormalizedStatementRow[];
  errors: StatementRowError[];
  statementStartDate?: Date;
  statementEndDate?: Date;
  totalLinesCount: number;
}
