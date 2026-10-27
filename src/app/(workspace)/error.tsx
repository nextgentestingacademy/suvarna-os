'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto my-12 p-6 bg-white border border-[#eee2dc] rounded-2xl shadow-xl space-y-5 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#fbe8e8] text-[#b93657] flex items-center justify-center mx-auto shadow-inner">
        <AlertTriangle className="w-7 h-7" />
      </div>

      <div className="space-y-1.5">
        <h2 className="font-serif font-bold text-xl text-[#542047]">
          Service Temporarily Unavailable
        </h2>
        <p className="text-xs text-[#68647a] leading-relaxed max-w-md mx-auto">
          An unexpected error occurred while loading this module. If this was caused by a transient database connection, retrying will restore the session.
        </p>
      </div>

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="w-full sm:w-auto px-5 py-2.5 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-4 h-4 text-[#ffe8a8]" />
          <span>Retry</span>
        </button>

        <Link
          href="/dashboard"
          className="w-full sm:w-auto px-4 py-2.5 bg-white border border-[#eee2dc] hover:bg-[#fff0dc] text-[#542047] rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {error.digest && (
        <p className="text-[10px] text-stone-400 font-mono pt-2">
          Reference Code: {error.digest}
        </p>
      )}
    </div>
  );
}
