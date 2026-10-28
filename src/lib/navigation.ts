import {
  LayoutDashboard,
  Gem,
  Users,
  Receipt,
  Repeat,
  PiggyBank,
  BarChart3,
  Sparkles,
  Settings,
  Scale,
  LucideIcon,
} from 'lucide-react';
import { Role, Permission } from '@/types/security';
import { hasPermission } from '@/lib/rbac';

export interface NavItemConfig {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly ready: boolean;
  readonly requiredPermissions?: readonly Permission[];
  readonly requireAny?: boolean;
}

/**
 * Master navigation definitions for the Suvarna Jeweller Workspace.
 * Each navigation item specifies the RBAC permission(s) required to view it.
 */
export const WORKSPACE_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    ready: true,
  },
  {
    label: 'Jewellery Inventory',
    href: '/inventory',
    icon: Gem,
    ready: true,
    requiredPermissions: ['INVENTORY_VIEW'],
  },
  {
    label: 'Customers & CRM',
    href: '/customers',
    icon: Users,
    ready: true,
    requiredPermissions: ['BILLING_CREATE'],
  },
  {
    label: 'Billing & POS',
    href: '/billing',
    icon: Receipt,
    ready: true,
    requiredPermissions: ['BILLING_CREATE'],
  },
  {
    label: 'Gold Purchase & Exchange',
    href: '/purchases',
    icon: Repeat,
    ready: true,
    requiredPermissions: ['BILLING_CREATE'],
  },
  {
    label: 'Gold SIP Schemes',
    href: '/schemes',
    icon: PiggyBank,
    ready: false,
    requiredPermissions: ['BILLING_CREATE'],
  },
  {
    label: 'Sales & Reports',
    href: '/reports',
    icon: BarChart3,
    ready: false,
    requiredPermissions: ['ACCOUNTS_VIEW'],
  },
  {
    label: 'Bank Reconciliation',
    href: '/reconciliation',
    icon: Scale,
    ready: true,
    requiredPermissions: ['ACCOUNTS_VIEW'],
  },
  {
    label: 'AI Sales Co-Pilot',
    href: '/ai-copilot',
    icon: Sparkles,
    ready: false,
    requiredPermissions: ['BILLING_CREATE'],
  },
  {
    label: 'Branches & Settings',
    href: '/settings',
    icon: Settings,
    ready: false,
    requiredPermissions: ['BRANCH_MANAGE', 'TENANT_MANAGE', 'STAFF_MANAGE'],
    requireAny: true,
  },
] as const;

/**
 * Filters the workspace navigation items based on the active user's verified role.
 * - If role has no permissions or is missing, returns only unconstrained items (e.g. Dashboard).
 * - If item has requiredPermissions, evaluates them against the declarative RBAC matrix.
 */
export function getPermittedNavItems(role?: string | null): readonly NavItemConfig[] {
  if (!role) {
    return WORKSPACE_NAV_ITEMS.filter((item) => !item.requiredPermissions || item.requiredPermissions.length === 0);
  }

  const typedRole = role as Role;

  return WORKSPACE_NAV_ITEMS.filter((item) => {
    if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
      return true;
    }

    if (item.requireAny) {
      return item.requiredPermissions.some((perm) => hasPermission(typedRole, perm));
    }

    return item.requiredPermissions.every((perm) => hasPermission(typedRole, perm));
  });
}

/**
 * Helper to determine whether a given role has authority to perform inventory mutations
 * (e.g. Add ornament, edit weights/pricing, transfer stock between showrooms).
 */
export function canManageInventory(role?: string | null): boolean {
  if (!role) return false;
  return hasPermission(role as Role, 'INVENTORY_MANAGE');
}

/**
 * Helper to determine whether a given role has authority to view sales and financial reports.
 */
export function canViewReports(role?: string | null): boolean {
  if (!role) return false;
  return hasPermission(role as Role, 'ACCOUNTS_VIEW');
}

/**
 * Helper to determine whether a given role has authority to view or configure branch settings.
 */
export function canManageSettings(role?: string | null): boolean {
  if (!role) return false;
  const typedRole = role as Role;
  return (
    hasPermission(typedRole, 'BRANCH_MANAGE') ||
    hasPermission(typedRole, 'TENANT_MANAGE') ||
    hasPermission(typedRole, 'STAFF_MANAGE')
  );
}
