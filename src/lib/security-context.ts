import { PrismaClient } from '@prisma/client';
import { SecurityContext, Role, AuthorizationError } from '@/types/security';

export interface ResolveContextParams {
  userId: string;
  targetTenantId?: string;
  targetBranchId?: string;
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
    select: { id: true, email: true },
  });

  if (!user) {
    throw new AuthorizationError('User account not found.', 'USER_NOT_FOUND');
  }

  // 2. Fetch membership: either for the specific targetTenantId, or the user's primary/active membership
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

  // 3. Extract permitted branch IDs
  const allowedBranchIds = member.branchAccess.map((b) => b.branchId);

  // 4. Validate active branch selection if provided
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
    const defaultBranch = member.branchAccess.find((b) => b.isDefault);
    activeBranchId = defaultBranch?.branchId ?? allowedBranchIds[0];
  }

  return {
    userId: user.id,
    userEmail: user.email,
    tenantId: member.organizationId,
    tenantSlug: member.organization.slug,
    membershipId: member.id,
    role: member.role as Role,
    activeBranchId,
    allowedBranchIds,
  };
}
