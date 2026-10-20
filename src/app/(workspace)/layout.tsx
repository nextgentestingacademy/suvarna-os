import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import { WorkspaceShell } from '@/components/layout/workspace-shell';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  // 1. Enforce authenticated session on the server
  if (!session?.user) {
    redirect('/login');
  }

  // 2. Resolve verified business membership & role from database
  let securityContext;
  try {
    securityContext = await resolveSecurityContext(prisma, {
      userId: session.user.id,
      targetTenantId: session.session.activeOrganizationId || undefined,
    });
  } catch {
    // Redirect if no active membership or membership is suspended
    redirect('/login?error=membership_required');
  }

  return (
    <WorkspaceShell
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: securityContext.role,
        tenantSlug: securityContext.tenantSlug,
      }}
    >
      {children}
    </WorkspaceShell>
  );
}
