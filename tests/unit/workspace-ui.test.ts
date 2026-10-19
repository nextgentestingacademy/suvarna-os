import { describe, it, expect } from 'vitest';
import {
  INITIAL_DEMO_PRODUCTS,
  INITIAL_DEMO_CUSTOMERS,
  DEMO_BRANCHES,
  DEMO_RATES,
} from '@/data/mock-workspace';

describe('Jeweller Workspace UI Data & Filter Logic', () => {
  it('correctly loads demo branches with at least one designated as main showroom', () => {
    expect(DEMO_BRANCHES.length).toBeGreaterThanOrEqual(2);
    const mainBranch = DEMO_BRANCHES.find((b) => b.isMain);
    expect(mainBranch).toBeDefined();
    expect(mainBranch?.name).toBe('Fort Main Showroom');
  });

  it('correctly filters jewellery products by category', () => {
    const bangles = INITIAL_DEMO_PRODUCTS.filter((p) => p.category === 'Bangles');
    expect(bangles.length).toBeGreaterThan(0);
    expect(bangles.every((p) => p.category === 'Bangles')).toBe(true);
  });

  it('correctly filters jewellery products by purity standard', () => {
    const gold22k = INITIAL_DEMO_PRODUCTS.filter((p) => p.purity === '22K');
    expect(gold22k.length).toBeGreaterThan(0);
    expect(gold22k.every((p) => p.purity === '22K')).toBe(true);
  });

  it('searches products by SKU or name case-insensitively', () => {
    const query = 'heritage';
    const results = INITIAL_DEMO_PRODUCTS.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase())
    );
    expect(results.length).toBe(1);
    expect(results[0].sku).toBe('NK-22018');
  });

  it('identifies low stock items when stock is 4 pieces or fewer', () => {
    const lowStock = INITIAL_DEMO_PRODUCTS.filter((p) => p.stock <= 4);
    expect(lowStock.length).toBeGreaterThan(0);
    expect(lowStock.every((p) => p.stock <= 4)).toBe(true);
  });

  it('searches customer profiles by name, phone, or email', () => {
    const searchByPhone = INITIAL_DEMO_CUSTOMERS.filter((c) =>
      c.phone.includes('98201')
    );
    expect(searchByPhone.length).toBe(1);
    expect(searchByPhone[0].name).toBe('Ananya Mehta');

    const searchByName = INITIAL_DEMO_CUSTOMERS.filter((c) =>
      c.name.toLowerCase().includes('rohan')
    );
    expect(searchByName.length).toBe(1);
    expect(searchByName[0].segment).toBe('Bridal enquiry');
  });

  it('enforces gross weight is greater than or equal to net weight for all catalogue items', () => {
    for (const p of INITIAL_DEMO_PRODUCTS) {
      expect(p.grossWeight).toBeGreaterThanOrEqual(p.netWeight);
      expect(p.grossWeight - p.netWeight).toBeCloseTo(p.stoneWeight, 3);
    }
  });

  it('maintains valid indicative rate benchmarks', () => {
    expect(DEMO_RATES.gold24k).toBeGreaterThan(DEMO_RATES.gold22k);
    expect(DEMO_RATES.gold22k).toBeGreaterThan(DEMO_RATES.gold18k);
    expect(DEMO_RATES.silver).toBeGreaterThan(0);
  });
});
