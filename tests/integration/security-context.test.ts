import { describe, it, expect, vi } from 'vitest';
import { resolveSecurityContext } from '@/lib/security-context';
import { AuthorizationError } from '@/types/security';
import { PrismaClient } from '@prisma/client';

describe('SecurityContext — Server-Side Tenancy & Branch Resolution', () => {
  const mockUser = {
    id: 'user-anil-owner',
    email: 'anil@suvarna.test',
  };

  const mockSuvarnaMember = {
    id: 'member-suvarna-1',
    organizationId: 'org-suvarna-mumbai',
    userId: 'user-anil-owner',
    role: 'OWNER',
    status: 'ACTIVE',
    organization: {
      id: 'org-suvarna-mumbai',
      name: 'Suvarna Jewellers Mumbai',
      slug: 'suvarna-mumbai',
    },
    branchAccess: [
      {
        id: 'acc-1',
        memberId: 'member-suvarna-1',
        branchId: 'branch-fort',
        isDefault: true,
        branch: { id: 'branch-fort', name: 'Fort Main Showroom', code: 'FORT' },
      },
    ],
  };

  function createMockPrisma(memberResult: unknown = mockSuvarnaMember) {
    return {
      user: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === mockUser.id) return Promise.resolve(mockUser);
          return Promise.resolve(null);
        }),
      },
      member: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          // If query specifies organizationId and it does not match, return null (simulate cross-tenant rejection)
          if (where.organizationId && where.organizationId !== 'org-suvarna-mumbai') {
            return Promise.resolve(null);
          }
          return Promise.resolve(memberResult);
        }),
      },
    } as unknown as PrismaClient;
  }

  it('rejects unauthenticated requests missing a userId', async () => {
    const prisma = createMockPrisma();
    await expect(
      resolveSecurityContext(prisma, { userId: '' })
    ).rejects.toThrow(AuthorizationError);
    await expect(
      resolveSecurityContext(prisma, { userId: '' })
    ).rejects.toThrow(/Authentication required/);
  });

  it('rejects requests for non-existent users', async () => {
    const prisma = createMockPrisma();
    await expect(
      resolveSecurityContext(prisma, { userId: 'non-existent-user-id' })
    ).rejects.toThrow(/User account not found/);
  });

  it('PREVENTS CROSS-TENANT ACCESS: rejects when client supplies a tenant ID the user is not a member of', async () => {
    const prisma = createMockPrisma();

    // User is a member of Suvarna, but request attempts to access Kalyan Jewellers ('org-kalyan-other')
    await expect(
      resolveSecurityContext(prisma, {
        userId: mockUser.id,
        targetTenantId: 'org-kalyan-other',
      })
    ).rejects.toThrow(AuthorizationError);

    await expect(
      resolveSecurityContext(prisma, {
        userId: mockUser.id,
        targetTenantId: 'org-kalyan-other',
      })
    ).rejects.toThrow(/You are not an active member of business 'org-kalyan-other'/);
  });

  it('PREVENTS CROSS-BRANCH ACCESS: rejects when user requests a branch outside permitted branches', async () => {
    const prisma = createMockPrisma();

    // User is only assigned to 'branch-fort', but attempts to scope to 'branch-vashi'
    await expect(
      resolveSecurityContext(prisma, {
        userId: mockUser.id,
        targetTenantId: 'org-suvarna-mumbai',
        targetBranchId: 'branch-vashi',
      })
    ).rejects.toThrow(/You do not have access to branch 'branch-vashi'/);
  });

  it('PREVENTS INACTIVE ACCESS: rejects when user membership is suspended or invited but not active', async () => {
    // Mock prisma returning null because status !== 'ACTIVE'
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(mockUser),
      },
      member: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          // Status filter in where clause prevents finding suspended members
          if (where.status === 'ACTIVE') {
            return Promise.resolve(null);
          }
          return Promise.resolve({ ...mockSuvarnaMember, status: 'SUSPENDED' });
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      resolveSecurityContext(prisma, {
        userId: mockUser.id,
        targetTenantId: 'org-suvarna-mumbai',
      })
    ).rejects.toThrow(AuthorizationError);

    await expect(
      resolveSecurityContext(prisma, {
        userId: mockUser.id,
        targetTenantId: 'org-suvarna-mumbai',
      })
    ).rejects.toThrow(/You are not an active member of business 'org-suvarna-mumbai'/);
  });

  it('resolves valid security context with verified claims from database', async () => {
    const prisma = createMockPrisma();

    const ctx = await resolveSecurityContext(prisma, {
      userId: mockUser.id,
      targetTenantId: 'org-suvarna-mumbai',
      targetBranchId: 'branch-fort',
    });

    expect(ctx.userId).toBe(mockUser.id);
    expect(ctx.tenantId).toBe('org-suvarna-mumbai');
    expect(ctx.tenantSlug).toBe('suvarna-mumbai');
    expect(ctx.role).toBe('OWNER');
    expect(ctx.activeBranchId).toBe('branch-fort');
    expect(ctx.allowedBranchIds).toEqual(['branch-fort']);
  });
});
