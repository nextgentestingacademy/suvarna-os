'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Gem,
  Tag,
  ShieldCheck,
  Scale,
  ArrowRightLeft,
  Building2,
  Clock,
  User,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { JewelArt } from '@/components/jewel-art';
import { SerializedOrnament, SerializedStockMovement, getOrnamentMovementsAction } from '@/app/actions/inventory';
import { getIndicativePrice } from '@/lib/indicative-pricing';

interface OrnamentDetailModalProps {
  ornament: SerializedOrnament | null;
  onClose: () => void;
  canManage: boolean;
  onInitiateTransfer?: (ornament: SerializedOrnament) => void;
}

export function OrnamentDetailModal({
  ornament,
  onClose,
  canManage,
  onInitiateTransfer,
}: OrnamentDetailModalProps) {
  const [movements, setMovements] = useState<SerializedStockMovement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  useEffect(() => {
    if (!ornament) return;

    let isMounted = true;
    setIsLoadingMovements(true);
    setMovementsError(null);

    getOrnamentMovementsAction(ornament.id)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setMovements(res.data);
        } else {
          setMovementsError(res.error || 'Failed to load stock movements.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setMovementsError(err.message || 'Error fetching movement history.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingMovements(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ornament?.id]);

  if (!ornament) return null;

  const formatCurrency = (val: string | null) => {
    if (!val) return '—';
    const num = parseFloat(val);
    return isNaN(num) ? '—' : `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return { label: 'In Stock', color: 'bg-[#e2f6e8] text-[#246743] border-[#a3e2bb]' };
      case 'RESERVED':
        return { label: 'Reserved', color: 'bg-[#fff0dc] text-[#82510b] border-[#f1d394]' };
      case 'SOLD':
        return { label: 'Sold', color: 'bg-[#eee] text-[#666] border-[#ccc]' };
      case 'IN_TRANSIT':
        return { label: 'In Transit', color: 'bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]' };
      case 'DAMAGED':
        return { label: 'Damaged', color: 'bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5]' };
      default:
        return { label: status, color: 'bg-stone-100 text-stone-700 border-stone-200' };
    }
  };

  const statusBadge = formatStatus(ornament.status);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div role="dialog" aria-modal="true" className="bg-white border border-[#eee2dc] rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#eee2dc]">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-xs font-bold text-[#d49a24] bg-[#fffaf0] border border-[#f1d394] px-2 py-0.5 rounded">
                Tag Code: {ornament.tagCode}
              </span>
              {ornament.huid && (
                <span className="flex items-center gap-1 font-mono text-xs font-bold text-[#542047] bg-[#f9eef6] border border-[#d6a5c9] px-2 py-0.5 rounded">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#542047]" />
                  HUID: {ornament.huid}
                </span>
              )}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
            </div>
            <h2 className="text-xl lg:text-2xl font-serif font-bold text-[#542047]">
              {ornament.product?.name || 'Jewellery Ornament'}
            </h2>
            <p className="text-xs text-[#68647a]">
              <span className="font-semibold text-[#542047]">Product Code (SKU):</span>{' '}
              <span className="font-mono font-medium text-[#25203a]">{ornament.product?.sku || '—'}</span> · Showroom:{' '}
              <span className="font-medium text-[#25203a]">{ornament.branch?.name || 'Main Branch'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visual Banner */}
        <div className="my-4 h-40 bg-gradient-to-b from-[#fffaf0] to-[#f8ecd9] rounded-xl flex items-center justify-center border border-[#eee2dc] relative overflow-hidden">
          <JewelArt category={ornament.product?.category || 'Necklaces'} className="w-full h-full max-h-36 drop-shadow-sm" />
          <div className="absolute bottom-2 left-3 flex gap-2">
            <span className="px-2 py-0.5 bg-white/90 backdrop-blur border border-[#eee2dc] text-[#542047] font-bold text-[11px] rounded shadow-xs">
              {ornament.purity}
            </span>
            <span className="px-2 py-0.5 bg-white/90 backdrop-blur border border-[#eee2dc] text-[#73501b] font-bold text-[11px] rounded shadow-xs">
              {ornament.metalType}
            </span>
          </div>
        </div>

        {/* Weights & Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-6">
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="text-[#68647a] block text-[10px] font-medium">Gross Weight</span>
            <span className="font-bold text-[#25203a] text-sm">{ornament.grossWeight} g</span>
          </div>
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="text-[#68647a] block text-[10px] font-medium">Stone Weight</span>
            <span className="font-bold text-[#25203a] text-sm">{ornament.stoneWeight} g</span>
          </div>
          <div className="p-3 bg-[#fdf8f0] border border-[#f1d394] rounded-xl">
            <span className="text-[#73501b] block text-[10px] font-medium">Net Metal Weight</span>
            <span className="font-bold text-[#542047] text-sm">{ornament.netWeight} g</span>
          </div>

          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            {(() => {
              const pricing = getIndicativePrice(ornament);
              return (
                <>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[#68647a] block text-[10px] font-medium">Indicative Retail Price</span>
                    {pricing.hasPrice && (
                      <span className="text-[9px] text-[#d49a24] bg-white px-1 rounded border border-[#f1d394]">
                        {pricing.label}
                      </span>
                    )}
                  </div>
                  {pricing.hasPrice ? (
                    <span className="font-bold text-[#7b285e] text-sm block">{pricing.formattedPrice}</span>
                  ) : (
                    <div>
                      <span className="font-medium text-stone-500 text-xs block">{pricing.formattedPrice}</span>
                      {pricing.reason && (
                        <span className="text-[10px] text-stone-400 block font-normal">({pricing.reason})</span>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="text-[#68647a] block text-[10px] font-medium">Making Charge</span>
            <span className="font-bold text-[#25203a] text-xs">
              {ornament.makingChargeValue
                ? ornament.makingChargeType === 'PERCENTAGE'
                  ? `${ornament.makingChargeValue}%`
                  : ornament.makingChargeType === 'PER_GRAM'
                  ? `₹${ornament.makingChargeValue}/g`
                  : `₹${parseFloat(ornament.makingChargeValue).toLocaleString('en-IN')} Flat`
                : 'Standard'}
            </span>
          </div>
          {ornament.costAmount !== null ? (
            <div className="p-3 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl">
              <span className="text-[#475569] block text-[10px] font-medium">Wholesale Cost (Confidential)</span>
              <span className="font-bold text-[#1e293b] text-sm">{formatCurrency(ornament.costAmount)}</span>
            </div>
          ) : (
            <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl flex items-center justify-center text-center">
              <span className="text-[#888] text-[11px] italic">Cost protected by RBAC</span>
            </div>
          )}
        </div>

        {/* Stock Movement Ledger History */}
        <div className="border-t border-[#eee2dc] pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#d49a24]" />
              <h3 className="font-serif font-bold text-sm text-[#542047]">
                Stock Movement Ledger (Audit Trail)
              </h3>
            </div>
            <span className="text-[10px] text-[#68647a] font-mono">
              {movements.length} logged record{movements.length === 1 ? '' : 's'}
            </span>
          </div>

          {isLoadingMovements ? (
            <div className="py-6 text-center text-xs text-[#68647a]">
              Loading verified movement ledger...
            </div>
          ) : movementsError ? (
            <div className="p-3 bg-[#fee2e2] border border-[#fca5a5] rounded-xl text-xs text-[#b91c1c] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{movementsError}</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-4 text-center text-xs text-[#68647a] italic">
              No historical movements recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {movements.map((m) => {
                const dateStr = new Date(m.createdAt).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={m.id}
                    className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                            m.movementType === 'INWARD'
                              ? 'bg-[#e2f6e8] text-[#246743]'
                              : m.movementType === 'TRANSFER'
                              ? 'bg-[#e0f2fe] text-[#0369a1]'
                              : 'bg-[#fff0dc] text-[#82510b]'
                          }`}
                        >
                          {m.movementType}
                        </span>
                        <span className="text-[#25203a] font-semibold">
                          {m.movementType === 'INWARD' && (
                            <span>Received into {m.toBranch?.name || 'Showroom'}</span>
                          )}
                          {m.movementType === 'TRANSFER' && (
                            <span>
                              Transfer: {m.fromBranch?.name || 'Origin'} → {m.toBranch?.name || 'Destination'}
                            </span>
                          )}
                          {m.movementType === 'AUDIT_ADJUSTMENT' && <span>Audit Adjustment</span>}
                        </span>
                      </div>
                      {m.reason && (
                        <p className="text-[11px] text-[#68647a] italic">Note: {m.reason}</p>
                      )}
                      {m.metadata && (
                        <div className="text-[10px] text-[#542047] font-mono mt-0.5">
                          {m.metadata.adjustmentType === 'STATUS_CHANGE' && (
                            <span>Transition: {m.metadata.before?.status} → {m.metadata.after?.status}</span>
                          )}
                          {m.metadata.adjustmentType === 'WEIGHT_CORRECTION' && (
                            <span>Weight: {m.metadata.before?.grossWeight}g → {m.metadata.after?.grossWeight}g (Net: {m.metadata.before?.netWeight}g → {m.metadata.after?.netWeight}g)</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-right text-[10px] text-[#68647a] shrink-0">
                      <div>{dateStr}</div>
                      {m.user && <div className="text-[#542047] font-medium">{m.user.name || m.user.email}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-[#eee2dc] flex items-center justify-between gap-3">
          <div>
            {canManage && ornament.status === 'AVAILABLE' && onInitiateTransfer && (
              <button
                onClick={() => {
                  onClose();
                  onInitiateTransfer(ornament);
                }}
                className="px-4 py-2 bg-[#fff0dc] hover:bg-[#ffe3be] border border-[#f1d394] text-[#73501b] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Inter-Branch Transfer</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl text-xs font-semibold transition"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
