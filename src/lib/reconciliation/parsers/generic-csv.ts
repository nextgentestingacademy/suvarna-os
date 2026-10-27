import { Decimal } from 'decimal.js';
import * as crypto from 'crypto';
import {
  CsvColumnMapping,
  ParseResult,
  NormalizedStatementRow,
  StatementRowError,
  StatementLineType,
} from './types';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Standard RFC 4180 CSV tokenizer.
 * Correctly handles quotes, escaped quotes (""), commas inside quotes,
 * and CRLF / LF line endings.
 */
export function tokenizeCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: ""
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Consume \n
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final field/row if content didn't end with a newline
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parses dates into standard Date objects.
 * Supports ISO (YYYY-MM-DD), Indian/Commonwealth (DD/MM/YYYY, DD-MM-YYYY).
 */
export function parseDate(rawDate: string, format?: string): Date | null {
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  // 1. Try ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return d;
    }
  }

  // 2. Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return d;
    }
  }

  // 3. Native Date parse fallback
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Normalizes decimal monetary strings by stripping commas, currency symbols, and spaces.
 */
export function parseMoneyDecimal(rawAmount: string): Decimal | null {
  const cleaned = rawAmount.replace(/[₹$€£,\s]/g, '').trim();
  if (!cleaned) return null;

  try {
    const dec = new Decimal(cleaned);
    if (!dec.isFinite()) return null;
    return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } catch {
    return null;
  }
}

/**
 * Sanitizes description strings to prevent spreadsheet formula injection.
 */
export function sanitizeDescription(desc: string): string {
  const trimmed = desc.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Generates an immutable transaction attribute fingerprint for duplicate review signal.
 */
export function computeLineFingerprint(
  date: Date,
  reference: string | null | undefined,
  lineType: StatementLineType,
  amount: Decimal
): string {
  const dateStr = date.toISOString().split('T')[0];
  const refStr = (reference || '').trim().toUpperCase();
  const amtStr = amount.toFixed(2);
  const payload = `${dateStr}|${refStr}|${lineType}|${amtStr}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Pure generic CSV parser with explicit column mapping.
 */
export function parseGenericCsv(content: string, mapping: CsvColumnMapping): ParseResult {
  const errors: StatementRowError[] = [];
  const rows: NormalizedStatementRow[] = [];

  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      rows: [],
      errors: [
        {
          lineNumber: 0,
          message: `File size exceeds maximum permitted limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
        },
      ],
      totalLinesCount: 0,
    };
  }

  const rawGrid = tokenizeCsv(content);
  if (rawGrid.length < 2) {
    return {
      success: false,
      rows: [],
      errors: [{ lineNumber: 1, message: 'CSV file is empty or missing data rows.' }],
      totalLinesCount: 0,
    };
  }

  // 1. Resolve header indexes
  const headerRow = rawGrid[0].map((h) => h.trim().toLowerCase());
  const colIndex = (colName?: string): number => {
    if (!colName) return -1;
    return headerRow.indexOf(colName.trim().toLowerCase());
  };

  const dateIdx = colIndex(mapping.dateColumn);
  const valueDateIdx = colIndex(mapping.valueDateColumn);
  const descIdx = colIndex(mapping.descriptionColumn);
  const refIdx = colIndex(mapping.referenceColumn);
  const balanceIdx = colIndex(mapping.balanceColumn);

  if (dateIdx === -1) {
    errors.push({ lineNumber: 1, field: mapping.dateColumn, message: `Header column '${mapping.dateColumn}' not found.` });
  }
  if (descIdx === -1) {
    errors.push({ lineNumber: 1, field: mapping.descriptionColumn, message: `Header column '${mapping.descriptionColumn}' not found.` });
  }

  let debitIdx = -1;
  let creditIdx = -1;
  let amountIdx = -1;
  let typeIdx = -1;

  if (mapping.amountMode === 'SEPARATE_COLUMNS') {
    debitIdx = colIndex(mapping.debitColumn);
    creditIdx = colIndex(mapping.creditColumn);
    if (debitIdx === -1) {
      errors.push({ lineNumber: 1, field: mapping.debitColumn, message: `Debit column '${mapping.debitColumn}' not found.` });
    }
    if (creditIdx === -1) {
      errors.push({ lineNumber: 1, field: mapping.creditColumn, message: `Credit column '${mapping.creditColumn}' not found.` });
    }
  } else if (mapping.amountMode === 'SINGLE_AMOUNT_WITH_TYPE') {
    amountIdx = colIndex(mapping.amountColumn);
    typeIdx = colIndex(mapping.typeColumn);
    if (amountIdx === -1) {
      errors.push({ lineNumber: 1, field: mapping.amountColumn, message: `Amount column '${mapping.amountColumn}' not found.` });
    }
    if (typeIdx === -1) {
      errors.push({ lineNumber: 1, field: mapping.typeColumn, message: `Transaction type column '${mapping.typeColumn}' not found.` });
    }
  } else if (mapping.amountMode === 'SIGNED_AMOUNT') {
    amountIdx = colIndex(mapping.amountColumn);
    if (amountIdx === -1) {
      errors.push({ lineNumber: 1, field: mapping.amountColumn, message: `Amount column '${mapping.amountColumn}' not found.` });
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      rows: [],
      errors,
      totalLinesCount: 0,
    };
  }

  // 2. Parse data rows
  let minDate: Date | undefined;
  let maxDate: Date | undefined;
  let validLineCount = 0;

  for (let r = 1; r < rawGrid.length; r++) {
    const rawRow = rawGrid[r];
    const lineNum = r + 1; // 1-indexed for human reporting

    // Skip empty lines
    if (rawRow.length === 0 || (rawRow.length === 1 && !rawRow[0].trim())) {
      continue;
    }

    // Check column count consistency
    if (rawRow.length < headerRow.length) {
      errors.push({
        lineNumber: lineNum,
        message: `Inconsistent column count: expected ${headerRow.length} columns, found ${rawRow.length}.`,
      });
      continue;
    }

    // Date
    const rawDateStr = rawRow[dateIdx];
    const transactionDate = parseDate(rawDateStr, mapping.dateFormat);
    if (!transactionDate) {
      errors.push({
        lineNumber: lineNum,
        field: mapping.dateColumn,
        message: `Invalid or unparseable transaction date: '${rawDateStr}'.`,
      });
      continue;
    }

    // Value Date (optional)
    let valueDate: Date | null = null;
    if (valueDateIdx !== -1 && rawRow[valueDateIdx]?.trim()) {
      valueDate = parseDate(rawRow[valueDateIdx], mapping.dateFormat);
    }

    // Description
    const rawDesc = rawRow[descIdx] || '';
    if (!rawDesc.trim()) {
      errors.push({
        lineNumber: lineNum,
        field: mapping.descriptionColumn,
        message: 'Transaction description / narration is required.',
      });
      continue;
    }
    const description = sanitizeDescription(rawDesc);

    // Reference
    const referenceNumber = refIdx !== -1 && rawRow[refIdx]?.trim() ? rawRow[refIdx].trim() : null;

    // Amount & LineType
    let lineType: StatementLineType | null = null;
    let amount: Decimal | null = null;

    if (mapping.amountMode === 'SEPARATE_COLUMNS') {
      const rawDebit = rawRow[debitIdx]?.trim() || '';
      const rawCredit = rawRow[creditIdx]?.trim() || '';

      const debitDec = rawDebit ? parseMoneyDecimal(rawDebit) : null;
      const creditDec = rawCredit ? parseMoneyDecimal(rawCredit) : null;

      if (debitDec && creditDec && debitDec.gt(0) && creditDec.gt(0)) {
        errors.push({
          lineNumber: lineNum,
          message: 'Both debit and credit amounts cannot be positive on the same row.',
        });
        continue;
      }

      if (creditDec && creditDec.gt(0)) {
        lineType = 'CREDIT';
        amount = creditDec;
      } else if (debitDec && debitDec.gt(0)) {
        lineType = 'DEBIT';
        amount = debitDec;
      } else {
        errors.push({
          lineNumber: lineNum,
          message: 'Row must contain a non-zero positive debit or credit amount.',
        });
        continue;
      }
    } else if (mapping.amountMode === 'SINGLE_AMOUNT_WITH_TYPE') {
      const rawAmt = rawRow[amountIdx]?.trim() || '';
      const rawType = rawRow[typeIdx]?.trim().toUpperCase() || '';
      const parsedAmt = parseMoneyDecimal(rawAmt);

      if (!parsedAmt || parsedAmt.lte(0)) {
        errors.push({
          lineNumber: lineNum,
          field: mapping.amountColumn,
          message: `Invalid or non-positive amount: '${rawAmt}'.`,
        });
        continue;
      }

      const creditMatch = mapping.creditTypeValue
        ? rawType === mapping.creditTypeValue.trim().toUpperCase()
        : ['CR', 'CREDIT', 'DEP', 'DEPOSIT'].includes(rawType);

      const debitMatch = mapping.debitTypeValue
        ? rawType === mapping.debitTypeValue.trim().toUpperCase()
        : ['DR', 'DEBIT', 'WD', 'WITHDRAWAL'].includes(rawType);

      if (creditMatch) {
        lineType = 'CREDIT';
        amount = parsedAmt;
      } else if (debitMatch) {
        lineType = 'DEBIT';
        amount = parsedAmt;
      } else {
        errors.push({
          lineNumber: lineNum,
          field: mapping.typeColumn,
          message: `Unrecognized transaction type: '${rawType}'. Expected Credit or Debit indicator.`,
        });
        continue;
      }
    } else if (mapping.amountMode === 'SIGNED_AMOUNT') {
      const rawAmt = rawRow[amountIdx]?.trim() || '';
      const parsedAmt = parseMoneyDecimal(rawAmt);

      if (!parsedAmt || parsedAmt.isZero()) {
        errors.push({
          lineNumber: lineNum,
          field: mapping.amountColumn,
          message: `Amount must be a non-zero monetary decimal: '${rawAmt}'.`,
        });
        continue;
      }

      if (parsedAmt.gt(0)) {
        lineType = 'CREDIT';
        amount = parsedAmt;
      } else {
        lineType = 'DEBIT';
        amount = parsedAmt.abs();
      }
    }

    if (!lineType || !amount || amount.lte(0)) {
      errors.push({
        lineNumber: lineNum,
        message: 'Could not determine valid transaction amount and debit/credit direction.',
      });
      continue;
    }

    // Running Balance (optional)
    let runningBalance: Decimal | null = null;
    if (balanceIdx !== -1 && rawRow[balanceIdx]?.trim()) {
      runningBalance = parseMoneyDecimal(rawRow[balanceIdx]);
    }

    // Track date bounds
    if (!minDate || transactionDate < minDate) minDate = transactionDate;
    if (!maxDate || transactionDate > maxDate) maxDate = transactionDate;

    validLineCount++;

    const fingerprint = computeLineFingerprint(transactionDate, referenceNumber, lineType, amount);

    rows.push({
      lineNumber: validLineCount,
      transactionDate,
      valueDate,
      description,
      referenceNumber,
      lineType,
      amount,
      runningBalance,
      duplicateFingerprint: fingerprint,
    });
  }

  return {
    success: errors.length === 0,
    rows: errors.length === 0 ? rows : [],
    errors,
    statementStartDate: minDate,
    statementEndDate: maxDate,
    totalLinesCount: rows.length,
  };
}
