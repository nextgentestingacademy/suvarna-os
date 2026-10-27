'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Check,
  X,
  Store,
  Phone,
  ShieldAlert,
  Edit2,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { SerializedCustomer, listCustomersAction, createCustomerAction } from '@/app/actions/customer';

export interface WalkInCustomerDetails {
  name: string;
  phone: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

interface PosCustomerSelectorProps {
  customerMode: 'REGISTERED' | 'WALK_IN';
  onCustomerModeChange: (mode: 'REGISTERED' | 'WALK_IN') => void;
  selectedCustomer: SerializedCustomer | null;
  onSelectCustomer: (customer: SerializedCustomer | null) => void;
  walkInDetails: WalkInCustomerDetails;
  onWalkInDetailsChange: (details: WalkInCustomerDetails) => void;
  initialCustomers: SerializedCustomer[];
  showroomState: string;
}

export function PosCustomerSelector({
  customerMode,
  onCustomerModeChange,
  selectedCustomer,
  onSelectCustomer,
  walkInDetails,
  onWalkInDetailsChange,
  initialCustomers,
  showroomState,
}: PosCustomerSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SerializedCustomer[]>(initialCustomers);
  const [isSearching, setIsSearching] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Quick Add Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSegment, setNewSegment] = useState<'REGULAR' | 'LOYAL' | 'VIP' | 'HNI'>('REGULAR');
  const [newPan, setNewPan] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Live search debounced
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(initialCustomers);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await listCustomersAction({ searchQuery: searchQuery.trim() });
        if (res.success && res.data) {
          setSearchResults(res.data.customers);
        }
      } catch {
        // graceful fallback
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, initialCustomers]);

  // Handle Quick Add Customer Submission
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickAddError(null);

    if (!newName.trim()) {
      setQuickAddError('Customer full name is required.');
      return;
    }
    if (!newPhone.trim() || !/^[6-9]\d{9}$/.test(newPhone.trim())) {
      setQuickAddError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (newPan.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(newPan.trim().toUpperCase())) {
      setQuickAddError('PAN must be in valid format (e.g. ABCDE1234F).');
      return;
    }

    setIsSubmittingNew(true);
    try {
      const res = await createCustomerAction({
        name: newName.trim(),
        phone: newPhone.trim(),
        segment: newSegment,
        pan: newPan.trim().toUpperCase() || undefined,
        city: newCity.trim() || undefined,
        state: showroomState,
        addressLine1: newAddress.trim() || undefined,
      });

      if (res.success && res.data) {
        onSelectCustomer(res.data);
        setIsQuickAddOpen(false);
        // Reset modal fields
        setNewName('');
        setNewPhone('');
        setNewPan('');
        setNewCity('');
        setNewAddress('');
      } else {
        setQuickAddError(res.error || 'Failed to create customer profile.');
      }
    } catch (err: any) {
      setQuickAddError(err?.message || 'Error creating customer.');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-[#eee2dc] shadow-xs space-y-3">
      {/* Mode Selector Header */}
      <div className="flex items-center justify-between border-b border-[#eee2dc] pb-2.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#d49a24]" />
          <span className="font-serif font-bold text-xs text-[#542047] uppercase tracking-wider">
            Customer Identification
          </span>
        </div>

        <div className="flex items-center bg-[#fffaf5] p-0.5 rounded-xl border border-[#eee2dc] text-xs">
          <button
            type="button"
            onClick={() => onCustomerModeChange('REGISTERED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              customerMode === 'REGISTERED'
                ? 'bg-[#542047] text-white shadow-xs'
                : 'text-[#68647a] hover:text-[#542047]'
            }`}
          >
            Registered Patron
          </button>
          <button
            type="button"
            onClick={() => onCustomerModeChange('WALK_IN')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              customerMode === 'WALK_IN'
                ? 'bg-[#542047] text-white shadow-xs'
                : 'text-[#68647a] hover:text-[#542047]'
            }`}
          >
            Walk-in Guest
          </button>
        </div>
      </div>

      {/* Mode 1: Registered Customer */}
      {customerMode === 'REGISTERED' ? (
        <div>
          {selectedCustomer ? (
            /* Selected Customer Display Card */
            <div className="p-3 bg-[#fffaf5] border border-[#d49a24]/30 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[#542047] text-[#ffe8a8] font-bold text-xs flex items-center justify-center shrink-0">
                  {selectedCustomer.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[#542047]">{selectedCustomer.name}</span>
                    <span className="px-1.5 py-0.2 bg-[#e2f6e8] text-[#246743] rounded text-[9px] font-bold">
                      {selectedCustomer.segment}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[#68647a] mt-0.5 font-mono">
                    <span>{selectedCustomer.phone}</span>
                    {selectedCustomer.pan && (
                      <span className="text-[#542047] font-semibold">PAN: {selectedCustomer.pan}</span>
                    )}
                    <span>• {selectedCustomer.city || selectedCustomer.state || showroomState}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectCustomer(null)}
                className="px-2.5 py-1 bg-white border border-[#eee2dc] hover:border-[#b93657] text-[#b93657] rounded-lg text-[11px] font-semibold transition shrink-0 cursor-pointer"
              >
                Change
              </button>
            </div>
          ) : (
            /* Search & Select Registered Customer */
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#68647a]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search customer by name, mobile, or code..."
                    className="w-full pl-8 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl text-xs outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(true)}
                  className="px-3 py-2 bg-[#fff0dc] hover:bg-[#ffe8a8] text-[#542047] border border-[#d49a24]/30 rounded-xl text-xs font-bold flex items-center gap-1 transition shrink-0 cursor-pointer"
                  title="Quick register new customer in CRM"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#d49a24]" />
                  <span className="hidden sm:inline">New Profile</span>
                </button>
              </div>

              {/* Matching Customers Dropdown / List */}
              <div className="max-h-48 overflow-y-auto divide-y divide-[#eee2dc] border border-[#eee2dc] rounded-xl bg-white">
                {isSearching ? (
                  <div className="p-3 text-center text-xs text-[#68647a]">Searching customer records...</div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-center text-xs text-[#68647a]">
                    No customer found. Try searching or click "New Profile" to register.
                  </div>
                ) : (
                  searchResults.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelectCustomer(c);
                        setSearchQuery('');
                      }}
                      className="w-full p-2.5 text-left hover:bg-[#fffaf5] transition flex items-center justify-between group cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[#25203a] group-hover:text-[#542047]">
                            {c.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 bg-[#eee2dc] text-[#68647a] rounded font-semibold">
                            {c.segment}
                          </span>
                          {c.customerCode && (
                            <span className="text-[9px] text-[#68647a] font-mono">{c.customerCode}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#68647a] font-mono mt-0.5 flex items-center gap-2">
                          <span>{c.phone}</span>
                          {c.pan && <span className="text-[#542047] font-semibold">PAN: {c.pan}</span>}
                          <span>{c.city || 'Mumbai'}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-[#d49a24] transition" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Mode 2: Walk-In Guest Inputs */
        <div className="space-y-2 pt-1 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-[#68647a] uppercase block mb-1">
                Guest Customer Name *
              </label>
              <input
                type="text"
                value={walkInDetails.name}
                onChange={(e) => onWalkInDetailsChange({ ...walkInDetails, name: e.target.value })}
                placeholder="e.g. Sunita Devi"
                className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#68647a] uppercase block mb-1">
                Mobile Number (Optional)
              </label>
              <input
                type="text"
                maxLength={10}
                value={walkInDetails.phone}
                onChange={(e) =>
                  onWalkInDetailsChange({
                    ...walkInDetails,
                    phone: e.target.value.replace(/\D/g, ''),
                  })
                }
                placeholder="10-digit mobile"
                className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl text-xs font-mono outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-[#68647a] uppercase block mb-1">
                Customer PAN (Mandatory if ≥ ₹2,00,000)
              </label>
              <input
                type="text"
                maxLength={10}
                value={walkInDetails.pan}
                onChange={(e) =>
                  onWalkInDetailsChange({ ...walkInDetails, pan: e.target.value.toUpperCase() })
                }
                placeholder="ABCDE1234F"
                className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl text-xs font-mono uppercase outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#68647a] uppercase block mb-1">
                State (Place of Supply)
              </label>
              <input
                type="text"
                value={walkInDetails.state || showroomState}
                onChange={(e) => onWalkInDetailsChange({ ...walkInDetails, state: e.target.value })}
                placeholder="Maharashtra"
                className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl text-xs outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#eee2dc] w-full max-w-md shadow-2xl p-5 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
              <div>
                <h3 className="font-serif font-bold text-base text-[#542047]">
                  Register New Customer Profile
                </h3>
                <p className="text-[11px] text-[#68647a]">
                  Instant showroom CRM registration linked to current sale.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="p-1.5 text-[#68647a] hover:bg-[#fff0dc] rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickAddError && (
              <div className="p-2.5 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{quickAddError}</span>
              </div>
            )}

            <form onSubmit={handleQuickAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#68647a] block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Ramesh K. Joshi"
                  className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#68647a] block mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9820012345"
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#68647a] block mb-1">Segment</label>
                  <select
                    value={newSegment}
                    onChange={(e: any) => setNewSegment(e.target.value)}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl outline-none"
                  >
                    <option value="REGULAR">REGULAR</option>
                    <option value="LOYAL">LOYAL</option>
                    <option value="VIP">VIP</option>
                    <option value="HNI">HNI</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#68647a] block mb-1">Income Tax PAN</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={newPan}
                    onChange={(e) => setNewPan(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl font-mono uppercase outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#68647a] block mb-1">City</label>
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="e.g. Mumbai"
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#68647a] block mb-1">Showroom Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Street / Area address"
                  className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-xl outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#eee2dc]">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-3 py-1.5 bg-white border border-[#eee2dc] text-[#68647a] hover:bg-[#fff0dc] rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="px-4 py-1.5 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingNew ? 'Saving...' : 'Register & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
