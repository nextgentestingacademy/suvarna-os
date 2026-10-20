'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';

interface LoginFormProps {
  returnTo?: string;
  errorParam?: string;
}

const SEEDED_PERSONAS = [
  { role: 'Store Owner', email: 'owner@suvarna.test', name: 'Anil Mehta' },
  { role: 'Store Manager', email: 'manager@suvarna.test', name: 'Pooja Verma' },
  { role: 'Accountant', email: 'accountant@suvarna.test', name: 'Ramesh Iyer' },
  { role: 'Sales Staff', email: 'sales@suvarna.test', name: 'Maya Patil' },
];

/**
 * Validates a redirect target against open redirect attacks.
 * Only relative paths starting with a single '/' are permitted.
 */
function sanitizeRedirect(target?: string): string {
  if (!target) return '/dashboard';
  const trimmed = target.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    return trimmed;
  }
  return '/dashboard';
}

export function LoginForm({ returnTo, errorParam }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [authError, setAuthError] = useState<string | null>(
    errorParam === 'membership_required'
      ? 'Access denied: Your account does not have an active business membership.'
      : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleFillEmail = (personaEmail: string) => {
    setEmail(personaEmail);
    setFieldErrors({});
    setAuthError(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setStatusMessage(null);

    const errors: { email?: string; password?: string } = {};

    const emailTrimmed = email.trim();
    if (!emailTrimmed || !emailTrimmed.includes('@')) {
      errors.email = 'Please enter a valid work email address.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsLoading(true);
    setStatusMessage('Authenticating with showroom credentials...');

    try {
      const result = await authClient.signIn.email({
        email: emailTrimmed.toLowerCase(),
        password,
      });

      if (result.error) {
        setIsLoading(false);
        setStatusMessage(null);
        // Generic failure message to avoid account enumeration
        setAuthError(
          result.error.message ||
          'Invalid work email or password. Please verify your credentials and try again.'
        );
        return;
      }

      setStatusMessage('Session verified. Redirecting to workspace...');
      const destination = sanitizeRedirect(returnTo);

      // Transition to authorized workspace
      setTimeout(() => {
        router.push(destination);
        router.refresh();
      }, 400);

    } catch (err: unknown) {
      setIsLoading(false);
      setStatusMessage(null);
      setAuthError('Authentication service temporarily unavailable. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#fff8f1] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#542047] to-[#7b285e] flex items-center justify-center text-[#ffe8a8] font-serif font-bold text-2xl shadow-md border border-[#d49a24]/30">
            S
          </div>
        </Link>
        <h1 className="text-3xl font-serif font-bold text-[#542047] tracking-tight">
          SUVARNA
        </h1>
        <p className="text-xs uppercase tracking-widest text-[#d49a24] font-bold mt-0.5">
          Jewellery Business OS
        </p>
        <p className="mt-2 text-xs text-[#68647a]">
          Sign in to access your authorized jewellery showroom workspace
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white border border-[#eee2dc] py-8 px-6 shadow-sm rounded-2xl sm:px-10">
          
          {/* Security Banner */}
          <div className="mb-5 p-3 bg-[#fffaf5] border border-[#f1d394] rounded-xl text-xs text-[#73501b] flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#d49a24] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-[#542047] block">Secure Staff Authentication</span>
              <p className="text-[11px] text-[#68647a] leading-relaxed">
                Server-validated sessions and role-based branch authorization powered by Neon PostgreSQL.
              </p>
            </div>
          </div>

          {/* Form Error Banner */}
          {authError && (
            <div className="mb-4 p-3 bg-[#fdf2f2] border border-[#f8b4b4] rounded-xl text-xs text-[#9b1c1c] flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Form Success / Status Banner */}
          {statusMessage && (
            <div className="mb-4 p-3 bg-[#e2f6e8] border border-[#a3e2bb] rounded-xl text-xs text-[#246743] font-medium text-center animate-in fade-in">
              {statusMessage}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#25203a] mb-1">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#68647a] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="name@showroom.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a] disabled:opacity-60"
                />
              </div>
              {fieldErrors.email && (
                <span className="text-[10px] text-[#b93657] block mt-1">{fieldErrors.email}</span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#25203a] mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#68647a] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a] disabled:opacity-60"
                />
              </div>
              {fieldErrors.password && (
                <span className="text-[10px] text-[#b93657] block mt-1">{fieldErrors.password}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <span>Validating Session...</span>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Development Fictional Accounts Helper (Fills Email only, requires real password) */}
          <div className="mt-6 pt-5 border-t border-[#eee2dc]">
            <div className="flex items-center gap-1.5 mb-2 justify-center">
              <KeyRound className="w-3.5 h-3.5 text-[#d49a24]" />
              <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider">
                Development Test Personas
              </span>
            </div>
            <p className="text-[10px] text-[#68647a] text-center mb-2.5">
              Click to populate email address (requires development password):
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {SEEDED_PERSONAS.map((p) => (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => handleFillEmail(p.email)}
                  disabled={isLoading}
                  className="p-2 bg-[#fffaf5] hover:bg-[#fff0dc] border border-[#eee2dc] rounded-xl text-left transition disabled:opacity-50 cursor-pointer"
                >
                  <span className="font-bold text-[#542047] block text-[11px]">{p.role}</span>
                  <span className="text-[10px] text-[#68647a] block truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Return to Public Hub */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-xs text-[#68647a] hover:text-[#542047] transition underline"
            >
              ← Return to Suvarna Overview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
