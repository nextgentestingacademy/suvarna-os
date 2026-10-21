'use client';

import React, { useState, createContext, useContext } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Store,
  ChevronDown,
  Menu,
  X,
  Bell,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { DEMO_BRANCHES, DEMO_RATES, DemoBranch } from '@/data/mock-workspace';
import { authClient } from '@/lib/auth-client';
import { switchActiveBranchAction } from '@/app/actions/workspace';
import { getPermittedNavItems } from '@/lib/navigation';

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantSlug: string;
  tenantName?: string;
}

export interface WorkspaceBranch {
  id: string;
  name: string;
  code: string;
  city: string;
  address?: string;
  addressLine1?: string | null;
  isMain?: boolean;
  isMainBranch?: boolean;
}

interface WorkspaceContextType {
  activeBranch: DemoBranch;
  setActiveBranch: (branch: DemoBranch) => void;
  user?: WorkspaceUser;
  availableBranches?: DemoBranch[];
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  activeBranch: DEMO_BRANCHES[0],
  setActiveBranch: () => {},
  availableBranches: DEMO_BRANCHES,
});

export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceShell({
  children,
  user,
  permittedBranches,
  initialActiveBranchId,
}: {
  children: React.ReactNode;
  user?: WorkspaceUser;
  permittedBranches?: readonly WorkspaceBranch[];
  initialActiveBranchId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Normalize available branches from verified database permissions or fallback to demo
  const branchesList: DemoBranch[] = (permittedBranches && permittedBranches.length > 0)
    ? permittedBranches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        city: b.city,
        address: b.addressLine1 || b.address || 'Showroom Address',
        isMain: b.isMainBranch ?? b.isMain ?? false,
      }))
    : DEMO_BRANCHES;

  const defaultBranch = branchesList.find((b) => b.id === initialActiveBranchId) || branchesList[0];
  const [activeBranch, setActiveBranch] = useState<DemoBranch>(defaultBranch);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleBranchSwitch = async (b: DemoBranch) => {
    if (b.id === activeBranch.id) {
      setIsBranchDropdownOpen(false);
      return;
    }

    setIsSwitchingBranch(true);
    showToast(`Switching active showroom to ${b.name}...`);
    try {
      const res = await switchActiveBranchAction(b.id);
      if (res.success) {
        setActiveBranch(b);
        setIsBranchDropdownOpen(false);
        showToast(`Active showroom switched to ${b.name}`);
        router.refresh();
      } else {
        showToast(res.error || 'Failed to switch active showroom');
      }
    } catch (err: any) {
      showToast(err.message || 'Error switching active showroom');
    } finally {
      setIsSwitchingBranch(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    showToast('Signing out of showroom session...');
    try {
      await authClient.signOut();
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  const formatRole = (role?: string) => {
    switch (role) {
      case 'OWNER': return 'Store Owner';
      case 'MANAGER': return 'Store Manager';
      case 'ACCOUNTANT': return 'Chartered Accountant';
      case 'SALES_STAFF': return 'Sales Staff';
      default: return role || 'Staff Member';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'AM';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const navItems = getPermittedNavItems(user?.role);

  return (
    <WorkspaceContext.Provider value={{ activeBranch, setActiveBranch, user, availableBranches: branchesList }}>
      <div className="min-h-screen flex flex-col bg-[#fff8f1] text-[#25203a]">
        {/* Top Demo Notice Ribbon */}
        <aside aria-label="Demo mode notice" className="bg-[#421b48] text-white px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#d49a24] text-[#25203a] font-bold rounded text-[10px] uppercase tracking-wider">
              DEMO PREVIEW
            </span>
            <span className="text-stone-200">
              Fictional jewellery records & indicative market rates. Browser actions do not save to a live database.
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#ffe8a8]">
            <span>24K: ₹{DEMO_RATES.gold24k.toLocaleString('en-IN')}/g</span>
            <span>22K: ₹{DEMO_RATES.gold22k.toLocaleString('en-IN')}/g</span>
            <span className="hidden sm:inline">Silver: ₹{DEMO_RATES.silver}/g</span>
          </div>
        </aside>

        {/* Top Application Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#eee2dc] px-4 lg:px-6 h-16 flex items-center justify-between shadow-xs">
          {/* Brand & Mobile Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-[#542047] hover:bg-[#fff0dc] transition"
              aria-label="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#542047] to-[#7b285e] flex items-center justify-center text-[#ffe8a8] font-serif font-bold text-xl shadow-xs">
                S
              </div>
              <div>
                <span className="font-serif font-bold text-lg text-[#542047] tracking-wider block leading-tight">
                  SUVARNA
                </span>
                <span className="text-[9px] tracking-widest text-[#68647a] block uppercase font-medium">
                  {user?.tenantName || 'Jewellery Business OS'}
                </span>
              </div>
            </Link>
          </div>

          {/* Showroom / Branch Selector */}
          <div className="relative">
            <button
              onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
              disabled={isSwitchingBranch}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#fffaf5] border border-[#eee2dc] hover:border-[#d49a24] rounded-xl text-xs font-medium text-[#542047] transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 text-[#d49a24]" />
              <div className="text-left hidden sm:block">
                <span className="text-[9px] text-[#68647a] block uppercase leading-none font-bold">
                  Active Showroom
                </span>
                <span className="font-bold">{activeBranch.name}</span>
              </div>
              <span className="sm:hidden font-bold">{activeBranch.code}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#68647a]" />
            </button>

            {isBranchDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white border border-[#eee2dc] rounded-xl shadow-xl z-50 p-1.5 animate-in fade-in slide-in-from-top-1">
                <div className="px-3 py-2 text-[10px] font-bold text-[#68647a] uppercase tracking-wider border-b border-[#eee2dc] flex items-center justify-between">
                  <span>Switch Showroom</span>
                  <span className="text-[9px] text-[#d49a24] font-semibold">{branchesList.length} permitted</span>
                </div>
                {branchesList.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleBranchSwitch(b)}
                    disabled={isSwitchingBranch}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition flex flex-col gap-0.5 cursor-pointer ${
                      activeBranch.id === b.id
                        ? 'bg-[#fff0dc] text-[#542047] font-bold border-l-4 border-[#d49a24]'
                        : 'hover:bg-[#fffaf5] text-[#25203a]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{b.name}</span>
                      {b.isMain && (
                        <span className="text-[9px] px-1.5 py-0.2 bg-[#e2f6e8] text-[#246743] rounded font-bold">
                          MAIN
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#68647a]">{b.city}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => showToast('Notifications are scheduled for production integration.')}
              className="p-2 rounded-xl text-[#68647a] hover:text-[#542047] hover:bg-[#fff0dc] transition"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              onClick={() => showToast('Online help desk and retailer documentation.')}
              className="p-2 rounded-xl text-[#68647a] hover:text-[#542047] hover:bg-[#fff0dc] transition hidden sm:inline-flex"
              title="Help"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Authenticated User Display + Sign Out Button */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#eee2dc]">
              <div
                className="w-8 h-8 rounded-full bg-[#f4ead5] text-[#542047] border border-[#d49a24]/40 flex items-center justify-center font-bold text-xs shrink-0"
                title={user?.email || 'Authenticated User'}
              >
                {getInitials(user?.name)}
              </div>
              <div className="hidden md:block text-left">
                <span className="text-xs font-bold text-[#542047] block leading-tight truncate max-w-[130px]">
                  {user?.name || 'Anil Mehta'}
                </span>
                <span className="text-[10px] text-[#68647a] block leading-none">
                  {formatRole(user?.role)}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="ml-1 p-2 rounded-xl text-[#68647a] hover:text-[#b93657] hover:bg-[#fff0dc] transition flex items-center gap-1.5 text-xs cursor-pointer disabled:opacity-50"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden xl:inline text-[11px] font-semibold">
                  {isSigningOut ? 'Signing Out...' : 'Sign Out'}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Body Layout: Sidebar + Main Content */}
        <div className="flex-1 flex min-h-[calc(100vh-8rem)]">
          {/* Sidebar */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-[#eee2dc] transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:block ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="h-full flex flex-col justify-between p-4">
              {/* Navigation Items */}
              <div className="space-y-1">
                <div className="px-3 py-1.5 text-[10px] font-bold text-[#68647a] uppercase tracking-wider">
                  Showroom Operations
                </div>
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                        isActive
                          ? 'bg-[#542047] text-white shadow-xs'
                          : 'text-[#68647a] hover:text-[#542047] hover:bg-[#fff0dc]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#ffe8a8]' : 'text-[#68647a]'}`} />
                        <span>{item.label}</span>
                      </div>
                      {!item.ready && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-tight ${
                          isActive ? 'bg-[#7b285e] text-[#ffe8a8]' : 'bg-[#fff0dc] text-[#73501b]'
                        }`}>
                          Soon
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Showroom Context Footer Card */}
              <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs">
                <span className="text-[10px] font-bold text-[#d49a24] uppercase tracking-wider block mb-1">
                  Connected Branch
                </span>
                <span className="font-bold text-[#542047] block">{activeBranch.name}</span>
                <span className="text-[11px] text-[#68647a] block mt-0.5">{activeBranch.address}</span>
                <div className="mt-2 pt-2 border-t border-[#eee2dc] flex items-center justify-between text-[10px] text-[#68647a]">
                  <span>GSTIN: 27AAAAA0000A1Z5</span>
                  <span className="text-[#246743] font-bold">● ONLINE</span>
                </div>
              </div>

              {/* Sidebar Sign Out Button */}
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full mt-2 py-2 px-3 bg-white hover:bg-[#fff0dc] border border-[#eee2dc] hover:border-[#d49a24] rounded-xl text-xs font-semibold text-[#68647a] hover:text-[#542047] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5 text-[#b93657]" />
                <span>{isSigningOut ? 'Signing out...' : 'Sign Out of Showroom'}</span>
              </button>
            </div>
          </aside>

          {/* Backdrop for mobile sidebar */}
          {isMobileMenuOpen && (
            <div
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/30 z-30 lg:hidden backdrop-blur-xs"
            />
          )}

          {/* Main Content Pane */}
          <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
            {children}
          </main>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-[#542047] text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs flex items-center gap-2 border border-[#d49a24] animate-in fade-in slide-in-from-bottom-2">
            <span className="w-2 h-2 rounded-full bg-[#d49a24]" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
