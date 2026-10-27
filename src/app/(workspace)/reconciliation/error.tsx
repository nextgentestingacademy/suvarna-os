'use client';

import React from 'react';
import Link from 'next/link';
import { Database, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function ReconciliationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isConnectionError =
    error.message?.includes("Can't reach database server") ||
    error.message?.includes('P1001') ||
    error.message?.includes('connection') ||
    error.message?.includes('timeout');

  return (
    <div className="max-w-xl mx-auto my-12 p-6 bg-white border border-[#eee2dc] rounded-2xl shadow-xl space-y-5 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#fff0dc] text-[#d49a24] flex items-center justify-center mx-auto shadow-inner">
        {isConnectionError ? (
          <Database className="w-7 h-7" />
        ) : (
          <ShieldAlert className="w-7 h-7 text-[#b93657]" />
        )}
      </div>

      <div className="space-y-1.5">
        <h2 className="font-serif font-bold text-xl text-[#542047]">
          {isConnectionError
            ? 'Database Service Reconnecting'
            : 'Unable to Load Reconciliation Workspace'}
        </h2>
        <p className="text-xs text-[#68647a] leading-relaxed max-w-md mx-auto">
          {isConnectionError
            ? 'The secure database service is resuming from standby or experiencing a brief connection interval. All bank feeds and ledger records remain fully protected.'
            : error.message ||
              'An unexpected issue occurred while rendering the reconciliation workspace. Please retry or return to Dashboard.'}
        </p>
      </div>

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="w-full sm:w-auto px-5 py-2.5 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-4 h-4 text-[#ffe8a8]" />
          <span>Retry Workspace</span>
        </button>

        <Link
          href="/dashboard"
          className="w-full sm:w-auto px-5 py-2.5 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
