import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRateLimiter,
  extractBearerToken,
  isAllowedCorsOrigin,
  verifyFirebaseIdToken,
} from './security';

function signTestJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid = 'test-kid'
): string {
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${headerB64}.${payloadB64}`);
  signer.end();
  const sigB64 = signer.sign(privateKey).toString('base64url');
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

describe('server/security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('extractBearerToken', () => {
    it('extracts token from Bearer header and rejects invalid formats', () => {
      expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
      expect(extractBearerToken('Basic xyz')).toBeNull();
      expect(extractBearerToken('Bearer   ')).toBeNull();
      expect(extractBearerToken(undefined)).toBeNull();
    });
  });

  describe('isAllowedCorsOrigin', () => {
    it('allows official Firebase hosting domains and rejects unknown or null origins', () => {
      process.env.NODE_ENV = 'production';
      expect(isAllowedCorsOrigin('https://gen-lang-client-0625331922.web.app')).toBe(true);
      expect(isAllowedCorsOrigin('https://gen-lang-client-0625331922.firebaseapp.com')).toBe(true);
      expect(isAllowedCorsOrigin('https://evil.example.com')).toBe(false);
      expect(isAllowedCorsOrigin('https://attacker.run.app')).toBe(false);
      expect(isAllowedCorsOrigin('null')).toBe(false);
      expect(isAllowedCorsOrigin('http://localhost:3000')).toBe(false);
    });

    it('allows localhost only in non-production', () => {
      process.env.NODE_ENV = 'development';
      expect(isAllowedCorsOrigin('http://localhost:5173')).toBe(true);
      expect(isAllowedCorsOrigin('http://127.0.0.1:3000')).toBe(true);
      expect(isAllowedCorsOrigin('https://evil.example.com')).toBe(false);
    });
  });

  describe('createRateLimiter', () => {
    it('blocks requests exceeding maxRequests within windowMs', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2, keyPrefix: 'test' });
      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-1').allowed).toBe(true);
      const blocked = limiter.check('user-1');
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
      expect(limiter.check('user-2').allowed).toBe(true);
    });
  });

  describe('verifyFirebaseIdToken', () => {
    it('verifies a valid RS256 Firebase ID token and rejects expired or mismatched tokens', async () => {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ 'test-kid': publicPem }), {
          status: 200,
          headers: { 'cache-control': 'public, max-age=3600' },
        })
      );

      const nowSec = Math.floor(Date.now() / 1000);
      const validToken = signTestJwt(
        {
          aud: 'test-project',
          iss: 'https://securetoken.google.com/test-project',
          sub: 'uid-123',
          email: 'user@example.com',
          iat: nowSec - 10,
          exp: nowSec + 3600,
        },
        privateKey
      );

      const decoded = await verifyFirebaseIdToken(validToken, 'test-project');
      expect(decoded.uid).toBe('uid-123');
      expect(decoded.email).toBe('user@example.com');

      const expiredToken = signTestJwt(
        {
          aud: 'test-project',
          iss: 'https://securetoken.google.com/test-project',
          sub: 'uid-123',
          iat: nowSec - 7200,
          exp: nowSec - 10,
        },
        privateKey
      );
      await expect(verifyFirebaseIdToken(expiredToken, 'test-project')).rejects.toThrow(/expired/i);

      const wrongAudToken = signTestJwt(
        {
          aud: 'other-project',
          iss: 'https://securetoken.google.com/test-project',
          sub: 'uid-123',
          iat: nowSec - 10,
          exp: nowSec + 3600,
        },
        privateKey
      );
      await expect(verifyFirebaseIdToken(wrongAudToken, 'test-project')).rejects.toThrow(/audience/i);
    });
  });
});
