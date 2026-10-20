'use server';

import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { getServerSecurityContext } from '@/lib/security-context';
import { recordAuditLog } from '@/lib/audit';
import { AuthorizationError, BranchInfo, Role } from '@/types/security';

export interface WorkspaceContextResult {
  userId: string;
  role: Role;
  tenantId: string;
  tenantName?: string;
  tenantSlug: string;
  activeBranchId?: string;
  permittedBranches: readonly BranchInfo[];
}

export interface ActionOptions {
  headers?: Headers;
}

/**
 * Server action to safely switch the user's active showroom branch.
 * NEVER trusts the requested branchId without database membership verification.
 */
export async function switchActiveBranchAction(
  targetBranchId: string,
  options?: ActionOptions
): Promise<{ success: boolean; activeBranchId?: string; error?: string }> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });

    // Verify requested branch is in user's permitted branch access list
    if (!ctx.allowedBranchIds.includes(targetBranchId)) {
      // Record access denial in audit log
      await recordAuditLog(prisma, ctx, {
        action: 'ACCESS_DENIED',
        entityType: 'Branch',
        entityId: targetBranchId,
        changedFields: {
          reason: 'Unauthorized branch switch attempt',
          attemptedBranchId: targetBranchId,
          allowedBranchIds: ctx.allowedBranchIds,
        },
      });

      return {
        success: false,
        error: `Access denied: You are not authorized to access branch '${targetBranchId}'.`,
      };
    }

    // Set verified active branch in httpOnly cookie when running in request context
    if (!options?.headers) {
      try {
        const { cookies: getCookies } = await import('next/headers');
        const cookieStore = await getCookies();
        cookieStore.set('suvarna_active_branch_id', targetBranchId, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
      } catch {
        // Ignored when outside Next.js request scope
      }
    }

    return {
      success: true,
      activeBranchId: targetBranchId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to switch active branch',
    };
  }
}

/**
 * Server action to safely switch the active business / organization.
 * Validates active membership in the target organization before switching.
 */
export async function switchActiveOrganizationAction(
  targetOrgId: string,
  options?: ActionOptions
): Promise<{ success: boolean; organizationId?: string; error?: string }> {
  try {
    let reqHeaders = options?.headers;
    if (!reqHeaders) {
      try {
        const { headers: getHeaders } = await import('next/headers');
        reqHeaders = await getHeaders();
      } catch {
        reqHeaders = new Headers();
      }
    }

    const session = await auth.api.getSession({ headers: reqHeaders });

    if (!session?.user) {
      return { success: false, error: 'Authentication required' };
    }

    // Verify active membership in the target organization
    const member = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: targetOrgId,
          userId: session.user.id,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!member || member.status !== 'ACTIVE') {
      return {
        success: false,
        error: `Access denied: You do not have an active membership in business '${targetOrgId}'.`,
      };
    }

    // Set active organization in Better Auth session
    await auth.api.setActiveOrganization({
      body: { organizationId: targetOrgId },
      headers: reqHeaders,
    });

    // Clear branch cookie so it resets to the new tenant's default showroom
    if (!options?.headers) {
      try {
        const { cookies: getCookies } = await import('next/headers');
        const cookieStore = await getCookies();
        cookieStore.delete('suvarna_active_branch_id');
      } catch {
        // Ignored when outside Next.js request scope
      }
    }

    return {
      success: true,
      organizationId: targetOrgId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to switch organization',
    };
  }
}

/**
 * Resolves verified workspace context for server components and actions.
 */
export async function getWorkspaceContextAction(): Promise<WorkspaceContextResult> {
  const ctx = await getServerSecurityContext();
  return {
    userId: ctx.userId,
    role: ctx.role,
    tenantId: ctx.tenantId,
    tenantName: ctx.tenantName,
    tenantSlug: ctx.tenantSlug,
    activeBranchId: ctx.activeBranchId,
    permittedBranches: ctx.permittedBranches ?? [],
  };
}
