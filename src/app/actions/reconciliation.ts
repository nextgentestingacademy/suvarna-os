'use server';

import { getServerSecurityContext } from '@/lib/security-context';
import {
  BankAccountService,
  CreateBankAccountInput,
  ListBankAccountsOptions,
  BankAccountValidationError,
  BankAccountConflictError,
  BankAccountNotFoundError,
} from '@/lib/bank-accounts';
import {
  BankStatementImporter,
  ImportStatementInput,
  ImportStatementResult,
  StatementValidationError,
  StatementAlreadyImportedError,
  StatementSecurityError,
} from '@/lib/reconciliation/importer';
import {
  ReconciliationMatcher,
  CreateProposedMatchInput,
  CreateAndConfirmMatchInput,
  ReverseMatchInput,
  MarkLineDiscrepantInput,
  IgnoreStatementLineInput,
  CandidateSearchOptions,
  StatementLineReconciliationStatus,
  MatchValidationError,
  MatchAllocationError,
  MatchNotFoundError,
} from '@/lib/reconciliation/matcher';
import {
  SettlementService,
  PostSettlementJournalInput,
  PostSettlementJournalResult,
  ReverseSettlementJournalInput,
  ReverseSettlementJournalResult,
  SettlementValidationError,
  SettlementConflictError,
  SettlementDiscrepancyError,
  SettlementSecurityError,
} from '@/lib/reconciliation/settlement';
import { parseGenericCsv } from '@/lib/reconciliation/parsers/generic-csv';
import { CsvColumnMapping, ParseResult } from '@/lib/reconciliation/parsers/types';
import { AuthorizationError } from '@/types/security';
import { revalidatePath } from 'next/cache';

export interface ActionOptions {
  headers?: Headers;
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

const bankAccountService = new BankAccountService();
const statementImporter = new BankStatementImporter();
const matcher = new ReconciliationMatcher();
const settlementService = new SettlementService();

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Gracefully ignore outside Next.js request context (e.g. in test suites)
  }
}

function serializeActionData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  return JSON.parse(
    JSON.stringify(data, (_, value) => {
      if (typeof value === 'object' && value !== null && typeof value.toFixed === 'function') {
        return value.toString();
      }
      return value;
    })
  );
}

function handleActionError<T>(err: any, defaultCode: string = 'OPERATION_FAILED'): ActionResult<T> {
  console.error('[Reconciliation Action Error]:', err);

  if (err instanceof AuthorizationError) {
    return {
      success: false,
      error: err.message,
      code: err.code || 'FORBIDDEN',
    };
  }

  if (
    err instanceof BankAccountValidationError ||
    err instanceof BankAccountConflictError ||
    err instanceof BankAccountNotFoundError ||
    err instanceof StatementValidationError ||
    err instanceof StatementAlreadyImportedError ||
    err instanceof StatementSecurityError ||
    err instanceof MatchValidationError ||
    err instanceof MatchAllocationError ||
    err instanceof MatchNotFoundError ||
    err instanceof SettlementValidationError ||
    err instanceof SettlementConflictError ||
    err instanceof SettlementDiscrepancyError ||
    err instanceof SettlementSecurityError
  ) {
    return {
      success: false,
      error: err.message,
      code: err.code || defaultCode,
    };
  }

  return {
    success: false,
    error: err?.message || 'An unexpected server error occurred.',
    code: err?.code || defaultCode,
  };
}

// ==============================================================================
// 1. BANK ACCOUNT ACTIONS
// ==============================================================================

export async function createBankAccountAction(
  input: CreateBankAccountInput,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const account = await bankAccountService.createBankAccount(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(account) };
  } catch (err: any) {
    return handleActionError(err, 'BANK_ACCOUNT_CREATE_FAILED');
  }
}

export async function listBankAccountsAction(
  listOptions?: ListBankAccountsOptions,
  actionOptions?: ActionOptions
): Promise<ActionResult<any[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers: actionOptions?.headers });
    const accounts = await bankAccountService.listBankAccounts(ctx, listOptions);
    return { success: true, data: serializeActionData(accounts) };
  } catch (err: any) {
    return handleActionError(err, 'BANK_ACCOUNT_LIST_FAILED');
  }
}

export async function deactivateBankAccountAction(
  bankAccountId: string,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await bankAccountService.deactivateBankAccount(ctx, bankAccountId);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(result) };
  } catch (err: any) {
    return handleActionError(err, 'BANK_ACCOUNT_DEACTIVATE_FAILED');
  }
}

// ==============================================================================
// 2. STATEMENT IMPORT ACTIONS
// ==============================================================================

export async function previewCsvStatementAction(
  input: {
    fileContent: string;
    columnMapping: CsvColumnMapping;
  },
  options?: ActionOptions
): Promise<ActionResult<ParseResult>> {
  try {
    // Assert authorization without changing database state
    await getServerSecurityContext({ headers: options?.headers });
    const parseResult = parseGenericCsv(input.fileContent, input.columnMapping);
    return { success: true, data: serializeActionData(parseResult) };
  } catch (err: any) {
    return handleActionError(err, 'CSV_PREVIEW_FAILED');
  }
}

export async function checkDuplicateFileAction(
  input: {
    bankAccountId: string;
    fileContent: string;
  },
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const dupCheck = await statementImporter.checkDuplicateFileHash(
      ctx,
      input.bankAccountId,
      input.fileContent
    );
    return { success: true, data: serializeActionData(dupCheck) };
  } catch (err: any) {
    return handleActionError(err, 'DUPLICATE_CHECK_FAILED');
  }
}

export async function importStatementAction(
  input: ImportStatementInput,
  options?: ActionOptions
): Promise<ActionResult<ImportStatementResult>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await statementImporter.importStatement(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(result) };
  } catch (err: any) {
    return handleActionError(err, 'STATEMENT_IMPORT_FAILED');
  }
}

export async function listStatementImportsAction(
  input?: { bankAccountId?: string },
  options?: ActionOptions
): Promise<ActionResult<any[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const imports = await statementImporter.listStatementImports(ctx, input?.bankAccountId);
    return { success: true, data: serializeActionData(imports) };
  } catch (err: any) {
    return handleActionError(err, 'STATEMENT_IMPORTS_LIST_FAILED');
  }
}

// ==============================================================================
// 3. STATEMENT LINES & SUMMARY ACTIONS
// ==============================================================================

export async function getReconciliationSummaryAction(
  filter?: {
    bankAccountId?: string;
    startDate?: string;
    endDate?: string;
  },
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const summary = await matcher.getReconciliationSummary(ctx, {
      bankAccountId: filter?.bankAccountId,
      startDate: filter?.startDate ? new Date(filter.startDate) : undefined,
      endDate: filter?.endDate ? new Date(filter.endDate) : undefined,
    });
    return { success: true, data: serializeActionData(summary) };
  } catch (err: any) {
    return handleActionError(err, 'SUMMARY_FETCH_FAILED');
  }
}

export async function getStatementLinesAction(
  filter?: {
    bankAccountId?: string;
    importId?: string;
    status?: StatementLineReconciliationStatus[];
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
  options?: ActionOptions
): Promise<ActionResult<{ total: number; lines: any[] }>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const res = await matcher.getStatementLines(ctx, {
      bankAccountId: filter?.bankAccountId,
      importId: filter?.importId,
      status: filter?.status,
      startDate: filter?.startDate ? new Date(filter.startDate) : undefined,
      endDate: filter?.endDate ? new Date(filter.endDate) : undefined,
      search: filter?.search,
      limit: filter?.limit,
      offset: filter?.offset,
    });
    return { success: true, data: serializeActionData(res) };
  } catch (err: any) {
    return handleActionError(err, 'STATEMENT_LINES_FETCH_FAILED');
  }
}

export async function getStatementLineDetailsAction(
  statementLineId: string,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const line = await matcher.getStatementLineById(ctx, statementLineId);
    return { success: true, data: serializeActionData(line) };
  } catch (err: any) {
    return handleActionError(err, 'STATEMENT_LINE_DETAILS_FAILED');
  }
}

export async function findCandidateMatchesAction(
  statementLineId: string,
  searchOptions?: CandidateSearchOptions,
  options?: ActionOptions
): Promise<ActionResult<any[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const candidates = await matcher.findCandidateMatches(ctx, statementLineId, searchOptions);
    return { success: true, data: serializeActionData(candidates) };
  } catch (err: any) {
    return handleActionError(err, 'CANDIDATE_SEARCH_FAILED');
  }
}

export async function searchUnallocatedPaymentsAction(
  params?: {
    query?: string;
    paymentMethod?: string;
    limit?: number;
  },
  options?: ActionOptions
): Promise<ActionResult<any[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const payments = await matcher.searchUnallocatedPayments(ctx, params);
    return { success: true, data: serializeActionData(payments) };
  } catch (err: any) {
    return handleActionError(err, 'UNALLOCATED_PAYMENTS_SEARCH_FAILED');
  }
}

// ==============================================================================
// 4. MATCHING WORKFLOW ACTIONS
// ==============================================================================

export async function createProposedMatchAction(
  input: CreateProposedMatchInput,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const match = await matcher.createProposedMatch(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(match) };
  } catch (err: any) {
    return handleActionError(err, 'PROPOSE_MATCH_FAILED');
  }
}

export async function confirmMatchAction(
  matchId: string,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const match = await matcher.confirmMatch(ctx, matchId);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(match) };
  } catch (err: any) {
    return handleActionError(err, 'CONFIRM_MATCH_FAILED');
  }
}

export async function createAndConfirmMatchAction(
  input: CreateAndConfirmMatchInput,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const match = await matcher.createAndConfirmMatch(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(match) };
  } catch (err: any) {
    return handleActionError(err, 'CREATE_AND_CONFIRM_MATCH_FAILED');
  }
}

export async function reverseMatchAction(
  input: ReverseMatchInput,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const match = await matcher.reverseMatch(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(match) };
  } catch (err: any) {
    return handleActionError(err, 'REVERSE_MATCH_FAILED');
  }
}

export async function markLineDiscrepantAction(
  input: MarkLineDiscrepantInput,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const line = await matcher.markLineDiscrepant(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(line) };
  } catch (err: any) {
    return handleActionError(err, 'MARK_DISCREPANT_FAILED');
  }
}

export async function ignoreStatementLineAction(
  input: IgnoreStatementLineInput,
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const line = await matcher.ignoreStatementLine(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(line) };
  } catch (err: any) {
    return handleActionError(err, 'IGNORE_LINE_FAILED');
  }
}

// ==============================================================================
// 5. SETTLEMENT WORKFLOW ACTIONS
// ==============================================================================

export async function getSettlementPreviewAction(
  input: {
    statementLineId: string;
    feeAmount?: number | string;
  },
  options?: ActionOptions
): Promise<ActionResult<any>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const preview = await settlementService.getSettlementPreview(
      ctx,
      input.statementLineId,
      input.feeAmount
    );
    return { success: true, data: serializeActionData(preview) };
  } catch (err: any) {
    return handleActionError(err, 'SETTLEMENT_PREVIEW_FAILED');
  }
}

export async function postSettlementJournalAction(
  input: PostSettlementJournalInput,
  options?: ActionOptions
): Promise<ActionResult<PostSettlementJournalResult>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await settlementService.postSettlementJournal(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(result) };
  } catch (err: any) {
    return handleActionError(err, 'POST_SETTLEMENT_FAILED');
  }
}

export async function reverseSettlementJournalAction(
  input: ReverseSettlementJournalInput,
  options?: ActionOptions
): Promise<ActionResult<ReverseSettlementJournalResult>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await settlementService.reverseSettlementJournal(ctx, input);
    safeRevalidatePath('/reconciliation');
    return { success: true, data: serializeActionData(result) };
  } catch (err: any) {
    return handleActionError(err, 'REVERSE_SETTLEMENT_FAILED');
  }
}
