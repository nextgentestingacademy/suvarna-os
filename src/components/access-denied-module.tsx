import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert, Lock, AlertCircle } from 'lucide-react';

interface AccessDeniedModuleProps {
  moduleName: string;
  requiredRole: string;
  requiredPermission: string;
  currentRole: string;
  description: string;
}

export const AccessDeniedModule: React.FC<AccessDeniedModuleProps> = ({
  moduleName,
  requiredRole,
  requiredPermission,
  currentRole,
  description,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#b93657] uppercase tracking-widest flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Access Restricted
            </span>
            <span className="px-2 py-0.5 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded text-[10px] font-bold">
              403 FORBIDDEN
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            {moduleName}
          </h1>
          <p className="text-xs text-[#68647a] max-w-2xl leading-relaxed mt-1">
            {description}
          </p>
        </div>

        <Link
          href="/dashboard"
          className="px-3.5 py-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition self-start shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Dashboard</span>
        </Link>
      </div>

      {/* Restriction Explanatory Card */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[#542047] pb-2 border-b border-[#eee2dc]">
          <ShieldAlert className="w-4 h-4 text-[#b93657]" />
          <span>Server-Enforced Role-Based Access Control (RBAC)</span>
        </div>

        <div className="p-4 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#fbe8e8] text-[#b93657] rounded-lg mt-0.5">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-[#25203a] font-semibold">
                Your authenticated account does not have sufficient privileges to access this showroom module.
              </p>
              <p className="text-[#68647a]">
                Direct URL navigation or unprivileged API requests to this resource are blocked by server authorization policies.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-[#eee2dc]/60">
            <div className="p-3 bg-white border border-[#eee2dc] rounded-lg">
              <span className="text-[10px] text-[#68647a] block uppercase font-bold">Your Current Role</span>
              <span className="font-bold text-[#b93657] text-sm">{currentRole}</span>
            </div>
            <div className="p-3 bg-white border border-[#eee2dc] rounded-lg">
              <span className="text-[10px] text-[#68647a] block uppercase font-bold">Authorized Roles</span>
              <span className="font-bold text-[#542047] text-sm">{requiredRole}</span>
            </div>
            <div className="p-3 bg-white border border-[#eee2dc] rounded-lg">
              <span className="text-[10px] text-[#68647a] block uppercase font-bold">Required Permission</span>
              <span className="font-mono font-bold text-[#d49a24] text-xs">{requiredPermission}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] rounded-xl text-xs font-semibold transition"
          >
            Go to Permitted Modules
          </Link>
        </div>
      </div>
    </div>
  );
};
