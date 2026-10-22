'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  Search,
  Users,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building,
  Edit3,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { listCustomersAction, SerializedCustomer } from '@/app/actions/customer';
import { AddCustomerModal } from './add-customer-modal';
import { EditCustomerModal } from './edit-customer-modal';
import { CustomerDetailDrawer } from './customer-detail-drawer';

interface BranchOption {
  id: string;
  name: string;
  code: string;
  city?: string;
}

interface CustomerDirectoryProps {
  initialCustomers: SerializedCustomer[];
  initialTotalCount: number;
  initialPage: number;
  initialLimit: number;
  branches: BranchOption[];
  activeBranchId?: string;
  userRole: string;
}

const SEGMENT_OPTIONS = [
  { id: 'All', label: 'All Segments' },
  { id: 'RETAIL', label: 'Standard Retail' },
  { id: 'VIP', label: 'VIP Patron' },
  { id: 'BRIDAL', label: 'Bridal Consultation' },
  { id: 'GOLD_SIP', label: 'Gold SIP Member' },
  { id: 'REPEAT', label: 'Repeat Patron' },
];

export function CustomerDirectory({
  initialCustomers,
  initialTotalCount,
  initialPage,
  initialLimit,
  branches,
  activeBranchId,
  userRole,
}: CustomerDirectoryProps) {
  const [customers, setCustomers] = useState<SerializedCustomer[]>(initialCustomers);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSegment, setSelectedSegment] = useState<string>('All');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  // Modals & Drawers state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<SerializedCustomer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Fetch / Refresh data
  const fetchData = (query: string, segment: string, branchId: string, page: number) => {
    startTransition(async () => {
      try {
        const res = await listCustomersAction(
          {
            searchQuery: query || undefined,
            segment: segment !== 'All' ? segment : undefined,
            branchId: branchId || undefined,
          },
          page,
          initialLimit
        );
        if (res.success && res.data) {
          setCustomers(res.data.customers);
          setTotalCount(res.data.totalCount);
          setCurrentPage(res.data.page);
        }
      } catch (err) {
        console.error('Failed to load customers:', err);
      }
    });
  };

  // Debounced search on query or filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData(searchQuery, selectedSegment, selectedBranchId, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedSegment, selectedBranchId]);

  const handlePageChange = (newPage: number) => {
    fetchData(searchQuery, selectedSegment, selectedBranchId, newPage);
  };

  const handleCustomerCreated = (newCustomer: SerializedCustomer) => {
    setNotice(`Customer profile registered for "${newCustomer.name}" (${newCustomer.customerCode || 'PATRON'}).`);
    fetchData(searchQuery, selectedSegment, selectedBranchId, 1);
    setTimeout(() => setNotice(null), 6000);
  };

  const handleCustomerUpdated = (updated: SerializedCustomer) => {
    setNotice(`Updated customer details for "${updated.name}".`);
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setTimeout(() => setNotice(null), 6000);
  };

  const totalPages = Math.ceil(totalCount / initialLimit) || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              Patron Relationships & CRM
            </span>
            <span className="px-2 py-0.5 bg-[#e2f6e8] border border-[#a3e2bb] text-[#246743] rounded text-[10px] font-bold">
              LIVE DATABASE
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            Customer Directory
          </h1>
          <p className="text-xs text-[#68647a]">
            Manage retail patrons, Gold SIP members, bridal consultations, and interaction records across your showrooms.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-[#542047] text-[#ffe8a8] hover:bg-[#421b48] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="p-3 bg-[#e2f6e8] border border-[#a3e2bb] rounded-xl text-xs text-[#246743] flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#246743]" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-[#68647a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by customer name, phone number, customer ID, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            />
          </div>

          {/* Segment Selector */}
          <div className="sm:col-span-3">
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              {SEGMENT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Branch Selector */}
          <div className="sm:col-span-3">
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              <option value="">All Showrooms</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Toolbar Metadata */}
        <div className="flex items-center justify-between text-xs text-[#68647a] pt-1">
          <span>
            {isPending ? (
              <span className="text-[#d49a24] font-medium">Filtering patrons...</span>
            ) : (
              <>Showing {customers.length} of {totalCount} registered patrons</>
            )}
          </span>
          {(searchQuery || selectedSegment !== 'All' || selectedBranchId) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSegment('All');
                setSelectedBranchId('');
              }}
              className="text-[#d49a24] hover:underline font-semibold"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eee2dc] text-[#68647a] bg-[#fffaf5]">
                <th className="py-3 px-4 font-semibold">Customer & Code</th>
                <th className="py-3 px-4 font-semibold">Contact Info</th>
                <th className="py-3 px-4 font-semibold">Segment</th>
                <th className="py-3 px-4 font-semibold">Home Showroom</th>
                <th className="py-3 px-4 font-semibold">City / State</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-[#fffdfb] transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#fff0dc] text-[#542047] border border-[#f1d394] flex items-center justify-center font-bold text-xs shrink-0">
                        {c.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-bold text-[#542047] block text-xs">{c.name}</span>
                        <span className="text-[10px] font-mono text-[#d49a24]">
                          {c.customerCode || 'PATRON'}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-[#25203a] block">{c.phone}</span>
                      {c.email && <span className="text-[10px] text-[#68647a] block">{c.email}</span>}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span className="inline-block px-2.5 py-0.5 bg-[#f4ead5] text-[#73501b] rounded-full text-[10px] font-bold">
                      {c.segment}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-[#68647a]">
                    {c.primaryBranch ? (
                      <span className="font-medium text-[#542047]">{c.primaryBranch.name}</span>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-[#68647a]">
                    {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.isActive
                          ? 'bg-[#e2f6e8] text-[#246743]'
                          : 'bg-[#fbe8e8] text-[#b93657]'
                      }`}
                    >
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedCustomerId(c.id)}
                        className="px-2.5 py-1 bg-[#fffaf5] hover:bg-[#fff0dc] border border-[#eee2dc] text-[#542047] rounded-lg text-xs font-semibold transition"
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => setEditingCustomer(c)}
                        className="p-1 hover:bg-[#fff0dc] text-[#68647a] hover:text-[#542047] rounded-lg transition"
                        title="Edit Patron"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {customers.length === 0 && !isPending && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#68647a]">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Users className="w-8 h-8 text-[#d49a24] mx-auto opacity-70" />
                      <span className="font-bold text-[#542047] block text-xs">
                        No customer profiles found
                      </span>
                      <p className="text-[11px] text-[#68647a]">
                        {searchQuery || selectedSegment !== 'All' || selectedBranchId
                          ? 'No patrons match the selected filter criteria. Try adjusting or resetting your search.'
                          : 'No patrons have been registered in this showroom business yet. Add your first customer profile to begin.'}
                      </p>
                      {!(searchQuery || selectedSegment !== 'All' || selectedBranchId) && (
                        <button
                          onClick={() => setIsAddModalOpen(true)}
                          className="mt-2 px-4 py-2 bg-[#542047] text-[#ffe8a8] rounded-xl text-xs font-semibold hover:bg-[#421b48] transition inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Register First Customer</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-[#eee2dc] bg-[#fffaf5] flex items-center justify-between text-xs text-[#68647a]">
            <span>
              Page {currentPage} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="px-2.5 py-1 bg-white border border-[#eee2dc] rounded-lg hover:bg-[#fff0dc] disabled:opacity-40 transition flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="px-2.5 py-1 bg-white border border-[#eee2dc] rounded-lg hover:bg-[#fff0dc] disabled:opacity-40 transition flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <AddCustomerModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={handleCustomerCreated}
          branches={branches}
          activeBranchId={activeBranchId}
        />
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <EditCustomerModal
          customer={editingCustomer}
          isOpen={Boolean(editingCustomer)}
          onClose={() => setEditingCustomer(null)}
          onSuccess={handleCustomerUpdated}
          branches={branches}
        />
      )}

      {/* Customer Detail Drawer */}
      {selectedCustomerId && (
        <CustomerDetailDrawer
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onCustomerUpdated={handleCustomerUpdated}
          branches={branches}
        />
      )}
    </div>
  );
}
