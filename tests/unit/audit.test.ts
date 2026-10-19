import { describe, it, expect } from 'vitest';
import { sanitizeAuditData } from '@/lib/audit';

describe('Audit Privacy & Redaction', () => {
  it('redacts sensitive passwords, tokens, secrets, and identity keys', () => {
    const rawData = {
      name: 'Pooja Verma',
      email: 'pooja@suvarna.test',
      password: 'PlaintextSuperSecret123!',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
      token: 'session_token_xyz987',
      secret: 'super_secret_key',
      otp: '482910',
      pan: 'ABCDE1234F',
      nested: {
        accessToken: 'oauth_bearer_123',
        branchName: 'Fort Main Showroom',
      },
    };

    const sanitized = sanitizeAuditData(rawData) as Record<string, unknown>;

    // Non-sensitive fields preserved
    expect(sanitized.name).toBe('Pooja Verma');
    expect(sanitized.email).toBe('pooja@suvarna.test');
    expect((sanitized.nested as Record<string, unknown>).branchName).toBe('Fort Main Showroom');

    // Sensitive fields redacted
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.passwordHash).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.secret).toBe('[REDACTED]');
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.pan).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).accessToken).toBe('[REDACTED]');
  });
});
