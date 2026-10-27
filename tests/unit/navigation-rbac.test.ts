import { describe, it, expect } from 'vitest';
import {
  getPermittedNavItems,
  canManageInventory,
  canViewReports,
  canManageSettings,
  WORKSPACE_NAV_ITEMS,
} from '@/lib/navigation';
import { Role } from '@/types/security';

describe('RBAC Navigation Filtering & Action Controls', () => {
  it('master navigation list contains 10 defined workspace items', () => {
    expect(WORKSPACE_NAV_ITEMS.length).toBe(10);
  });

  describe('1. Store Owner (OWNER)', () => {
    const role: Role = 'OWNER';

    it('sees all 10 navigation modules', () => {
      const items = getPermittedNavItems(role);
      expect(items.length).toBe(10);
      const hrefs = items.map((i) => i.href);
      expect(hrefs).toContain('/dashboard');
      expect(hrefs).toContain('/inventory');
      expect(hrefs).toContain('/customers');
      expect(hrefs).toContain('/billing');
      expect(hrefs).toContain('/purchases');
      expect(hrefs).toContain('/schemes');
      expect(hrefs).toContain('/reports');
      expect(hrefs).toContain('/reconciliation');
      expect(hrefs).toContain('/ai-copilot');
      expect(hrefs).toContain('/settings');
    });

    it('has all management and report viewing capabilities', () => {
      expect(canManageInventory(role)).toBe(true);
      expect(canViewReports(role)).toBe(true);
      expect(canManageSettings(role)).toBe(true);
    });
  });

  describe('2. Store Manager (MANAGER)', () => {
    const role: Role = 'MANAGER';

    it('sees 8 navigation modules: Reports is hidden, Settings is visible', () => {
      const items = getPermittedNavItems(role);
      expect(items.length).toBe(8);
      const hrefs = items.map((i) => i.href);

      // Permitted
      expect(hrefs).toContain('/dashboard');
      expect(hrefs).toContain('/inventory');
      expect(hrefs).toContain('/customers');
      expect(hrefs).toContain('/billing');
      expect(hrefs).toContain('/purchases');
      expect(hrefs).toContain('/schemes');
      expect(hrefs).toContain('/ai-copilot');
      expect(hrefs).toContain('/settings');

      // Denied (Lacks ACCOUNTS_VIEW)
      expect(hrefs).not.toContain('/reports');
      expect(hrefs).not.toContain('/reconciliation');
    });

    it('can manage inventory and settings, but cannot view financial reports', () => {
      expect(canManageInventory(role)).toBe(true);
      expect(canManageSettings(role)).toBe(true);
      expect(canViewReports(role)).toBe(false);
    });
  });

  describe('3. Chartered Accountant (ACCOUNTANT)', () => {
    const role: Role = 'ACCOUNTANT';

    it('sees 9 navigation modules: Reports and Reconciliation are visible, Settings is hidden', () => {
      const items = getPermittedNavItems(role);
      expect(items.length).toBe(9);
      const hrefs = items.map((i) => i.href);

      // Permitted
      expect(hrefs).toContain('/dashboard');
      expect(hrefs).toContain('/inventory');
      expect(hrefs).toContain('/customers');
      expect(hrefs).toContain('/billing');
      expect(hrefs).toContain('/purchases');
      expect(hrefs).toContain('/schemes');
      expect(hrefs).toContain('/reports');
      expect(hrefs).toContain('/reconciliation');
      expect(hrefs).toContain('/ai-copilot');

      // Denied (Lacks BRANCH_MANAGE / TENANT_MANAGE / STAFF_MANAGE)
      expect(hrefs).not.toContain('/settings');
    });

    it('can view financial reports, but cannot manage inventory or settings', () => {
      expect(canViewReports(role)).toBe(true);
      expect(canManageInventory(role)).toBe(false);
      expect(canManageSettings(role)).toBe(false);
    });
  });

  describe('4. Counter Sales Associate (SALES_STAFF)', () => {
    const role: Role = 'SALES_STAFF';

    it('sees 7 navigation modules: Reports and Settings are both hidden', () => {
      const items = getPermittedNavItems(role);
      expect(items.length).toBe(7);
      const hrefs = items.map((i) => i.href);

      // Permitted (INVENTORY_VIEW, BILLING_CREATE)
      expect(hrefs).toContain('/dashboard');
      expect(hrefs).toContain('/inventory');
      expect(hrefs).toContain('/customers');
      expect(hrefs).toContain('/billing');
      expect(hrefs).toContain('/purchases');
      expect(hrefs).toContain('/schemes');
      expect(hrefs).toContain('/ai-copilot');

      // Denied
      expect(hrefs).not.toContain('/reports');
      expect(hrefs).not.toContain('/reconciliation');
      expect(hrefs).not.toContain('/settings');
    });

    it('cannot manage inventory, cannot view financial reports, and cannot configure settings', () => {
      expect(canManageInventory(role)).toBe(false);
      expect(canViewReports(role)).toBe(false);
      expect(canManageSettings(role)).toBe(false);
    });
  });

  describe('5. Unassigned or Unknown Role Fallback', () => {
    it('returns only unconstrained items (Dashboard) when role is undefined', () => {
      const items = getPermittedNavItems(undefined);
      expect(items.length).toBe(1);
      expect(items[0].href).toBe('/dashboard');
    });

    it('returns only unconstrained items when role is invalid', () => {
      const items = getPermittedNavItems('UNKNOWN_ROLE');
      expect(items.length).toBe(1);
      expect(items[0].href).toBe('/dashboard');
    });

    it('flags all management actions as false for undefined role', () => {
      expect(canManageInventory(undefined)).toBe(false);
      expect(canViewReports(undefined)).toBe(false);
      expect(canManageSettings(undefined)).toBe(false);
    });
  });
});
