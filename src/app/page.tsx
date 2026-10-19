export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-2xl bg-white border border-[#eee2dc] rounded-2xl p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#fff0dc] border border-[#f1d394] text-[#73501b] rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
          Milestone 1 — Core Foundation Active
        </div>
        <h1 className="text-3xl font-serif font-bold text-[#542047] mb-3">
          SUVARNA Jewellery Business OS
        </h1>
        <p className="text-sm text-[#68647a] mb-6 leading-relaxed">
          Multi-tenant platform foundation established. Database tenancy models, server-side security context,
          role-based access control (RBAC), and decimal precision arithmetic are initialized.
        </p>

        <div className="grid grid-cols-2 gap-3 text-left text-xs mb-6">
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="font-semibold text-[#542047] block">Multi-Tenant Engine</span>
            <span className="text-[#68647a]">Verified server-side security context</span>
          </div>
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="font-semibold text-[#542047] block">Staff RBAC</span>
            <span className="text-[#68647a]">Owner, Manager, Accountant, Sales</span>
          </div>
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="font-semibold text-[#542047] block">Branch-Aware Scoping</span>
            <span className="text-[#68647a]">Showroom-level data isolation</span>
          </div>
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="font-semibold text-[#542047] block">Precision Math</span>
            <span className="text-[#68647a]">Decimal-safe weights & GST breakdown</span>
          </div>
        </div>

        <div className="p-3 bg-[#fff0e8] border border-[#f0e2df] rounded-xl text-xs text-[#74415e]">
          <strong>Notice:</strong> Retail workflows (Inventory, POS Billing, CRM, AI Co-Pilot) are intentionally scheduled for subsequent milestones.
        </div>
      </div>
    </main>
  );
}
