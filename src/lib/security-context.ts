import { PrismaClient } from '@prisma/client';
import { SecurityContext, Role, Permission, BranchInfo, AuthorizationError } from '@/types/security';
import { prisma as defaultPrisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { assertPermission, assertBranchAccess } from '@/lib/rbac';

export interface ResolveContextParams {
  userId: string;
  targetTenantId?: string;
  targetBranchId?: string;
}

export interface GetServerSecurityContextOptions {
  targetTenantId?: string;
  targetBranchId?: string;
  requiredPermission?: Permission;
  headers?: Headers;
}

/**
 * Resolves a verified SecurityContext from database membership records.
 * NEVER trusts an unverified tenantId passed from the client.
 */
export async function resolveSecurityContext(
  prisma: PrismaClient,
  params: ResolveContextParams
): Promise<SecurityContext> {
  const { userId, targetTenantId, targetBranchId } = params;

  if (!userId) {
    throw new AuthorizationError('Authentication required: Missing user identity.', 'UNAUTHENTICATED');
  }

  // 1. Fetch user to verify active account
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new AuthorizationError('User account not found.', 'USER_NOT_FOUND');
  }

  // 2. Fetch active membership: either for the specific targetTenantId, or the user's primary/active membership
  const member = await prisma.member.findFirst({
    where: {
      userId: user.id,
      ...(targetTenantId ? { organizationId: targetTenantId } : {}),
      status: 'ACTIVE',
    },
    include: {
      organization: true,
      branchAccess: {
        include: {
          branch: true,
        },
      },
    },
  });

  if (!member) {
    throw new AuthorizationError(
      targetTenantId
        ? `Access denied: You are not an active member of business '${targetTenantId}'.`
        : 'Access denied: You do not have an active business membership.',
      'INVALID_TENANT_MEMBERSHIP'
    );
  }


  // 4. Extract permitted branch records and IDs
  const permittedBranches: BranchInfo[] = member.branchAccess
    .filter((ba) => ba.branch.isActive !== false)
    .map((ba) => ({
      id: ba.branch.id,
      name: ba.branch.name,
      code: ba.branch.code,
      city: ba.branch.city ?? '',
      addressLine1: ba.branch.addressLine1 ?? null,
      isMainBranch: ba.branch.isMainBranch ?? false,
    }));

  const allowedBranchIds = permittedBranches.map((b) => b.id);

  // 5. Validate active branch selection if provided
  let activeBranchId: string | undefined;
  if (targetBranchId) {
    if (!allowedBranchIds.includes(targetBranchId)) {
      throw new AuthorizationError(
        `Access denied: You do not have access to branch '${targetBranchId}' in ${member.organization.name}.`,
        'UNAUTHORIZED_BRANCH'
      );
    }
    activeBranchId = targetBranchId;
  } else {
    // Default to the branch flagged as default, or the first allowed branch
    const defaultBranchAccess = member.branchAccess.find(
      (b) => b.isDefault && allowedBranchIds.includes(b.branchId)
    );
    activeBranchId = defaultBranchAccess?.branchId ?? allowedBranchIds[0];
  }

  const activeBranch = permittedBranches.find((b) => b.id === activeBranchId);

  return {
    userId: user.id,
    userName: user.name ?? undefined,
    userEmail: user.email,
    tenantId: member.organizationId,
    tenantName: member.organization.name,
    tenantSlug: member.organization.slug,
    membershipId: member.id,
    role: member.role as Role,
    activeBranchId,
    activeBranch,
    allowedBranchIds,
    permittedBranches,
  };
}

/**
 * Resolves verified SecurityContext from authenticated Better Auth server session.
 * Enforces role permissions and branch access when requested.
 */
export async function getServerSecurityContext(
  options?: GetServerSecurityContextOptions
): Promise<SecurityContext> {
  let reqHeaders = options?.headers;
  let activeBranchCookie: string | undefined;

  if (!reqHeaders) {
    try {
      const { headers: getHeaders, cookies: getCookies } = await import('next/headers');
      reqHeaders = await getHeaders();
      const cookieStore = await getCookies();
      activeBranchCookie = cookieStore.get('suvarna_active_branch_id')?.value;
    } catch {
      reqHeaders = new Headers();
    }
  }

  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  if (!session?.user) {
    throw new AuthorizationError('Authentication required: No active session.', 'UNAUTHENTICATED');
  }

  const targetTenantId = options?.targetTenantId || session.session.activeOrganizationId || undefined;
  const targetBranchId = options?.targetBranchId || activeBranchCookie || undefined;

  let ctx: SecurityContext;
  try {
    ctx = await resolveSecurityContext(defaultPrisma, {
      userId: session.user.id,
      targetTenantId,
      targetBranchId,
    });
  } catch (err: any) {
    // If targetBranchId came from cookie and failed, fallback to default branch for this user
    if (activeBranchCookie && !options?.targetBranchId && err.code === 'UNAUTHORIZED_BRANCH') {
      ctx = await resolveSecurityContext(defaultPrisma, {
        userId: session.user.id,
        targetTenantId,
        targetBranchId: undefined,
      });
    } else {
      throw err;
    }
  }

  if (options?.requiredPermission) {
    assertPermission(ctx, options.requiredPermission);
  }

  if (options?.targetBranchId) {
    assertBranchAccess(ctx, options.targetBranchId);
  }

  return ctx;
}

