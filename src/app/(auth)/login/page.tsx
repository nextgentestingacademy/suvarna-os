import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Sign In — Suvarna Jewellery Business OS',
  description: 'Secure staff authentication for Suvarna Jeweller Workspace.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  let session = null;
  try {
    const reqHeaders = await headers();
    session = await auth.api.getSession({
      headers: reqHeaders,
    });
  } catch {
    // If checking existing session fails due to idle DB connection reset, proceed to login form
    session = null;
  }

  // If a valid server session already exists, redirect directly away from /login
  if (session?.user) {
    redirect('/dashboard');
  }

  const params = await searchParams;

  return <LoginForm returnTo={params.returnTo} errorParam={params.error} />;
}
