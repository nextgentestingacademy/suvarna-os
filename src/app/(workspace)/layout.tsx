import { redirect } from 'next/navigation';
import { getServerSecurityContext } from '@/lib/security-context';
import { WorkspaceShell } from '@/components/layout/workspace-shell';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let securityContext;
  try {
    securityContext = await getServerSecurityContext();
  } catch (err: any) {
    if (err?.code === 'UNAUTHENTICATED') {
      redirect('/login');
    }
    // Redirect if no active membership or membership is suspended / inactive
    redirect('/login?error=membership_required');
  }

  return (
    <WorkspaceShell
      user={{
        id: securityContext.userId,
        name: securityContext.userName || securityContext.userEmail.split('@')[0],
        email: securityContext.userEmail,
        role: securityContext.role,
        tenantSlug: securityContext.tenantSlug,
        tenantName: securityContext.tenantName,
      }}
      permittedBranches={securityContext.permittedBranches ? [...securityContext.permittedBranches] : []}
      initialActiveBranchId={securityContext.activeBranchId}
    >
      {children}
    </WorkspaceShell>
  );
}

