import Link from 'next/link';
import { LayoutDashboard, Gem, Users, LogIn, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-2xl bg-white border border-[#eee2dc] rounded-2xl p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#fff0dc] border border-[#f1d394] text-[#73501b] rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
          Milestone 2A — Jeweller Workspace Live
        </div>
        <h1 className="text-3xl font-serif font-bold text-[#542047] mb-2">
          SUVARNA Jewellery Business OS
        </h1>
        <p className="text-xs uppercase tracking-widest text-[#d49a24] font-bold mb-4">
          Interactive Product UI & Navigation
        </p>
        <p className="text-sm text-[#68647a] mb-6 leading-relaxed">
          The Jeweller Workspace is now interactive. Explore showroom operations, jewellery inventory with vector artwork, customer profiles, and sign-in preview in your browser.
        </p>

        {/* Primary Entry Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <Link
            href="/dashboard"
            className="p-3.5 bg-[#542047] text-[#ffe8a8] hover:bg-[#421b48] rounded-xl text-xs font-bold flex items-center justify-between transition shadow-xs group"
          >
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-[#ffe8a8]" />
              <span>Enter Workspace Dashboard</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/inventory"
            className="p-3.5 bg-[#fffaf5] border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-bold flex items-center justify-between transition shadow-xs group"
          >
            <div className="flex items-center gap-2">
              <Gem className="w-4 h-4 text-[#d49a24]" />
              <span>Jewellery Inventory</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/customers"
            className="p-3.5 bg-[#fffaf5] border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-bold flex items-center justify-between transition shadow-xs group"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#d49a24]" />
              <span>Customers & CRM</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/login"
            className="p-3.5 bg-[#fffaf5] border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-bold flex items-center justify-between transition shadow-xs group"
          >
            <div className="flex items-center gap-2">
              <LogIn className="w-4 h-4 text-[#d49a24]" />
              <span>Showroom Sign-In Preview</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Foundation Capability Summary Grid */}
        <div className="grid grid-cols-2 gap-3 text-left text-xs mb-6 pt-4 border-t border-[#eee2dc]">
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
            <span className="text-[#68647a]">Fort & Navi Mumbai Showrooms</span>
          </div>
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="font-semibold text-[#542047] block">Precision Math</span>
            <span className="text-[#68647a]">3-decimal weights & 3% GST logic</span>
          </div>
        </div>

        <div className="p-3 bg-[#fff0dc] border border-[#f1d394] rounded-xl text-xs text-[#73501b]">
          <strong>Notice:</strong> All data displayed in the workspace is fictional demo data for workflow evaluation. Local modifications run in browser state and are not saved permanently.
        </div>
      </div>
    </main>
  );
}
