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
  Sparkles,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const demoPersonas = [
    { role: 'Owner', email: 'owner@suvarna.test', name: 'Anil Mehta' },
    { role: 'Store Manager', email: 'manager@suvarna.test', name: 'Pooja Verma' },
    { role: 'Accountant', email: 'accountant@suvarna.test', name: 'Ramesh Iyer' },
    { role: 'Sales Associate', email: 'sales@suvarna.test', name: 'Maya Patil' },
  ];

  const handleQuickFill = (personaEmail: string) => {
    setEmail(personaEmail);
    setPassword('SuvarnaDev2026!');
    setErrors({});
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim() || !email.includes('@')) {
      newErrors.email = 'Please enter a valid work email address.';
    }
    if (!password.trim() || password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setStatusMessage('Validating credentials against demo personas...');

    // Simulate realistic auth flow and transition to dashboard
    setTimeout(() => {
      setIsLoading(false);
      setStatusMessage('Authentication preview validated. Redirecting to Jeweller Workspace...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 700);
    }, 900);
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
          Sign in to your showroom workspace or test staff permissions
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white border border-[#eee2dc] py-8 px-6 shadow-sm rounded-2xl sm:px-10">
          {/* Demo Mode Notice */}
          <div className="mb-6 p-3 bg-[#fff0dc] border border-[#f1d394] rounded-xl text-xs text-[#73501b] space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[#d49a24]" />
              <span>UI Preview & Demonstration</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Live database credentials are not yet connected. You can test the interface with the fictional personas below or click <strong>Direct Showroom Access</strong>.
            </p>
          </div>

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
                  className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
              </div>
              {errors.email && (
                <span className="text-[10px] text-[#b93657] block mt-1">{errors.email}</span>
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
                  className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                />
              </div>
              {errors.password && (
                <span className="text-[10px] text-[#b93657] block mt-1">{errors.password}</span>
              )}
            </div>

            {statusMessage && (
              <div className="p-2.5 bg-[#e2f6e8] border border-[#a3e2bb] rounded-xl text-xs text-[#246743] font-medium text-center animate-in fade-in">
                {statusMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm disabled:opacity-70"
            >
              {isLoading ? (
                <span>Validating Session...</span>
              ) : (
                <>
                  <span>Sign In to Showroom</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Persona Fill */}
          <div className="mt-6 pt-5 border-t border-[#eee2dc]">
            <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block mb-2 text-center">
              Quick Fill Fictional Staff Persona
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {demoPersonas.map((p) => (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => handleQuickFill(p.email)}
                  className="p-2 bg-[#fffaf5] hover:bg-[#fff0dc] border border-[#eee2dc] rounded-xl text-left transition"
                >
                  <span className="font-bold text-[#542047] block text-[11px]">{p.role}</span>
                  <span className="text-[10px] text-[#68647a] block truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Direct Workspace Bypass Link */}
          <div className="mt-6 text-center">
            <Link
              href="/dashboard"
              className="text-xs font-bold text-[#d49a24] hover:underline"
            >
              Skip to Workspace Dashboard directly →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
