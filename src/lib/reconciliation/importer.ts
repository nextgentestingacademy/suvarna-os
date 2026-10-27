import { PrismaClient, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess } from '@/lib/rbac';
import { prisma as defaultPrisma } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { CsvColumnMapping, StatementRowError } from './parsers/types';
import { parseGenericCsv } from './parsers/generic-csv';

// ==============================================================================
// ERROR TYPES
// ==============================================================================

export class StatementValidationError extends Error {
  constructor(
    message: string,
    public readonly rowErrors: StatementRowError[] = [],
    public readonly code: string = 'STATEMENT_VALIDATION_ERROR'
  ) {
    super(message);
    this.name = 'StatementValidationError';
  }
}

export class StatementAlreadyImportedError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'FILE_ALREADY_IMPORTED',
    public readonly existingImportId?: string
  ) {
    super(message);
    this.name = 'StatementAlreadyImportedError';
  }
}

export class StatementSecurityError extends Error {
  constructor(message: string, public readonly code: string = 'SECURITY_ERROR') {
    super(message);
    this.name = 'StatementSecurityError';
  }
}

// ==============================================================================
// INPUT / OUTPUT INTERFACES
// ==============================================================================

export interface ImportStatementInput {
  bankAccountId: string;
  fileName: string;
  fileContent: string;
  sourceType?: 'BANK_STATEMENT' | 'GATEWAY_SETTLEMENT' | 'EDC_SETTLEMENT';
  fileFormat?: string;
  columnMapping: CsvColumnMapping;
}

export interface ImportStatementResult {
  importId: string;
  bankAccountId: string;
  fileName: string;
  fileHash: string;
  linesCount: number;
  statementStartDate?: Date | null;
  statementEndDate?: Date | null;
  status: string;
}

export interface BankStatementImporterOptions {
  prisma?: PrismaClient;
}

// ==============================================================================
// BANK STATEMENT IMPORTER IMPLEMENTATION
// ==============================================================================

export class BankStatementImporter {
  private readonly db: PrismaClient;

  constructor(options?: BankStatementImporterOptions) {
    this.db = options?.prisma ?? defaultPrisma;
  }

  /**
   * Asserts authorized staff role for bank statement imports.
   * Restricted to OWNER or ACCOUNTANT roles with ACCOUNTS_VIEW permission.
   */
  private assertImportPermission(ctx: SecurityContext): void {
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    if (ctx.role !== 'OWNER' && ctx.role !== 'ACCOUNTANT') {
      throw new AuthorizationError(
        `Permission denied: Role '${ctx.role}' is not authorized to import bank statements.`,
        'STATEMENT_IMPORT_FORBIDDEN'
      );
    }
  }

  /**
   * Imports a bank statement or payment settlement CSV.
   * - Validates server-side security context and branch scoping.
   * - Parses and validates row-level data and column mappings.
   * - Detects duplicate files idempotently via SHA-256 file content hash.
   * - Inserts the import header and statement lines within an atomic database transaction.
   * - Records privacy-safe audit trail.
   */
  async importStatement(ctx: SecurityContext, input: ImportStatementInput): Promise<ImportStatementResult> {
    this.assertImportPermission(ctx);

    const tenantId = ctx.tenantId;

    if (!input.bankAccountId?.trim()) {
      throw new StatementValidationError('Bank account ID is required.');
    }
    if (!input.fileName?.trim()) {
      throw new StatementValidationError('File name is required.');
    }
    if (!input.fileContent) {
      throw new StatementValidationError('File content is empty.');
    }
    if (Buffer.byteLength(input.fileContent, 'utf8') > 5 * 1024 * 1024) {
      throw new StatementValidationError('File size exceeds maximum permitted limit of 5 MB.');
    }

    // 1. Resolve bank account and enforce tenant / branch isolation
    const bankAccount = await this.db.bankAccount.findFirst({
      where: {
        id: input.bankAccountId.trim(),
        organizationId: tenantId,
      },
    });

    if (!bankAccount) {
      throw new StatementSecurityError(
        'Bank account not found or belongs to another business.',
        'BANK_ACCOUNT_NOT_FOUND'
      );
    }

    if (!bankAccount.isActive) {
      throw new StatementValidationError('Cannot import statements into an inactive bank account.');
    }

    if (bankAccount.branchId) {
      assertBranchAccess(ctx, bankAccount.branchId);
    }

    // 2. Compute SHA-256 file content hash for idempotent re-upload prevention
    const fileHash = crypto.createHash('sha256').update(input.fileContent).digest('hex');

    // Fast-path: Check if file was already imported for this bank account
    const existingImport = await this.db.bankStatementImport.findUnique({
      where: {
        organizationId_bankAccountId_fileHash: {
          organizationId: tenantId,
          bankAccountId: bankAccount.id,
          fileHash,
        },
      },
    });

    if (existingImport) {
      const importedDate = existingImport.createdAt.toISOString().split('T')[0];
      throw new StatementAlreadyImportedError(
        `Statement file '${input.fileName}' has already been imported for this account on ${importedDate}.`,
        'FILE_ALREADY_IMPORTED',
        existingImport.id
      );
    }

    // 3. Parse and validate CSV data rows
    const parseResult = parseGenericCsv(input.fileContent, input.columnMapping);
    if (!parseResult.success || parseResult.errors.length > 0) {
      throw new StatementValidationError(
        `Statement CSV validation failed with ${parseResult.errors.length} error(s).`,
        parseResult.errors
      );
    }

    if (parseResult.rows.length === 0) {
      throw new StatementValidationError('Statement file contains no valid transaction rows.');
    }

    // 4. Atomic database transaction: create import header, lines, and audit log
    try {
      return await this.db.$transaction(async (tx) => {
        // Create BankStatementImport header
        const importRecord = await tx.bankStatementImport.create({
          data: {
            organizationId: tenantId,
            bankAccountId: bankAccount.id,
            sourceType: input.sourceType ?? 'BANK_STATEMENT',
            fileFormat: input.fileFormat ?? 'GENERIC_CSV',
            fileName: input.fileName.trim(),
            fileHash,
            statementStartDate: parseResult.statementStartDate ?? null,
            statementEndDate: parseResult.statementEndDate ?? null,
            totalLinesCount: parseResult.rows.length,
            importedByUserId: ctx.userId,
            status: 'PROCESSED',
          },
        });

        // Insert all validated statement lines
        await tx.bankStatementLine.createMany({
          data: parseResult.rows.map((row) => ({
            organizationId: tenantId,
            importId: importRecord.id,
            bankAccountId: bankAccount.id,
            lineNumber: row.lineNumber,
            transactionDate: row.transactionDate,
            valueDate: row.valueDate ?? null,
            description: row.description,
            referenceNumber: row.referenceNumber ?? null,
            lineType: row.lineType,
            amount: row.amount.toFixed(2),
            runningBalance: row.runningBalance ? row.runningBalance.toFixed(2) : null,
            reconciliationStatus: 'UNMATCHED',
            duplicateFingerprint: row.duplicateFingerprint,
          })),
        });

        // Record audit trail event
        await recordAuditLog(tx, ctx, {
          action: 'CREATE',
          entityType: 'BankStatementImport',
          entityId: importRecord.id,
          changedFields: {
            fileName: input.fileName.trim(),
            fileHash,
            totalLinesCount: parseResult.rows.length,
            bankAccountId: bankAccount.id,
            statementStartDate: parseResult.statementStartDate?.toISOString(),
            statementEndDate: parseResult.statementEndDate?.toISOString(),
          },
        });

        return {
          importId: importRecord.id,
          bankAccountId: bankAccount.id,
          fileName: importRecord.fileName,
          fileHash: importRecord.fileHash,
          linesCount: parseResult.rows.length,
          statementStartDate: parseResult.statementStartDate,
          statementEndDate: parseResult.statementEndDate,
          status: importRecord.status,
        };
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new StatementAlreadyImportedError(
          `Statement file '${input.fileName}' was already imported concurrently.`,
          'FILE_ALREADY_IMPORTED'
        );
      }
      throw err;
    }
  }

  /**
   * Checks whether a CSV file content has already been imported for a specific bank account.
   */
  async checkDuplicateFileHash(ctx: SecurityContext, bankAccountId: string, fileContent: string) {
    this.assertImportPermission(ctx);
    const tenantId = ctx.tenantId;

    const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');

    const existingImport = await this.db.bankStatementImport.findUnique({
      where: {
        organizationId_bankAccountId_fileHash: {
          organizationId: tenantId,
          bankAccountId,
          fileHash,
        },
      },
      include: {
        importedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return {
      fileHash,
      isDuplicate: !!existingImport,
      existingImport: existingImport
        ? {
            id: existingImport.id,
            fileName: existingImport.fileName,
            createdAt: existingImport.createdAt,
            totalLinesCount: existingImport.totalLinesCount,
            importedBy: existingImport.importedByUser?.name || existingImport.importedByUser?.email,
          }
        : null,
    };
  }

  /**
   * Lists past bank statement imports for the authorized tenant and optional bank account.
   */
  async listStatementImports(ctx: SecurityContext, bankAccountId?: string) {
    this.assertImportPermission(ctx);
    const tenantId = ctx.tenantId;

    if (bankAccountId) {
      const bankAccount = await this.db.bankAccount.findFirst({
        where: { id: bankAccountId, organizationId: tenantId },
      });
      if (bankAccount?.branchId) {
        assertBranchAccess(ctx, bankAccount.branchId);
      }
    }

    return this.db.bankStatementImport.findMany({
      where: {
        organizationId: tenantId,
        ...(bankAccountId ? { bankAccountId } : {}),
      },
      include: {
        bankAccount: {
          select: { id: true, accountName: true, bankName: true, branchId: true },
        },
        importedByUser: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { lines: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

export const bankStatementImporter = new BankStatementImporter();
