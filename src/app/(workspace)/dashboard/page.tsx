'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Receipt,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Coins,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { canManageInventory } from '@/lib/navigation';
import {
  DEMO_RATES,
  INITIAL_DEMO_PRODUCTS,
  INITIAL_DEMO_CUSTOMERS,
  INITIAL_DEMO_TRANSACTIONS,
} from '@/data/mock-workspace';

export default function DashboardPage() {
  const { activeBranch, user } = useWorkspace();
  const showAddJewellery = canManageInventory(user?.role);

  // Filter transactions and inventory relevant to active branch
  const branchTransactions = INITIAL_DEMO_TRANSACTIONS.filter(
    (t) => t.branchId === activeBranch.id
  );
  const displayTransactions =
    branchTransactions.length > 0 ? branchTransactions : INITIAL_DEMO_TRANSACTIONS;

  const lowStockItems = INITIAL_DEMO_PRODUCTS.filter((p) => p.stock <= 4);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              Showroom Intelligence
            </span>
            <span className="px-2 py-0.5 bg-[#fff0dc] border border-[#f1d394] text-[#73501b] rounded text-[10px] font-bold">
              DEMO DATA
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            {activeBranch.name} Overview
          </h1>
          <p className="text-xs text-[#68647a]">
            Retail operations snapshot for today. All values below represent illustrative demo records.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {showAddJewellery && (
            <Link
              href="/inventory"
              className="px-3.5 py-2 bg-[#542047] text-[#ffe8a8] hover:bg-[#421b48] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Jewellery</span>
            </Link>
          )}
          <Link
            href="/customers"
            className="px-3.5 py-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
          >
            <Users className="w-3.5 h-3.5 text-[#d49a24]" />
            <span>New Customer</span>
          </Link>
        </div>
      </div>

      {/* Indicative Rate Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-white to-[#fffaf0] border border-[#f1d6b0] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a] mb-1">
            <span className="font-semibold text-[#7b285e]">24K GOLD · 999</span>
            <span className="px-2 py-0.5 bg-[#fff0dc] text-[#82510b] rounded text-[10px] font-bold">
              INDICATIVE RATE
            </span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="text-2xl font-serif font-bold text-[#7b285e]">
              ₹{DEMO_RATES.gold24k.toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-[#68647a]">/ gram</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#246743] font-semibold">
            <TrendingUp className="w-3 h-3" />
            <span>▲ 0.42% illustrative movement today</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-[#fffaf0] border border-[#f1d6b0] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a] mb-1">
            <span className="font-semibold text-[#7b285e]">22K GOLD · 916</span>
            <span className="px-2 py-0.5 bg-[#fff0dc] text-[#82510b] rounded text-[10px] font-bold">
              HALLMARK BENCHMARK
            </span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="text-2xl font-serif font-bold text-[#7b285e]">
              ₹{DEMO_RATES.gold22k.toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-[#68647a]">/ gram</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#246743] font-semibold">
            <TrendingUp className="w-3 h-3" />
            <span>▲ 0.28% illustrative movement today</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-[#fffaf0] border border-[#f1d6b0] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a] mb-1">
            <span className="font-semibold text-[#7b285e]">SILVER · 999</span>
            <span className="px-2 py-0.5 bg-[#f1e8f0] text-[#70526d] rounded text-[10px] font-bold">
              FINE METAL
            </span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="text-2xl font-serif font-bold text-[#7b285e]">
              ₹{DEMO_RATES.silver.toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-[#68647a]">/ gram</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#246743] font-semibold">
            <TrendingUp className="w-3 h-3" />
            <span>▲ 0.15% illustrative movement today</span>
          </div>
        </div>
      </div>

      {/* Key Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Gross Sales (MTD)</span>
            <Receipt className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            ₹8,42,000
          </div>
          <div className="text-[11px] text-[#68647a]">
            126 invoices raised in demo period
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Outstanding Dues</span>
            <AlertTriangle className="w-4 h-4 text-[#b93657]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#b93657] my-1">
            ₹1,31,250
          </div>
          <div className="text-[11px] text-[#68647a]">
            2 invoices partially paid / pending
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Registered Customers</span>
            <Users className="w-4 h-4 text-[#542047]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {INITIAL_DEMO_CUSTOMERS.length}
          </div>
          <div className="text-[11px] text-[#246743] font-medium">
            2 require follow-up today
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Active Catalogue</span>
            <Package className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {INITIAL_DEMO_PRODUCTS.length} designs
          </div>
          <div className="text-[11px] text-[#68647a]">
            {INITIAL_DEMO_PRODUCTS.reduce((acc, p) => acc + p.stock, 0)} total ornaments stocked
          </div>
        </div>
      </div>

      {/* Grid: Recent Invoices & Low Stock Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions Table */}
        <div className="lg:col-span-2 bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif font-bold text-lg text-[#542047]">Recent Invoices</h2>
              <p className="text-xs text-[#68647a]">Latest point-of-sale transactions</p>
            </div>
            <Link
              href="/billing"
              className="text-xs font-semibold text-[#542047] hover:text-[#d49a24] flex items-center gap-1 transition"
            >
              <span>View Billing Module</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#eee2dc] text-[#68647a] bg-[#fffaf5]">
                  <th className="py-2.5 px-3 font-semibold">Invoice</th>
                  <th className="py-2.5 px-3 font-semibold">Customer</th>
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold">Amount</th>
                  <th className="py-2.5 px-3 font-semibold">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee2dc]">
                {displayTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#fffdfb] transition">
                    <td className="py-3 px-3 font-mono font-bold text-[#542047]">{tx.invoiceNo}</td>
                    <td className="py-3 px-3 font-medium text-[#25203a]">{tx.customerName}</td>
                    <td className="py-3 px-3 text-[#68647a]">{tx.date}</td>
                    <td className="py-3 px-3 font-bold text-[#25203a]">
                      ₹{tx.totalAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          tx.paymentStatus === 'Paid'
                            ? 'bg-[#e2f6e8] text-[#246743]'
                            : tx.paymentStatus === 'Partial'
                            ? 'bg-[#fff0dc] text-[#82510b]'
                            : 'bg-[#fbe8e8] text-[#b93657]'
                        }`}
                      >
                        {tx.paymentStatus} · {tx.paymentMethod}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Watchlist */}
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-serif font-bold text-lg text-[#542047]">Low Stock Watchlist</h2>
                <p className="text-xs text-[#68647a]">Designs with ≤ 4 pieces left</p>
              </div>
              <span className="px-2 py-0.5 bg-[#fbe8e8] text-[#b93657] font-bold text-[10px] rounded">
                {lowStockItems.length} ITEMS
              </span>
            </div>

            <div className="space-y-3">
              {lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-xs text-[#542047] block">{item.name}</span>
                    <span className="text-[11px] text-[#68647a]">
                      {item.sku} · {item.category} · {item.purity}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 bg-[#fff0dc] text-[#73501b] font-bold text-xs rounded block">
                      {item.stock} in stock
                    </span>
                    <span className="text-[10px] text-[#68647a] block mt-0.5">
                      Net: {item.netWeight.toFixed(3)}g
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#eee2dc]">
            <Link
              href="/inventory"
              className="w-full py-2 bg-[#fff0dc] text-[#73501b] hover:bg-[#ffe8a8] rounded-xl text-xs font-bold block text-center transition"
            >
              Open Full Inventory Catalogue →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
