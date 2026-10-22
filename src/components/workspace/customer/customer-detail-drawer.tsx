'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  Building,
  Edit3,
  MessageSquare,
  Clock,
  User,
  ShoppingBag,
  Coins,
  Receipt,
  Sparkles,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import {
  getCustomerByIdAction,
  SerializedCustomer,
  SerializedCustomerProfile,
  SerializedCustomerInteraction,
} from '@/app/actions/customer';
import { AddInteractionModal } from './add-interaction-modal';
import { EditCustomerModal } from './edit-customer-modal';

interface BranchOption {
  id: string;
  name: string;
  code: string;
  city?: string;
}

interface CustomerDetailDrawerProps {
  customerId: string | null;
  onClose: () => void;
  onCustomerUpdated: (customer: SerializedCustomer) => void;
  branches: BranchOption[];
}

export function CustomerDetailDrawer({
  customerId,
  onClose,
  onCustomerUpdated,
  branches,
}: CustomerDetailDrawerProps) {
  const [profile, setProfile] = useState<SerializedCustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'INTERACTIONS' | 'TRANSACTIONS'>('OVERVIEW');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setProfile(null);
      return;
    }

    let isMounted = true;
    async function loadProfile() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getCustomerByIdAction(customerId!);
        if (isMounted) {
          if (res.success && res.data) {
            setProfile(res.data);
          } else {
            setError(res.error || 'Failed to load customer profile.');
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'An error occurred.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [customerId]);

  if (!customerId) return null;

  const handleProfileUpdated = (updated: SerializedCustomer) => {
    if (profile) {
      setProfile({
        ...profile,
        ...updated,
      });
    }
    onCustomerUpdated(updated);
  };

  const handleInteractionAdded = (newInteraction: SerializedCustomerInteraction) => {
    if (profile) {
      setProfile({
        ...profile,
        interactions: [newInteraction, ...(profile.interactions || [])],
      });
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end">
        <div className="bg-white border-l border-[#eee2dc] w-full max-w-xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-5 border-b border-[#eee2dc] bg-[#fffaf5] flex items-center justify-between shrink-0">
            {profile ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#542047] text-[#ffe8a8] flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                  {profile.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-serif font-bold text-[#542047] leading-tight">
                      {profile.name}
                    </h2>
                    <span className="px-2 py-0.5 bg-[#f4ead5] text-[#73501b] rounded-full text-[10px] font-bold">
                      {profile.segment}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        profile.isActive
                          ? 'bg-[#e2f6e8] text-[#246743]'
                          : 'bg-[#fbe8e8] text-[#b93657]'
                      }`}
                    >
                      {profile.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#68647a] mt-0.5">
                    <span className="font-mono font-semibold text-[#d49a24]">
                      {profile.customerCode || 'PATRON'}
                    </span>
                    <span>•</span>
                    <span>{profile.phone}</span>
                    {profile.primaryBranch && (
                      <>
                        <span>•</span>
                        <span>{profile.primaryBranch.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-sm font-bold text-[#542047]">Loading Patron Profile...</span>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Toolbar */}
          {profile && (
            <div className="px-5 py-2.5 bg-white border-b border-[#eee2dc] flex items-center justify-between shrink-0">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('OVERVIEW')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeTab === 'OVERVIEW'
                      ? 'bg-[#542047] text-[#ffe8a8]'
                      : 'text-[#68647a] hover:bg-[#fffaf5]'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('INTERACTIONS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    activeTab === 'INTERACTIONS'
                      ? 'bg-[#542047] text-[#ffe8a8]'
                      : 'text-[#68647a] hover:bg-[#fffaf5]'
                  }`}
                >
                  <span>Activity & Enquiries</span>
                  <span className="px-1.5 py-0.2 bg-[#f4ead5] text-[#73501b] rounded-full text-[10px]">
                    {profile.interactions?.length || 0}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('TRANSACTIONS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeTab === 'TRANSACTIONS'
                      ? 'bg-[#542047] text-[#ffe8a8]'
                      : 'text-[#68647a] hover:bg-[#fffaf5]'
                  }`}
                >
                  Billing & Gold History
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsInteractionModalOpen(true)}
                  className="px-2.5 py-1.5 bg-[#fffaf5] border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                  title="Log Showroom Visit or WhatsApp Enquiry"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#d49a24]" />
                  <span>Log Activity</span>
                </button>
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="px-2.5 py-1.5 bg-[#fffaf5] border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#542047]" />
                  <span>Edit</span>
                </button>
              </div>
            </div>
          )}

          {/* Drawer Content Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {isLoading && (
              <div className="py-16 text-center text-[#68647a] flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#d49a24]" />
                <span>Retrieving verified patron profile...</span>
              </div>
            )}

            {error && (
              <div className="p-4 bg-[#fbe8e8] border border-[#f5b8b8] rounded-xl text-xs text-[#b93657] flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isLoading && profile && (
              <>
                {/* TAB 1: OVERVIEW */}
                {activeTab === 'OVERVIEW' && (
                  <div className="space-y-4">
                    {/* Contact Information Card */}
                    <div className="bg-[#fffaf5] border border-[#eee2dc] rounded-2xl p-4 space-y-3">
                      <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                        Contact Details
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 bg-white border border-[#eee2dc] rounded-xl flex items-center gap-3">
                          <Phone className="w-4 h-4 text-[#d49a24] shrink-0" />
                          <div>
                            <span className="text-[10px] text-[#68647a] block">Primary Mobile</span>
                            <span className="font-bold text-[#25203a] text-xs">{profile.phone}</span>
                          </div>
                        </div>

                        <div className="p-3 bg-white border border-[#eee2dc] rounded-xl flex items-center gap-3">
                          <Phone className="w-4 h-4 text-[#68647a] shrink-0" />
                          <div>
                            <span className="text-[10px] text-[#68647a] block">Alternate Phone</span>
                            <span className="font-semibold text-[#25203a] text-xs">
                              {profile.alternatePhone || 'Not provided'}
                            </span>
                          </div>
                        </div>

                        <div className="p-3 bg-white border border-[#eee2dc] rounded-xl flex items-center gap-3 sm:col-span-2">
                          <Mail className="w-4 h-4 text-[#d49a24] shrink-0" />
                          <div>
                            <span className="text-[10px] text-[#68647a] block">Email Address</span>
                            <span className="font-semibold text-[#25203a] text-xs">
                              {profile.email || 'Not provided'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Address & Showroom Card */}
                    <div className="bg-[#fffaf5] border border-[#eee2dc] rounded-2xl p-4 space-y-3">
                      <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                        Address & Showroom Attribution
                      </span>

                      <div className="p-3 bg-white border border-[#eee2dc] rounded-xl flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-[#d49a24] shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-[#68647a] block">Residential / Billing Address</span>
                          <span className="font-semibold text-[#25203a] text-xs block">
                            {profile.addressLine1
                              ? `${profile.addressLine1}${profile.addressLine2 ? `, ${profile.addressLine2}` : ''}`
                              : 'No street address recorded'}
                          </span>
                          <span className="text-[11px] text-[#68647a]">
                            {[profile.city, profile.state, profile.pincode].filter(Boolean).join(', ') ||
                              'No city/state recorded'}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-white border border-[#eee2dc] rounded-xl flex items-center gap-3">
                        <Building className="w-4 h-4 text-[#542047] shrink-0" />
                        <div>
                          <span className="text-[10px] text-[#68647a] block">Assigned Home Showroom</span>
                          <span className="font-bold text-[#542047] text-xs">
                            {profile.primaryBranch
                              ? `${profile.primaryBranch.name} (${profile.primaryBranch.code})`
                              : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* KYC & Celebrations Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-[#fffaf5] border border-[#eee2dc] rounded-2xl p-4 space-y-2">
                        <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                          KYC & Compliance
                        </span>
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-[#d49a24]" />
                          <div>
                            <span className="text-[10px] text-[#68647a] block">Income Tax PAN</span>
                            <span className="font-mono font-bold text-[#25203a] text-xs">
                              {profile.pan || 'Not on file'}
                            </span>
                          </div>
                        </div>
                        {profile.pan && (
                          <span className="inline-block px-2 py-0.5 bg-[#e2f6e8] text-[#246743] rounded text-[9px] font-bold">
                            KYC Compliant for ≥ ₹2L Bills
                          </span>
                        )}
                      </div>

                      <div className="bg-[#fffaf5] border border-[#eee2dc] rounded-2xl p-4 space-y-2">
                        <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                          Celebrations
                        </span>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-[#d49a24]" />
                            <span className="text-[11px] text-[#25203a]">
                              <strong>Birthday:</strong> {profile.dateOfBirth || 'Not recorded'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-[#d49a24]" />
                            <span className="text-[11px] text-[#25203a]">
                              <strong>Anniversary:</strong> {profile.anniversary || 'Not recorded'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Patron Notes Card */}
                    <div className="bg-[#fffaf5] border border-[#eee2dc] rounded-2xl p-4 space-y-2">
                      <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                        Patron Notes & Sizing Preferences
                      </span>
                      {profile.notes ? (
                        <p className="text-xs text-[#25203a] leading-relaxed whitespace-pre-wrap bg-white p-3 rounded-xl border border-[#eee2dc]">
                          {profile.notes}
                        </p>
                      ) : (
                        <p className="text-xs text-[#68647a] italic">
                          No specific jewellery preferences or personal notes recorded for this patron.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: INTERACTIONS */}
                {activeTab === 'INTERACTIONS' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs font-bold text-[#542047]">
                        Chronological Showroom Activity & Enquiries
                      </span>
                      <button
                        onClick={() => setIsInteractionModalOpen(true)}
                        className="px-2.5 py-1 bg-[#542047] text-[#ffe8a8] rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-[#421b48] transition"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Log New Interaction</span>
                      </button>
                    </div>

                    {profile.interactions && profile.interactions.length > 0 ? (
                      <div className="space-y-3">
                        {profile.interactions.map((item) => (
                          <div
                            key={item.id}
                            className="p-3.5 bg-[#fffaf5] border border-[#eee2dc] rounded-2xl space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-[#542047] text-[#ffe8a8] rounded text-[10px] font-bold">
                                  {item.channel.replace('_', ' ')}
                                </span>
                                {item.followUpDate && (
                                  <span className="px-2 py-0.5 bg-[#fff0dc] border border-[#f1d394] text-[#73501b] rounded text-[10px] font-semibold flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-[#d49a24]" />
                                    <span>Follow-up: {item.followUpDate}</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-[#68647a]">
                                {new Date(item.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <p className="text-xs text-[#25203a] leading-relaxed whitespace-pre-wrap">
                              {item.notes}
                            </p>

                            {item.user && (
                              <div className="pt-1 text-[10px] text-[#68647a] flex items-center gap-1 border-t border-[#eee2dc]/60">
                                <User className="w-3 h-3 text-[#d49a24]" />
                                <span>Logged by staff member: {item.user.name || item.user.email}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-[#fffaf5] border border-[#eee2dc] rounded-2xl space-y-3">
                        <MessageSquare className="w-8 h-8 text-[#d49a24] mx-auto opacity-70" />
                        <div>
                          <span className="font-bold text-[#542047] block text-xs">
                            No Customer Enquiries Recorded Yet
                          </span>
                          <p className="text-[11px] text-[#68647a] mt-0.5">
                            Showroom visits, WhatsApp quotations, and follow-up reminders logged by your staff will appear here.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsInteractionModalOpen(true)}
                          className="px-3 py-1.5 bg-[#542047] text-[#ffe8a8] rounded-xl text-xs font-semibold hover:bg-[#421b48] transition inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Log First Interaction</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: TRANSACTIONS (Honest Empty States for Future Integration) */}
                {activeTab === 'TRANSACTIONS' && (
                  <div className="space-y-4">
                    {/* Balance Summary Card */}
                    <div className="p-4 bg-[#fffaf5] border border-[#eee2dc] rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                          Outstanding Ledger Balance
                        </span>
                        <span className="text-xl font-serif font-bold text-[#542047]">
                          ₹0.00
                        </span>
                      </div>
                      <span className="px-2.5 py-1 bg-[#e2f6e8] text-[#246743] rounded-lg text-xs font-bold">
                        Zero Outstanding
                      </span>
                    </div>

                    {/* Sales Invoices Section */}
                    <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#eee2dc]">
                        <Receipt className="w-4 h-4 text-[#d49a24]" />
                        <span className="font-bold text-xs text-[#542047]">Sales Invoices</span>
                      </div>
                      <div className="py-6 text-center text-[#68647a] space-y-1">
                        <ShoppingBag className="w-7 h-7 text-[#d49a24] mx-auto opacity-60 mb-2" />
                        <span className="font-bold text-[#25203a] block text-xs">
                          No sales recorded yet.
                        </span>
                        <p className="text-[11px] max-w-sm mx-auto leading-relaxed">
                          Sales invoices and hallmark purchase receipts will automatically link to this patron profile once the Billing & POS module is activated in Phase 3.
                        </p>
                      </div>
                    </div>

                    {/* Gold Purchase & Exchange Section */}
                    <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#eee2dc]">
                        <Coins className="w-4 h-4 text-[#d49a24]" />
                        <span className="font-bold text-xs text-[#542047]">
                          Old Gold Purchases & Exchanges
                        </span>
                      </div>
                      <div className="py-6 text-center text-[#68647a] space-y-1">
                        <Coins className="w-7 h-7 text-[#d49a24] mx-auto opacity-60 mb-2" />
                        <span className="font-bold text-[#25203a] block text-xs">
                          No gold purchases or exchanges recorded yet.
                        </span>
                        <p className="text-[11px] max-w-sm mx-auto leading-relaxed">
                          Old jewellery melting, testing, and exchange vouchers will appear here upon deployment of the Gold Purchase module.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-[#eee2dc] bg-[#fffaf5] flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-[#542047] text-[#ffe8a8] rounded-xl text-xs font-semibold hover:bg-[#421b48] transition"
            >
              Close Profile
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && profile && (
        <EditCustomerModal
          customer={profile}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={handleProfileUpdated}
          branches={branches}
        />
      )}

      {/* Add Interaction Modal */}
      {isInteractionModalOpen && profile && (
        <AddInteractionModal
          customerId={profile.id}
          customerName={profile.name}
          isOpen={isInteractionModalOpen}
          onClose={() => setIsInteractionModalOpen(false)}
          onSuccess={handleInteractionAdded}
        />
      )}
    </>
  );
}
