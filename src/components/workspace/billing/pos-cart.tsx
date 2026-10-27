'use client';

import React from 'react';
import { Trash2, Gem, Tag, Sparkles, Scale, Info } from 'lucide-react';
import { SerializedOrnament } from '@/app/actions/inventory';
import { SerializedCalculatedLineItem } from '@/app/actions/billing';

export interface CartItem {
  ornament: SerializedOrnament;
  pricingMode: 'WEIGHT_BASED' | 'FIXED_PRICE';
  ratePerGram: number;
  fixedPrice?: number;
  makingChargeType: 'PER_GRAM' | 'PERCENTAGE' | 'FIXED';
  makingChargeRate: number;
  stoneCharges: number;
  itemDiscount: number;
}

interface PosCartProps {
  cartItems: CartItem[];
  calculatedItems: SerializedCalculatedLineItem[];
  onRemoveItem: (ornamentId: string) => void;
  onUpdateItemRate: (ornamentId: string, rate: number) => void;
  onUpdateItemDiscount: (ornamentId: string, discount: number) => void;
  onClearCart: () => void;
}

export function PosCart({
  cartItems,
  calculatedItems,
  onRemoveItem,
  onUpdateItemRate,
  onUpdateItemDiscount,
  onClearCart,
}: PosCartProps) {
  if (cartItems.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#eee2dc] p-10 text-center shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-[#fff0dc] border border-[#d49a24]/30 text-[#d49a24] flex items-center justify-center mx-auto mb-3">
          <Gem className="w-7 h-7" />
        </div>
        <h3 className="font-serif font-bold text-base text-[#542047]">
          Current Bill is Empty
        </h3>
        <p className="text-xs text-[#68647a] max-w-sm mx-auto mt-1 leading-relaxed">
          Scan a jewellery barcode / tag, or click <strong className="text-[#542047]">Browse Inventory</strong> above to add ornaments to this sales bill.
        </p>
      </div>
    );
  }

  // Map calculated item amounts by ornamentId for quick lookup
  const calcMap = new Map<string, SerializedCalculatedLineItem>();
  for (const ci of calculatedItems) {
    calcMap.set(ci.ornamentId, ci);
  }

  return (
    <div className="bg-white rounded-2xl border border-[#eee2dc] shadow-xs overflow-hidden">
      {/* Cart Header */}
      <div className="p-3.5 bg-[#fffaf5] border-b border-[#eee2dc] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-serif font-bold text-xs text-[#542047] uppercase tracking-wider">
            Selected Jewellery ({cartItems.length} {cartItems.length === 1 ? 'item' : 'items'})
          </span>
        </div>
        <button
          type="button"
          onClick={onClearCart}
          className="text-[11px] text-[#b93657] hover:text-[#90243e] font-semibold flex items-center gap-1 transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>
      </div>

      {/* Cart Items List */}
      <div className="divide-y divide-[#eee2dc] max-h-[500px] overflow-y-auto">
        {cartItems.map(({ ornament, ratePerGram, makingChargeType, makingChargeRate, itemDiscount }) => {
          const calc = calcMap.get(ornament.id);

          const gross = parseFloat(ornament.grossWeight);
          const stone = parseFloat(ornament.stoneWeight);
          const net = parseFloat(ornament.netWeight);

          const metalVal = calc
            ? parseFloat(calc.metalValue)
            : net * ratePerGram;
          const mcAmount = calc
            ? parseFloat(calc.makingChargeAmount)
            : makingChargeType === 'PER_GRAM'
            ? net * makingChargeRate
            : (metalVal * makingChargeRate) / 100;
          const taxable = calc
            ? parseFloat(calc.taxableAmount)
            : metalVal + mcAmount - itemDiscount;
          const totalWithGst = calc
            ? parseFloat(calc.totalAmount)
            : taxable * 1.03;

          return (
            <div key={ornament.id} className="p-4 hover:bg-[#fffdfa] transition space-y-3">
              {/* Row 1: Title, Tags & Remove Button */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#542047]">
                      {ornament.product?.name || 'Jewellery Ornament'}
                    </span>
                    <span className="px-2 py-0.2 bg-[#542047] text-[#ffe8a8] rounded text-[10px] font-bold">
                      {ornament.purity} {ornament.metalType}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#68647a] font-mono">
                    <span className="px-1.5 py-0.2 bg-[#fff0dc] text-[#73501b] font-bold rounded">
                      {ornament.tagCode}
                    </span>
                    <span>SKU: {ornament.product?.sku || 'N/A'}</span>
                    {ornament.huid && (
                      <span className="text-[#246743] font-semibold">HUID: {ornament.huid}</span>
                    )}
                    <span>Cat: {ornament.product?.category || 'Jewellery'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveItem(ornament.id)}
                  className="p-1.5 text-stone-400 hover:text-[#b93657] hover:bg-[#fbe8e8] rounded-lg transition cursor-pointer"
                  title="Remove ornament from sales bill"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Row 2: Weight Verification Badges */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-[#fffaf5] p-2.5 rounded-xl border border-[#eee2dc] text-xs">
                <div>
                  <span className="text-[#68647a] text-[10px] block">Gross Weight</span>
                  <span className="font-mono font-semibold text-[#25203a]">{gross.toFixed(3)}g</span>
                </div>
                <div>
                  <span className="text-[#68647a] text-[10px] block">Stone Deduction</span>
                  <span className="font-mono text-[#68647a]">{stone.toFixed(3)}g</span>
                </div>
                <div>
                  <span className="text-[#68647a] text-[10px] font-bold block text-[#542047]">Net Gold Weight</span>
                  <span className="font-mono font-bold text-[#542047]">{net.toFixed(3)}g</span>
                </div>
                <div className="hidden sm:block">
                  <span className="text-[#68647a] text-[10px] block">Rate Applied</span>
                  <span className="font-mono font-semibold">₹{ratePerGram.toLocaleString('en-IN')}/g</span>
                </div>
              </div>

              {/* Row 3: Pricing Breakdown & Final Line Total */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#68647a]">
                  <div>
                    <span>Metal Value: </span>
                    <span className="font-mono font-semibold text-[#25203a]">
                      ₹{metalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div>
                    <span>Making ({makingChargeType === 'PER_GRAM' ? `₹${makingChargeRate}/g` : `${makingChargeRate}%`}): </span>
                    <span className="font-mono font-semibold text-[#25203a]">
                      ₹{mcAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {itemDiscount > 0 && (
                    <div className="text-[#246743]">
                      <span>Discount: </span>
                      <span className="font-mono font-semibold">-₹{itemDiscount.toFixed(2)}</span>
                    </div>
                  )}

                  {ornament.priceAmount && (
                    <div className="flex items-center gap-1 bg-[#fffaf5] border border-[#eee2dc] px-2 py-0.5 rounded text-[10px]">
                      <span>Tag Indicative: </span>
                      <span className="font-mono font-bold text-[#542047]">
                        ₹{parseFloat(ornament.priceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      {Math.abs(taxable - parseFloat(ornament.priceAmount)) > 0.01 && (
                        <span className="text-[9px] text-[#b8861e] font-semibold">
                          ({taxable > parseFloat(ornament.priceAmount) ? '+' : ''}₹{(taxable - parseFloat(ornament.priceAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} live rate adj.)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-[#68647a] block">Item Total (incl. 3% GST):</span>
                  <span className="font-mono font-bold text-sm text-[#542047]">
                    ₹{totalWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
