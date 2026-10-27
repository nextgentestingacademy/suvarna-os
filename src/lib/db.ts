import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Executes a database operation with automatic retry on transient pooler / network errors.
 * Especially resilient against serverless DB cold-starts (e.g. Neon waking from standby).
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  retries = 2,
  baseDelayMs = 350
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || '';
      const isTransient =
        msg.includes("Can't reach database server") ||
        msg.includes('Connection closed') ||
        msg.includes('connection timeout') ||
        msg.includes('P1001') ||
        err?.code === 'P1001' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET';

      if (!isTransient || attempt === retries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
