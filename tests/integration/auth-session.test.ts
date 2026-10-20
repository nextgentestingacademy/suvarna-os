import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';

describe('Database-Backed Authentication & Session Lifecycle', () => {
  const TEST_EMAIL = 'owner@suvarna.test';
  // Use the development password established by the verified seed script
  const TEST_PASSWORD = 'SuvarnaDev2026!';

  it('1. successfully authenticates valid seeded credentials and issues a session cookie', async () => {
    const res = await auth.api.signInEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
      asResponse: true,
    });

    expect(res.status).toBe(200);
    const cookieHeader = res.headers.get('set-cookie');
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader).toContain('better-auth.session_token');

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.user.name).toBe('Anil Mehta (Owner)');
  });

  it('2. rejects invalid password with generic unauthorized error without issuing session', async () => {
    try {
      const res = await auth.api.signInEmail({
        body: {
          email: TEST_EMAIL,
          password: 'WrongPassword123!',
        },
        asResponse: true,
      });

      expect(res.status).toBe(401);
      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toBeFalsy();
    } catch (err: any) {
      expect(err.status || err.statusCode).toBe(401);
    }
  });

  it('3. rejects non-existent email with generic error to prevent account enumeration', async () => {
    try {
      const res = await auth.api.signInEmail({
        body: {
          email: 'nonexistent@suvarna.test',
          password: TEST_PASSWORD,
        },
        asResponse: true,
      });

      expect(res.status).toBe(401);
    } catch (err: any) {
      expect(err.status || err.statusCode).toBe(401);
    }
  });

  it('4. resolves authenticated server session from verified session cookie', async () => {
    // Sign in to acquire active session cookie
    const signInRes = await auth.api.signInEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
      asResponse: true,
    });
    const cookie = signInRes.headers.get('set-cookie')!;

    // Resolve session using server headers
    const sessionData = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });

    expect(sessionData).not.toBeNull();
    expect(sessionData?.user.email).toBe(TEST_EMAIL);
    expect(sessionData?.session.userId).toBe(sessionData?.user.id);
  });

  it('5. derives active business membership and branch permissions from session user', async () => {
    // Acquire session
    const signInRes = await auth.api.signInEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
      asResponse: true,
    });
    const cookie = signInRes.headers.get('set-cookie')!;
    const sessionData = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });

    expect(sessionData).not.toBeNull();

    // Derive security context
    const ctx = await resolveSecurityContext(prisma, {
      userId: sessionData!.user.id,
    });

    expect(ctx.role).toBe('OWNER');
    expect(ctx.tenantSlug).toBe('suvarna-mumbai');
    expect(ctx.allowedBranchIds.length).toBe(2);
  });

  it('6. invalidates session on logout and rejects subsequent requests', async () => {
    // 1. Sign in
    const signInRes = await auth.api.signInEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
      asResponse: true,
    });
    const cookie = signInRes.headers.get('set-cookie')!;

    // 2. Verify active session exists
    const activeSession = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(activeSession).not.toBeNull();
    const token = activeSession!.session.token;

    // 3. Sign out
    const signOutRes = await auth.api.signOut({
      headers: new Headers({ cookie }),
      asResponse: true,
    });
    expect(signOutRes.status).toBe(200);

    // 4. Verify getSession returns null with previous cookie
    const sessionAfterSignOut = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(sessionAfterSignOut).toBeNull();

    // 5. Verify database record is removed or invalidated
    const dbSession = await prisma.session.findUnique({
      where: { token },
    });
    expect(dbSession).toBeNull();
  });

  it('7. rejects unauthenticated requests with no cookie', async () => {
    const sessionData = await auth.api.getSession({
      headers: new Headers(),
    });
    expect(sessionData).toBeNull();
  });

  it('8. rejects expired sessions', async () => {
    // Query a test user
    const user = await prisma.user.findUnique({
      where: { email: TEST_EMAIL },
    });
    expect(user).not.toBeNull();

    // Create an artificially expired session record
    const expiredToken = `expired_token_${Date.now()}`;
    await prisma.session.create({
      data: {
        id: `expired_session_${Date.now()}`,
        userId: user!.id,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 1000 * 60), // Expired 1 minute ago
      },
    });

    // Attempt to resolve using expired cookie
    const expiredCookie = `better-auth.session_token=${expiredToken}`;
    const result = await auth.api.getSession({
      headers: new Headers({ cookie: expiredCookie }),
    });

    expect(result).toBeNull();

    // Cleanup expired test session
    await prisma.session.deleteMany({
      where: { token: expiredToken },
    });
  });

  it(
    '9. verifies manager and staff logins resolve their specific role permissions',
    async () => {
      const rolesToTest = [
      { email: 'manager@suvarna.test', expectedRole: 'MANAGER', branchCount: 1 },
      { email: 'accountant@suvarna.test', expectedRole: 'ACCOUNTANT', branchCount: 2 },
      { email: 'sales@suvarna.test', expectedRole: 'SALES_STAFF', branchCount: 1 },
    ];

    for (const testCase of rolesToTest) {
      const signInRes = await auth.api.signInEmail({
        body: {
          email: testCase.email,
          password: TEST_PASSWORD,
        },
        asResponse: true,
      });

      expect(signInRes.status).toBe(200);
      const cookie = signInRes.headers.get('set-cookie')!;
      const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });

      expect(session).not.toBeNull();
      const ctx = await resolveSecurityContext(prisma, {
        userId: session!.user.id,
      });

      expect(ctx.role).toBe(testCase.expectedRole);
      expect(ctx.allowedBranchIds.length).toBe(testCase.branchCount);

      // Clean up session
      await auth.api.signOut({
        headers: new Headers({ cookie }),
      });
    }
  }, 15000);
});
