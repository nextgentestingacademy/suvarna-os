'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Receipt,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Package,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { canManageInventory } from '@/lib/navigation';
import { INDICATIVE_DAILY_RATES } from '@/lib/indicative-pricing';
import { getDashboardSummaryAction } from '@/app/actions/reports';
import { DashboardData } from '@/lib/reports';

export default function DashboardPage() {
  const { activeBranch, user } = useWorkspace();
  const showAddJewellery = canManageInventory(user?.role);

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboardData = useCallback(async (branchId?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getDashboardSummaryAction(branchId);
      if (res.success && res.data) {
        setDashboardData(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to load live dashboard metrics.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load live dashboard metrics.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData(activeBranch?.id);
  }, [activeBranch?.id, loadDashboardData]);

  const kpis = dashboardData?.kpis;
  const recentTransactions = dashboardData?.recentTransactions ?? [];
  const lowStockItems = dashboardData?.lowStockItems ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              Showroom Intelligence
            </span>
            <span className="px-2 py-0.5 bg-[#e2f6e8] border border-[#a3e3b5] text-[#246743] rounded text-[10px] font-bold">
              LIVE DATA
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            {activeBranch.name} Overview
          </h1>
          <p className="text-xs text-[#68647a]">
            Retail operations snapshot for the active showroom branch.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadDashboardData(activeBranch?.id)}
            disabled={isLoading}
            className="p-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
            title="Refresh dashboard metrics"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#d49a24] ${isLoading ? 'animate-spin' : ''}`} />
          </button>
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

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 bg-[#fff1f2] border border-[#fecdd3] rounded-2xl flex items-center justify-between text-xs text-[#9f1239]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#e11d48]" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => loadDashboardData(activeBranch?.id)}
            className="px-2.5 py-1 bg-white border border-[#fecdd3] rounded-lg font-semibold hover:bg-[#ffe4e6] transition"
          >
            Retry
          </button>
        </div>
      )}

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
              ₹{INDICATIVE_DAILY_RATES['24K'].toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-[#68647a]">/ gram</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#246743] font-semibold">
            <TrendingUp className="w-3 h-3" />
            <span>Daily benchmark rate</span>
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
              ₹{INDICATIVE_DAILY_RATES['22K'].toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-[#68647a]">/ gram</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#246743] font-semibold">
            <TrendingUp className="w-3 h-3" />
            <span>Standard jewellery hallmark rate</span>
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
              ₹{INDICATIVE_DAILY_RATES['SILVER'].toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-[#68647a]">/ gram</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#246743] font-semibold">
            <TrendingUp className="w-3 h-3" />
            <span>Daily bullion benchmark</span>
          </div>
        </div>
      </div>

      {/* Key Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Sales (MTD) */}
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Gross Sales (MTD)</span>
            <Receipt className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {isLoading && !kpis ? (
              <span className="inline-block w-24 h-7 bg-[#f3eee9] animate-pulse rounded" />
            ) : (
              `₹${parseFloat(kpis?.grossSalesMtd || '0').toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            )}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {isLoading && !kpis
              ? 'Loading metrics...'
              : `${kpis?.invoicesCountMtd || 0} completed invoices raised this month`}
          </div>
        </div>

        {/* Outstanding Dues */}
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Outstanding Dues</span>
            <AlertTriangle className="w-4 h-4 text-[#b93657]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#b93657] my-1">
            {isLoading && !kpis ? (
              <span className="inline-block w-24 h-7 bg-[#f3eee9] animate-pulse rounded" />
            ) : (
              `₹${parseFloat(kpis?.outstandingDues || '0').toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            )}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {isLoading && !kpis
              ? 'Loading dues...'
              : `${kpis?.pendingInvoicesCount || 0} invoices partially paid / pending`}
          </div>
        </div>

        {/* Registered Customers */}
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Registered Customers</span>
            <Users className="w-4 h-4 text-[#542047]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {isLoading && !kpis ? (
              <span className="inline-block w-16 h-7 bg-[#f3eee9] animate-pulse rounded" />
            ) : (
              (kpis?.registeredCustomersCount || 0).toLocaleString('en-IN')
            )}
          </div>
          <div className="text-[11px] text-[#246743] font-medium">
            Active customer profiles
          </div>
        </div>

        {/* Active Catalogue */}
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Active Catalogue</span>
            <Package className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {isLoading && !kpis ? (
              <span className="inline-block w-20 h-7 bg-[#f3eee9] animate-pulse rounded" />
            ) : (
              `${kpis?.activeDesignsCount || 0} designs`
            )}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {isLoading && !kpis
              ? 'Loading catalogue...'
              : `${kpis?.activeOrnamentsCount || 0} stocked · ${parseFloat(kpis?.activeNetWeightGrams || '0').toFixed(3)}g net weight`}
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
            {isLoading && recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#68647a]">
                <RefreshCw className="w-4 h-4 text-[#d49a24] animate-spin mx-auto mb-2" />
                Loading recent invoices...
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#68647a]">
                No completed invoices recorded for this showroom yet.
              </div>
            ) : (
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
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[#fffdfb] transition">
                      <td className="py-3 px-3 font-mono font-bold text-[#542047]">{tx.invoiceNumber}</td>
                      <td className="py-3 px-3 font-medium text-[#25203a]">{tx.customerName}</td>
                      <td className="py-3 px-3 text-[#68647a]">{tx.date}</td>
                      <td className="py-3 px-3 font-bold text-[#25203a]">
                        ₹{parseFloat(tx.totalAmount).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.paymentStatus === 'PAID'
                              ? 'bg-[#e2f6e8] text-[#246743]'
                              : tx.paymentStatus === 'PARTIAL'
                              ? 'bg-[#fff0dc] text-[#82510b]'
                              : 'bg-[#fbe8e8] text-[#b93657]'
                          }`}
                        >
                          {tx.paymentStatus} · {tx.paymentMethods.join(', ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

            {isLoading && lowStockItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#68647a]">
                <RefreshCw className="w-4 h-4 text-[#d49a24] animate-spin mx-auto mb-2" />
                Checking showroom stock levels...
              </div>
            ) : lowStockItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#68647a]">
                All catalogue designs are currently well stocked.
              </div>
            ) : (
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
            )}
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
