'use client';

import React, { useState, useEffect } from 'react';
import { X, UserPlus, AlertCircle, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { createCustomerAction, checkCustomerDuplicatesAction, SerializedCustomer } from '@/app/actions/customer';
import { INDIAN_STATES_AND_UTS } from '@/lib/customer-constants';

interface BranchOption {
  id: string;
  name: string;
  code: string;
  city?: string;
}

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: SerializedCustomer) => void;
  branches: BranchOption[];
  activeBranchId?: string;
}

export function AddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
  branches,
  activeBranchId,
}: AddCustomerModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    alternatePhone: '',
    email: '',
    primaryBranchId: activeBranchId || (branches[0]?.id ?? ''),
    segment: 'RETAIL',
    pan: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    dateOfBirth: '',
    anniversary: '',
    notes: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Synchronize branch selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData((prev) => ({
        ...prev,
        primaryBranchId: prev.primaryBranchId || activeBranchId || (branches[0]?.id ?? ''),
      }));
    }
  }, [isOpen, activeBranchId, branches]);

  // Duplicate check state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    count: number;
    names: string[];
  } | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Debounced live duplicate check on phone input
  useEffect(() => {
    const digits = formData.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      try {
        const res = await checkCustomerDuplicatesAction(formData.phone, formData.name);
        if (res.success && res.data && res.data.hasDuplicates) {
          const names = res.data.phoneMatches.map((m) => `${m.name} (${m.customerCode || 'No Code'})`);
          setDuplicateWarning({
            count: res.data.phoneMatches.length,
            names,
          });
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        // Soft fail on network/check error
      } finally {
        setIsCheckingDuplicates(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formData.phone, formData.name]);

  if (!isOpen) return null;

  const validate = () => {
    const errors: Record<string, string> = {};
    const trimmedName = formData.name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      errors.name = 'Full name is required (minimum 2 characters)';
    } else if (/\d/.test(trimmedName)) {
      errors.name = 'Full name cannot contain numbers';
    } else if (!/^[\p{L}\p{M}\s.'-]+$/u.test(trimmedName)) {
      errors.name = 'Full name can only contain letters, spaces, hyphens, apostrophes, and periods';
    }

    const phoneDigits = formData.phone.replace(/\D/g, '');
    let normPhone = phoneDigits;
    if (normPhone.length === 12 && normPhone.startsWith('91')) normPhone = normPhone.slice(2);
    if (normPhone.length === 11 && normPhone.startsWith('0')) normPhone = normPhone.slice(1);
    if (!normPhone) {
      errors.phone = 'Mobile phone number is required';
    } else if (!/^[6-9]\d{9}$/.test(normPhone)) {
      errors.phone = 'Please enter a valid 10-digit Indian mobile number';
    }

    if (formData.alternatePhone.trim()) {
      const altDigits = formData.alternatePhone.replace(/\D/g, '');
      let normAlt = altDigits;
      if (normAlt.length === 12 && normAlt.startsWith('91')) normAlt = normAlt.slice(2);
      if (normAlt.length === 11 && normAlt.startsWith('0')) normAlt = normAlt.slice(1);
      if (!/^[6-9]\d{9}$/.test(normAlt)) {
        errors.alternatePhone = 'Please enter a valid 10-digit Indian phone number';
      }
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (formData.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.pan.trim().toUpperCase())) {
      errors.pan = 'PAN must be 10 alphanumeric characters (e.g. ABCDE1234F)';
    }

    if (formData.pincode && !/^\d{6}$/.test(formData.pincode.trim())) {
      errors.pincode = 'PIN code must be exactly 6 digits';
    }

    if (formData.city.trim()) {
      const trimmedCity = formData.city.trim();
      if (/\d/.test(trimmedCity)) {
        errors.city = 'City name cannot contain numbers';
      } else if (!/^[\p{L}\p{M}\s.'-]+$/u.test(trimmedCity)) {
        errors.city = 'City name can only contain letters, spaces, hyphens, and periods';
      }
    }

    const currentYear = new Date().getFullYear();
    if (formData.dateOfBirth) {
      const parts = formData.dateOfBirth.split('-');
      if (parts.length !== 3) {
        errors.dateOfBirth = 'Invalid date format';
      } else {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const parsed = new Date(Date.UTC(y, m - 1, d));
        if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
          errors.dateOfBirth = 'Invalid calendar date';
        } else if (y < currentYear - 120 || y > currentYear) {
          errors.dateOfBirth = `Year must be between ${currentYear - 120} and ${currentYear}`;
        } else if (parsed > new Date()) {
          errors.dateOfBirth = 'Birthday cannot be in the future';
        }
      }
    }

    if (formData.anniversary) {
      const parts = formData.anniversary.split('-');
      if (parts.length !== 3) {
        errors.anniversary = 'Invalid date format';
      } else {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const parsed = new Date(Date.UTC(y, m - 1, d));
        if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
          errors.anniversary = 'Invalid calendar date';
        } else if (y < currentYear - 100 || y > currentYear + 1) {
          errors.anniversary = `Year must be between ${currentYear - 100} and ${currentYear + 1}`;
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const res = await createCustomerAction({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        alternatePhone: formData.alternatePhone.trim() || null,
        email: formData.email.trim() || null,
        primaryBranchId: formData.primaryBranchId || null,
        segment: formData.segment,
        pan: formData.pan.trim() ? formData.pan.trim().toUpperCase() : null,
        addressLine1: formData.addressLine1.trim() || null,
        addressLine2: formData.addressLine2.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        pincode: formData.pincode.trim() || null,
        dateOfBirth: formData.dateOfBirth || null,
        anniversary: formData.anniversary || null,
        notes: formData.notes.trim() || null,
      });

      if (res.success && res.data) {
        onSuccess(res.data);
        onClose();
      } else {
        setServerError(res.error || 'Failed to register customer profile.');
      }
    } catch (err: any) {
      setServerError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#eee2dc] rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#542047] text-[#ffe8a8] flex items-center justify-center font-bold">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#d49a24] uppercase tracking-wider block">
                Patron Onboarding
              </span>
              <h2 className="text-lg font-serif font-bold text-[#542047]">
                Register New Customer Profile
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div className="mt-3 p-3 bg-[#fbe8e8] border border-[#f5b8b8] rounded-xl text-xs text-[#b93657] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 pr-1 my-4 space-y-4 text-xs">
          {/* Section: Primary Identity */}
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-3">
            <span className="text-[11px] font-bold text-[#542047] block uppercase tracking-wider">
              Primary Identity & Contact
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Full Customer Name <span className="text-[#b93657]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Meera Joshi"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.name && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.name}</span>
                )}
              </div>

              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Primary Mobile Number <span className="text-[#b93657]">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 98200 12345"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.phone && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.phone}</span>
                )}
              </div>
            </div>

            {/* Live Duplicate Warning */}
            {duplicateWarning && (
              <div className="p-2.5 bg-[#fff8e7] border border-[#f1d394] rounded-xl text-[11px] text-[#73501b] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#d49a24] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">
                    Shared Mobile Phone Notice: {duplicateWarning.count} existing patron(s) found with this number:
                  </span>
                  <span className="text-[10px] block mt-0.5">
                    {duplicateWarning.names.join(', ')}.
                  </span>
                  <span className="text-[10px] text-[#68647a] block mt-0.5">
                    Jewellery retail policies permit family members to share a household contact. You can proceed with registration.
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Alternate Phone (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 98200 54321"
                  value={formData.alternatePhone}
                  onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.alternatePhone && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.alternatePhone}</span>
                )}
              </div>

              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="e.g. meera@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.email && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.email}</span>
                )}
              </div>
            </div>
          </div>

          {/* Section: Segmentation & Branch Assignment */}
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-3">
            <span className="text-[11px] font-bold text-[#542047] block uppercase tracking-wider">
              Patron Relationship & Showroom Attribution
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Customer Segment
                </label>
                <select
                  value={formData.segment}
                  onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                >
                  <option value="RETAIL">Standard Retail Patron</option>
                  <option value="VIP">VIP Patron</option>
                  <option value="BRIDAL">Bridal Consultation</option>
                  <option value="GOLD_SIP">Gold SIP Member</option>
                  <option value="REPEAT">Repeat Patron</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Home Showroom Branch
                </label>
                <select
                  value={formData.primaryBranchId}
                  onChange={(e) => setFormData({ ...formData, primaryBranchId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                >
                  <option value="">No branch assigned</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code}) - {b.city || 'Showroom'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-[#25203a] block mb-1">
                Income Tax PAN (Optional KYC)
              </label>
              <input
                type="text"
                maxLength={10}
                placeholder="e.g. ABCDE1234F"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a] font-mono uppercase"
              />
              <span className="text-[10px] text-[#68647a] block mt-0.5">
                Indian Income Tax rules mandate customer PAN verification for jewellery sales exceeding ₹2,00,000.
              </span>
              {formErrors.pan && (
                <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.pan}</span>
              )}
            </div>
          </div>

          {/* Section: Residential Address */}
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-3">
            <span className="text-[11px] font-bold text-[#542047] block uppercase tracking-wider">
              Postal & Delivery Address (Optional)
            </span>

            <div>
              <input
                type="text"
                placeholder="Flat / House No., Building Name, Street"
                value={formData.addressLine1}
                onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a] mb-2"
              />
              <input
                type="text"
                placeholder="Area, Landmark (Optional)"
                value={formData.addressLine2}
                onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="font-semibold text-[#25203a] block mb-1">City</label>
                <input
                  type="text"
                  placeholder="e.g. Mumbai"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.city && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.city}</span>
                )}
              </div>
              <div>
                <label className="font-semibold text-[#25203a] block mb-1">State / UT</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                >
                  <option value="">Select State / UT</option>
                  {INDIAN_STATES_AND_UTS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                {formErrors.state && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.state}</span>
                )}
              </div>
              <div>
                <label className="font-semibold text-[#25203a] block mb-1">PIN Code</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="400001"
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.pincode && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.pincode}</span>
                )}
              </div>
            </div>
          </div>

          {/* Section: Celebrations & Preferences */}
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-3">
            <span className="text-[11px] font-bold text-[#542047] block uppercase tracking-wider">
              Celebrations & Jeweller Notes
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Birthday (Optional)
                </label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.dateOfBirth && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.dateOfBirth}</span>
                )}
              </div>

              <div>
                <label className="font-semibold text-[#25203a] block mb-1">
                  Wedding Anniversary (Optional)
                </label>
                <input
                  type="date"
                  value={formData.anniversary}
                  onChange={(e) => setFormData({ ...formData, anniversary: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
                {formErrors.anniversary && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.anniversary}</span>
                )}
              </div>
            </div>

            <div>
              <label className="font-semibold text-[#25203a] block mb-1">
                Patron Notes & Preferences
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Ring size 14, prefers 22K antique finish, daughter getting married in December..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#eee2dc] shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-[#fffaf5] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Save Customer Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
