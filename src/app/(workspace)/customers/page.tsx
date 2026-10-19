'use client';

import React, { useState } from 'react';
import {
  Search,
  Users,
  Plus,
  Phone,
  Mail,
  Calendar,
  CreditCard,
  MessageSquare,
  X,
  Check,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import {
  INITIAL_DEMO_CUSTOMERS,
  DemoCustomer,
} from '@/data/mock-workspace';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<DemoCustomer[]>(INITIAL_DEMO_CUSTOMERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<string>('All');
  const [selectedCustomer, setSelectedCustomer] = useState<DemoCustomer | null>(null);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // New Customer Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    segment: 'New enquiry' as DemoCustomer['segment'],
    notes: '',
    preferredContact: 'WhatsApp' as DemoCustomer['preferredContact'],
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const segments = ['All', 'Gold SIP', 'Bridal enquiry', 'Repeat customer', 'New enquiry'];

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSegment = selectedSegment === 'All' || c.segment === selectedSegment;

    return matchesSearch && matchesSegment;
  });

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Customer name is required';
    if (!formData.phone.trim()) errors.phone = 'Mobile contact is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newCust: DemoCustomer = {
      id: `cust-${Date.now()}`,
      name: formData.name,
      phone: formData.phone,
      email: formData.email || `${formData.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      segment: formData.segment,
      totalPurchases: '₹0 (New)',
      lastInteraction: 'Just now · Showroom Walk-in',
      nextFollowUp: 'Today',
      status: 'New',
      notes: formData.notes || 'Newly registered retail customer.',
      preferredContact: formData.preferredContact,
    };

    setCustomers([newCust, ...customers]);
    setIsAddCustomerOpen(false);
    setSessionNotice(`Created customer profile for "${newCust.name}" in this browser session.`);
    setTimeout(() => setSessionNotice(null), 5000);

    setFormData({
      name: '',
      phone: '',
      email: '',
      segment: 'New enquiry',
      notes: '',
      preferredContact: 'WhatsApp',
    });
    setFormErrors({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              CRM & Relationships
            </span>
            <span className="px-2 py-0.5 bg-[#fff0dc] border border-[#f1d394] text-[#73501b] rounded text-[10px] font-bold">
              DEMO DATA
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            Customer Profiles & Enquiries
          </h1>
          <p className="text-xs text-[#68647a]">
            Manage retail patrons, Gold SIP members, bridal consultations, and follow-up schedules.
          </p>
        </div>

        <button
          onClick={() => setIsAddCustomerOpen(true)}
          className="px-4 py-2.5 bg-[#542047] text-[#ffe8a8] hover:bg-[#421b48] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Session Alert */}
      {sessionNotice && (
        <div className="p-3 bg-[#e2f6e8] border border-[#a3e2bb] rounded-xl text-xs text-[#246743] flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#246743]" />
            <span>{sessionNotice} <strong>(Demo-only; not persisted to database)</strong></span>
          </div>
          <button onClick={() => setSessionNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#68647a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search customer by name, mobile, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#68647a] whitespace-nowrap">Segment:</span>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              {segments.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[#68647a] pt-1">
          <span>Showing {filteredCustomers.length} of {customers.length} registered profiles</span>
          {(searchQuery || selectedSegment !== 'All') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSegment('All');
              }}
              className="text-[#d49a24] hover:underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Customers Table View */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eee2dc] text-[#68647a] bg-[#fffaf5]">
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Segment</th>
                <th className="py-3 px-4 font-semibold">Total Purchases</th>
                <th className="py-3 px-4 font-semibold">Last Interaction</th>
                <th className="py-3 px-4 font-semibold">Follow-up Due</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-[#fffdfb] transition">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#fff0dc] text-[#542047] border border-[#f1d394] flex items-center justify-center font-bold text-xs shrink-0">
                        {c.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <span className="font-bold text-[#542047] block text-xs">{c.name}</span>
                        <span className="text-[11px] text-[#68647a]">{c.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-block px-2.5 py-0.5 bg-[#f4ead5] text-[#73501b] rounded-full text-[10px] font-bold">
                      {c.segment}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[#25203a]">
                    {c.totalPurchases}
                  </td>
                  <td className="py-3.5 px-4 text-[#68647a]">
                    {c.lastInteraction}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-[#542047]">
                    {c.nextFollowUp}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.status === 'Active'
                          ? 'bg-[#e2f6e8] text-[#246743]'
                          : c.status === 'Follow-up'
                          ? 'bg-[#fff0dc] text-[#82510b]'
                          : 'bg-[#f1e8f0] text-[#70526d]'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => setSelectedCustomer(c)}
                      className="px-3 py-1 bg-[#fffaf5] hover:bg-[#fff0dc] border border-[#eee2dc] text-[#542047] rounded-lg text-xs font-semibold transition"
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#eee2dc] rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#542047] text-[#ffe8a8] flex items-center justify-center font-bold text-sm">
                  {selectedCustomer.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#542047]">
                    {selectedCustomer.name}
                  </h2>
                  <span className="text-xs text-[#68647a]">{selectedCustomer.segment}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#d49a24]" />
                  <div>
                    <span className="text-[10px] text-[#68647a] block">Phone Contact</span>
                    <span className="font-bold text-[#25203a]">{selectedCustomer.phone}</span>
                  </div>
                </div>
                <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#d49a24]" />
                  <div>
                    <span className="text-[10px] text-[#68647a] block">Email Address</span>
                    <span className="font-bold text-[#25203a] truncate">{selectedCustomer.email}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                  <span className="text-[10px] text-[#68647a] block">Total Purchases</span>
                  <span className="font-bold text-[#7b285e] text-sm">{selectedCustomer.totalPurchases}</span>
                </div>
                <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                  <span className="text-[10px] text-[#68647a] block">Next Action Scheduled</span>
                  <span className="font-bold text-[#25203a]">{selectedCustomer.nextFollowUp}</span>
                </div>
              </div>

              <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                  Patron Notes & Preferences
                </span>
                <p className="text-xs text-[#25203a] leading-relaxed">{selectedCustomer.notes}</p>
                <div className="pt-2 text-[11px] text-[#68647a] flex items-center gap-2">
                  <span>Preferred Channel:</span>
                  <span className="font-bold text-[#542047]">{selectedCustomer.preferredContact}</span>
                </div>
              </div>

              <div className="p-3 bg-[#fff0dc] border border-[#f1d394] rounded-xl text-[11px] text-[#73501b]">
                <strong>AI Sales Co-Pilot Preview:</strong> In Milestone 3, Suvarna AI will automatically analyze this customer purchase pattern and suggest bespoke festive recommendations or SIP maturity offers.
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#eee2dc]">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 bg-[#542047] text-white rounded-xl text-xs font-semibold hover:bg-[#421b48] transition"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#eee2dc] rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc]">
              <div>
                <span className="text-[10px] font-bold text-[#d49a24] uppercase tracking-wider block">
                  New Retail Patron
                </span>
                <h2 className="text-xl font-serif font-bold text-[#542047]">
                  Register Customer Profile
                </h2>
              </div>
              <button
                onClick={() => setIsAddCustomerOpen(false)}
                className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-4 my-4">
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Full Customer Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Meera Joshi"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                />
                {formErrors.name && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.name}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Mobile Contact *
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98XXX XXXXX"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  />
                  {formErrors.phone && (
                    <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.phone}</span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Interest Segment
                  </label>
                  <select
                    value={formData.segment}
                    onChange={(e) => setFormData({ ...formData, segment: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  >
                    <option value="New enquiry">New enquiry</option>
                    <option value="Bridal enquiry">Bridal enquiry</option>
                    <option value="Gold SIP">Gold SIP</option>
                    <option value="Repeat customer">Repeat customer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Customer Notes & Requirements
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Enquired about 22K bangles, daughter wedding in November..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                />
              </div>

              <div className="p-3 bg-[#fff0dc] border border-[#f1d394] rounded-xl text-[11px] text-[#73501b]">
                <strong>Notice:</strong> This profile will be stored in your current browser session. Database persistence will be connected in Milestone 2B.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eee2dc]">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-[#fffaf5] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] rounded-xl text-xs font-semibold transition"
                >
                  Save Customer Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
