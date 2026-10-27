'use client';

import React, { useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Table,
  Eye,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  previewCsvStatementAction,
  checkDuplicateFileAction,
  importStatementAction,
} from '@/app/actions/reconciliation';
import { CsvColumnMapping, CsvAmountMode, CsvDateFormat, ParseResult } from '@/lib/reconciliation/parsers/types';

interface BankAccountOption {
  id: string;
  accountName: string;
  bankName: string;
  accountNumberMasked: string;
  branch?: { name: string; code: string } | null;
}

interface StatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bankAccounts: BankAccountOption[];
  preselectedAccountId?: string;
}

export const StatementImportModal: React.FC<StatementImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  bankAccounts,
  preselectedAccountId,
}) => {
  const [bankAccountId, setBankAccountId] = useState<string>(
    preselectedAccountId || (bankAccounts[0]?.id ?? '')
  );
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [sourceType, setSourceType] = useState<'BANK_STATEMENT' | 'GATEWAY_SETTLEMENT' | 'EDC_SETTLEMENT'>('BANK_STATEMENT');

  // Mapping configuration
  const [dateColumn, setDateColumn] = useState('Date');
  const [descriptionColumn, setDescriptionColumn] = useState('Description');
  const [referenceColumn, setReferenceColumn] = useState('Reference');
  const [amountMode, setAmountMode] = useState<CsvAmountMode>('SEPARATE_COLUMNS');
  const [dateFormat, setDateFormat] = useState<CsvDateFormat>('DD/MM/YYYY');
  const [creditColumn, setCreditColumn] = useState('Credit');
  const [debitColumn, setDebitColumn] = useState('Debit');
  const [amountColumn, setAmountColumn] = useState('Amount');
  const [typeColumn, setTypeColumn] = useState('Type');
  const [creditTypeValue, setCreditTypeValue] = useState('CR');
  const [balanceColumn, setBalanceColumn] = useState('Balance');

  // Preview & duplicate status
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<ParseResult | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    isDuplicate: boolean;
    existingImport?: any;
  } | null>(null);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function buildMapping(): CsvColumnMapping {
    return {
      dateColumn: dateColumn.trim(),
      descriptionColumn: descriptionColumn.trim(),
      referenceColumn: referenceColumn.trim() || undefined,
      amountMode,
      dateFormat,
      creditColumn: amountMode === 'SEPARATE_COLUMNS' ? creditColumn.trim() : undefined,
      debitColumn: amountMode === 'SEPARATE_COLUMNS' ? debitColumn.trim() : undefined,
      amountColumn: amountMode !== 'SEPARATE_COLUMNS' ? amountColumn.trim() : undefined,
      typeColumn: amountMode === 'SINGLE_AMOUNT_WITH_TYPE' ? typeColumn.trim() : undefined,
      creditTypeValue: amountMode === 'SINGLE_AMOUNT_WITH_TYPE' ? creditTypeValue.trim() : undefined,
      balanceColumn: balanceColumn.trim() || undefined,
    };
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setPreviewResult(null);
    setDuplicateWarning(null);

    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      // Auto-detect header names from first line
      const firstLine = content.split(/\r?\n/)[0];
      if (firstLine) {
        const headers = firstLine.split(',').map((h) => h.replace(/^["']|["']$/g, '').trim());
        if (headers.some((h) => /date/i.test(h))) {
          const match = headers.find((h) => /date/i.test(h));
          if (match) setDateColumn(match);
        }
        if (headers.some((h) => /desc|narration|particular/i.test(h))) {
          const match = headers.find((h) => /desc|narration|particular/i.test(h));
          if (match) setDescriptionColumn(match);
        }
        if (headers.some((h) => /ref|utr|chq|cheque/i.test(h))) {
          const match = headers.find((h) => /ref|utr|chq|cheque/i.test(h));
          if (match) setReferenceColumn(match);
        }
        if (headers.some((h) => /credit|deposit/i.test(h))) {
          const match = headers.find((h) => /credit|deposit/i.test(h));
          if (match) setCreditColumn(match);
        }
        if (headers.some((h) => /debit|withdrawal/i.test(h))) {
          const match = headers.find((h) => /debit|withdrawal/i.test(h));
          if (match) setDebitColumn(match);
        }
      }
    };
    reader.readAsText(file);
  }

  async function handlePreview() {
    if (!fileContent.trim()) {
      setError('Please select or paste CSV content first.');
      return;
    }
    if (!bankAccountId) {
      setError('Please select target bank account.');
      return;
    }

    setPreviewing(true);
    setError(null);
    try {
      const mapping = buildMapping();
      const [previewRes, dupRes] = await Promise.all([
        previewCsvStatementAction({ fileContent, columnMapping: mapping }),
        checkDuplicateFileAction({ bankAccountId, fileContent }),
      ]);

      if (!previewRes.success || !previewRes.data) {
        setError(previewRes.error || 'Failed to parse CSV preview.');
        setPreviewing(false);
        return;
      }

      setPreviewResult(previewRes.data);

      if (dupRes.success && dupRes.data?.isDuplicate) {
        setDuplicateWarning(dupRes.data);
      } else {
        setDuplicateWarning(null);
      }
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!fileContent.trim() || !fileName.trim()) {
      setError('Please select a valid CSV file.');
      return;
    }
    if (!bankAccountId) {
      setError('Please select target bank account.');
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const mapping = buildMapping();
      const res = await importStatementAction({
        bankAccountId,
        fileName,
        fileContent,
        sourceType,
        columnMapping: mapping,
      });

      if (!res.success) {
        setError(res.error || 'Failed to import statement.');
        setImporting(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-[#eee2dc] shadow-xl w-full max-w-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eee2dc] bg-[#fffaf5]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#f4ead5] text-[#542047] flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-[#d49a24]" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-[#542047]">Import Bank Statement</h2>
              <p className="text-[11px] text-[#68647a]">Upload CSV with explicit column mapping & duplicate protection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close import modal"
            className="text-[#68647a] hover:text-[#542047] p-1.5 rounded-lg hover:bg-black/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {duplicateWarning?.isDuplicate && (
            <div className="p-3.5 bg-[#fff8e6] border border-[#f5d070] text-[#8c5e0e] rounded-xl text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-[#d49a24]" />
              <div>
                <p className="font-bold">Duplicate File Detected</p>
                <p className="text-[11px] mt-0.5 leading-relaxed">
                  This exact file content was already imported on{' '}
                  {new Date(duplicateWarning.existingImport.createdAt).toLocaleDateString()} (Import ID:{' '}
                  <span className="font-mono">{duplicateWarning.existingImport.id.slice(0, 8)}</span>). Re-uploading the same file to this account will be rejected to protect ledger integrity.
                </p>
              </div>
            </div>
          )}

          {/* Account & Source Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                Target Bank Account *
              </label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
                required
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountName} ({acc.bankName} - {acc.accountNumberMasked})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                Source Document Type *
              </label>
              <select
                value={sourceType}
                onChange={(e: any) => setSourceType(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
              >
                <option value="BANK_STATEMENT">Bank Statement (Current / Savings)</option>
                <option value="EDC_SETTLEMENT">POS Card Terminal Settlement (Pine Labs / EDC)</option>
                <option value="GATEWAY_SETTLEMENT">Online Payment Gateway (Razorpay / Billdesk)</option>
              </select>
            </div>
          </div>

          {/* File Picker */}
          <div>
            <label className="block text-xs font-semibold text-[#542047] mb-1">
              Select Statement CSV File *
            </label>
            <div className="border-2 border-dashed border-[#eee2dc] hover:border-[#d49a24] rounded-2xl p-4 text-center bg-[#fffaf5] transition cursor-pointer relative">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="w-6 h-6 text-[#d49a24] mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-[#542047]">
                {fileName ? fileName : 'Click to upload or drag & drop bank statement CSV'}
              </p>
              <p className="text-[10px] text-[#68647a] mt-0.5">
                Maximum file size: 5 MB. Supported format: Standard UTF-8 CSV
              </p>
            </div>
          </div>

          {/* Column Mapping Configuration */}
          <div className="border border-[#eee2dc] rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#eee2dc]">
              <span className="text-xs font-bold text-[#542047] flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5 text-[#d49a24]" />
                Column Mapping Configuration
              </span>
              <span className="text-[10px] text-[#68647a]">Matches CSV header names exactly</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                  Date Column Name *
                </label>
                <input
                  type="text"
                  value={dateColumn}
                  onChange={(e) => setDateColumn(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                  placeholder="Date"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                  Date Format *
                </label>
                <select
                  value={dateFormat}
                  onChange={(e: any) => setDateFormat(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY (Indian Standard)</option>
                  <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                  <option value="AUTO">Auto Detect</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                  Description Column *
                </label>
                <input
                  type="text"
                  value={descriptionColumn}
                  onChange={(e) => setDescriptionColumn(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                  placeholder="Narration"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                  Reference / UTR Column
                </label>
                <input
                  type="text"
                  value={referenceColumn}
                  onChange={(e) => setReferenceColumn(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                  placeholder="Reference"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                  Amount Mode *
                </label>
                <select
                  value={amountMode}
                  onChange={(e: any) => setAmountMode(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden"
                >
                  <option value="SEPARATE_COLUMNS">Separate Credit & Debit Columns</option>
                  <option value="SINGLE_AMOUNT_WITH_TYPE">Single Amount + Type Indicator</option>
                  <option value="SIGNED_AMOUNT">Single Signed Amount (+/-)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                  Running Balance Column
                </label>
                <input
                  type="text"
                  value={balanceColumn}
                  onChange={(e) => setBalanceColumn(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                  placeholder="Balance (Optional)"
                />
              </div>
            </div>

            {amountMode === 'SEPARATE_COLUMNS' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                    Credit Column (Deposit) *
                  </label>
                  <input
                    type="text"
                    value={creditColumn}
                    onChange={(e) => setCreditColumn(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                    placeholder="Credit Amount"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                    Debit Column (Withdrawal) *
                  </label>
                  <input
                    type="text"
                    value={debitColumn}
                    onChange={(e) => setDebitColumn(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                    placeholder="Debit Amount"
                  />
                </div>
              </div>
            ) : amountMode === 'SINGLE_AMOUNT_WITH_TYPE' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                    Amount Column *
                  </label>
                  <input
                    type="text"
                    value={amountColumn}
                    onChange={(e) => setAmountColumn(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                    Type Column *
                  </label>
                  <input
                    type="text"
                    value={typeColumn}
                    onChange={(e) => setTypeColumn(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                    Credit Value String *
                  </label>
                  <input
                    type="text"
                    value={creditTypeValue}
                    onChange={(e) => setCreditTypeValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                    placeholder="CR"
                  />
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <label className="block text-[11px] font-semibold text-[#542047] mb-0.5">
                  Signed Amount Column *
                </label>
                <input
                  type="text"
                  value={amountColumn}
                  onChange={(e) => setAmountColumn(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#eee2dc] rounded-lg focus:border-[#d49a24] focus:outline-hidden font-mono"
                  placeholder="Amount"
                />
              </div>
            )}
          </div>

          {/* Preview Button */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || !fileContent}
              className="px-3.5 py-1.5 bg-[#f4ead5] text-[#542047] hover:bg-[#ffe8a8] border border-[#d49a24]/30 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {previewing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#542047]/30 border-t-[#542047] rounded-full animate-spin" />
                  <span>Validating CSV...</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#d49a24]" />
                  <span>Preview & Validate Rows</span>
                </>
              )}
            </button>

            {previewResult && (
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {previewResult.rows.length} valid rows parsed
                {previewResult.errors.length > 0 && ` (${previewResult.errors.length} errors)`}
              </span>
            )}
          </div>

          {/* Preview Table & Validation Errors */}
          {previewResult && (
            <div className="space-y-3 pt-1">
              {previewResult.errors.length > 0 && (
                <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Validation Errors ({previewResult.errors.length}):
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] max-h-24 overflow-y-auto font-mono">
                    {previewResult.errors.map((err, i) => (
                      <li key={i}>
                        Line {err.lineNumber}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.rows.length > 0 && (
                <div className="border border-[#eee2dc] rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="px-3 py-2 bg-[#fffaf5] border-b border-[#eee2dc] text-[11px] font-bold text-[#542047]">
                    First 5 Parsed Rows (Sample Preview):
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-[#f9f5f1] border-b border-[#eee2dc] text-[#68647a]">
                        <tr>
                          <th className="py-1.5 px-3">#</th>
                          <th className="py-1.5 px-3">Date</th>
                          <th className="py-1.5 px-3">Description</th>
                          <th className="py-1.5 px-3">Reference</th>
                          <th className="py-1.5 px-3">Type</th>
                          <th className="py-1.5 px-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eee2dc]">
                        {previewResult.rows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="hover:bg-black/2 font-mono">
                            <td className="py-1.5 px-3 text-[#68647a]">{r.lineNumber}</td>
                            <td className="py-1.5 px-3">
                              {new Date(r.transactionDate).toLocaleDateString()}
                            </td>
                            <td className="py-1.5 px-3 font-sans truncate max-w-[150px]">
                              {r.description}
                            </td>
                            <td className="py-1.5 px-3 text-[#68647a]">
                              {r.referenceNumber || '—'}
                            </td>
                            <td className="py-1.5 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  r.lineType === 'CREDIT'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {r.lineType}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-[#25203a]">
                              ₹{r.amount.toString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#eee2dc] bg-[#fffaf5]">
          <span className="text-[11px] text-[#68647a]">
            {previewResult?.rows.length ? `${previewResult.rows.length} lines ready for atomic ingestion` : 'Run preview before finalizing'}
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={
                importing ||
                !previewResult ||
                previewResult.errors.length > 0 ||
                duplicateWarning?.isDuplicate ||
                previewResult.rows.length === 0
              }
              className="px-4 py-2 bg-[#542047] text-white rounded-xl text-xs font-semibold hover:bg-[#421b48] transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {importing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Importing Statement...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Commit Import</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
