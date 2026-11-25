import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'gen-lang-client-0625331922';

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

interface CertCacheEntry {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCacheEntry | null = null;

function parseMaxAgeMs(cacheControlHeader: string | null): number {
  if (!cacheControlHeader) return 3_600_000;
  const match = cacheControlHeader.match(/max-age=(\d+)/i);
  if (!match) return 3_600_000;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3_600_000;
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAtMs > now) {
    return certCache.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public certs (${res.status})`);
  }
  const certs = (await res.json()) as Record<string, string>;
  const maxAgeMs = parseMaxAgeMs(res.headers.get('cache-control'));
  certCache = { certs, expiresAtMs: now + maxAgeMs };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}

/**
 * Verifies a Firebase ID Token (RS256 JWT) against Google's public X.509 certificates.
 * Throws an Error if the token is malformed, expired, has an invalid signature, or mismatched claims.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string = FIREBASE_PROJECT_ID
): Promise<VerifiedFirebaseToken> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing Firebase ID token.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase ID token algorithm or missing kid.');
  }

  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Unknown Firebase ID token key ID.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signature = Buffer.from(signatureB64, 'base64url');
  if (!verifier.verify(certPem, signature)) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
  }>(payloadB64);

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase ID token expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 60) {
    throw new Error('Firebase ID token issued in the future.');
  }
  if (payload.aud !== projectId) {
    throw new Error('Firebase ID token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Firebase ID token issuer mismatch.');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
    throw new Error('Firebase ID token missing valid subject.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    aud: payload.aud,
    iss: payload.iss,
    exp: payload.exp,
    iat: payload.iat,
  };
}

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }
  try {
    const decoded = await verifyFirebaseIdToken(token);
    res.locals.firebaseUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = 'rl' } = options;
  const buckets = new Map<string, { count: number; resetAtMs: number }>();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (entry.resetAtMs <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 60_000));
  if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
  }

  function check(rawKey: string): RateLimitResult {
    const now = Date.now();
    const key = `${keyPrefix}:${rawKey}`;
    const existing = buckets.get(key);
    if (!existing || existing.resetAtMs <= now) {
      buckets.set(key, { count: 1, resetAtMs: now + windowMs });
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - 1),
        retryAfterSec: Math.ceil(windowMs / 1000),
      };
    }

    if (existing.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - existing.count),
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
    };
  }

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const user = res.locals.firebaseUser as VerifiedFirebaseToken | undefined;
    const key = user?.uid || req.ip || req.socket.remoteAddress || 'unknown';
    const result = check(key);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).json({
        error: 'تم تجاوز الحد المسموح للطلبات. يرجى المحاولة بعد قليل.',
        retryAfterSec: result.retryAfterSec,
      });
      return;
    }
    next();
  }

  return { check, middleware };
}

const DEFAULT_ALLOWED_ORIGINS = new Set<string>([
  'https://gen-lang-client-0625331922.web.app',
  'https://gen-lang-client-0625331922.firebaseapp.com',
]);

function getExtraAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGIN || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin || typeof origin !== 'string' || origin === 'null') {
    return false;
  }
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) {
    return true;
  }
  if (getExtraAllowedOrigins().includes(origin)) {
    return true;
  }
  const allowLocalhost =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_LOCALHOST_CORS === 'true';
  if (
    allowLocalhost &&
    (origin.startsWith('http://localhost:') ||
      origin === 'http://localhost' ||
      origin.startsWith('http://127.0.0.1:') ||
      origin === 'http://127.0.0.1' ||
      origin.startsWith('https://localhost:') ||
      origin === 'https://localhost')
  ) {
    return true;
  }
  return false;
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Cache-Control, x-user-uid, x-client-id'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  } else if (req.method === 'OPTIONS' && origin) {
    res.status(403).end();
    return;
  }

  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  // Keeps window.opener intact for Firebase Google OAuth signInWithPopup across Desktop & Mobile Chrome
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
}
