/**
 * Storefront Worker Security, Authentication, Rate Limiting & Cross-Tenant Cache Isolation
 */

import type { StorefrontWorkerEnv } from "./env";

export interface ManagementActor {
  actorType: "super_admin" | "portal_owner" | "portal_manager";
  actorId: string;
  actorEmail: string;
  /**
   * When actorType is 'portal_owner' or 'portal_manager', scopedPharmacyId is set
   * and strictly enforced so the user can ONLY access their own pharmacy's storefront.
   * For 'super_admin', scopedPharmacyId is null (platform-wide management authority).
   */
  scopedPharmacyId: string | null;
}

export interface SyncActor {
  storefrontId: string;
  pharmacyId: string;
  branchId: string;
  licenseId?: string;
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks on tokens/HMACs.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toBytes(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, toBytes(message) as unknown as BufferSource);
  return bytesToHex(new Uint8Array(sig));
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(message) as unknown as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Signs a short-lived Management or Portal Owner token for calling Worker `/api/v1/manage/*`.
 */
export async function signManagementToken(
  actor: ManagementActor,
  secret: string,
  ttlSeconds = 300
): Promise<string> {
  const payload = {
    t: actor.actorType,
    id: actor.actorId,
    em: actor.actorEmail,
    ph: actor.scopedPharmacyId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const bodyB64 = btoa(JSON.stringify(payload));
  const sig = await hmacSha256Hex(secret, bodyB64);
  return `sfm1.${bodyB64}.${sig}`;
}

/**
 * Verifies management request authorization.
 * Accepts either:
 * 1. Signed `sfm1.<payload>.<hmac>` token in `Authorization: Bearer ...` or `X-Storefront-Admin-Token`
 * 2. Direct `X-Storefront-Admin-Secret` + actor headers (server-to-server from Super Admin backend)
 */
export async function verifyManagementAuth(
  req: Request,
  env: StorefrontWorkerEnv
): Promise<{ actor: ManagementActor } | { error: string; status: 401 | 403 }> {
  const secret = env.STOREFRONT_ADMIN_SECRET;
  if (!secret || secret.length < 16) {
    return { error: "Server configuration error: STOREFRONT_ADMIN_SECRET not configured", status: 401 };
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const token = bearerToken || req.headers.get("x-storefront-admin-token") || "";

  if (token.startsWith("sfm1.")) {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { error: "Malformed management token", status: 401 };
    }
    const [, bodyB64, sig] = parts;
    const expectedSig = await hmacSha256Hex(secret, bodyB64);
    if (!timingSafeEqualStr(sig, expectedSig)) {
      return { error: "Invalid management token signature", status: 401 };
    }
    try {
      const decoded = JSON.parse(atob(bodyB64));
      if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
        return { error: "Management token expired", status: 401 };
      }
      return {
        actor: {
          actorType: decoded.t || "super_admin",
          actorId: String(decoded.id || "admin"),
          actorEmail: String(decoded.em || "admin@aivrasol.pk"),
          scopedPharmacyId: decoded.ph ? String(decoded.ph) : null,
        },
      };
    } catch {
      return { error: "Invalid management token payload", status: 401 };
    }
  }

  const directSecret = req.headers.get("x-storefront-admin-secret") || "";
  if (directSecret && timingSafeEqualStr(directSecret, secret)) {
    const roleHeader = req.headers.get("x-actor-type") || "super_admin";
    const scopedPharmacy = req.headers.get("x-scoped-pharmacy-id") || null;

    if (
      (roleHeader === "portal_owner" || roleHeader === "portal_manager") &&
      !scopedPharmacy
    ) {
      return { error: "Scoped pharmacy ID required for non-super-admin actor", status: 403 };
    }

    return {
      actor: {
        actorType: roleHeader as ManagementActor["actorType"],
        actorId: req.headers.get("x-actor-id") || "master-admin",
        actorEmail: req.headers.get("x-actor-email") || "admin@aivrasol.pk",
        scopedPharmacyId: scopedPharmacy,
      },
    };
  }

  return { error: "Unauthorized management request", status: 401 };
}

/**
 * Signs a scoped POS synchronization token for a specific tenant storefront.
 */
export async function signSyncToken(
  actor: SyncActor,
  secret: string,
  ttlSeconds = 3600
): Promise<string> {
  const payload = {
    sf: actor.storefrontId,
    ph: actor.pharmacyId,
    br: actor.branchId || "main",
    lic: actor.licenseId || undefined,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const bodyB64 = btoa(JSON.stringify(payload));
  const sig = await hmacSha256Hex(secret, bodyB64);
  return `sfs1.${bodyB64}.${sig}`;
}

export async function verifySyncToken(
  req: Request,
  env: StorefrontWorkerEnv
): Promise<{ actor: SyncActor } | { error: string; status: 401 | 403 }> {
  const secret = env.STOREFRONT_SYNC_SECRET || env.STOREFRONT_ADMIN_SECRET;
  if (!secret || secret.length < 16) {
    return { error: "Sync secret not configured", status: 401 };
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : req.headers.get("x-storefront-sync-token") || "";

  if (!token || !token.startsWith("sfs1.")) {
    return { error: "Missing or invalid sync token", status: 401 };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { error: "Malformed sync token", status: 401 };
  }
  const [, bodyB64, sig] = parts;
  const expectedSig = await hmacSha256Hex(secret, bodyB64);
  if (!timingSafeEqualStr(sig, expectedSig)) {
    return { error: "Invalid sync token signature", status: 401 };
  }

  try {
    const decoded = JSON.parse(atob(bodyB64));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return { error: "Sync token expired", status: 401 };
    }
    if (!decoded.sf || !decoded.ph) {
      return { error: "Sync token missing tenant claims", status: 403 };
    }
    return {
      actor: {
        storefrontId: String(decoded.sf),
        pharmacyId: String(decoded.ph),
        branchId: String(decoded.br || "main"),
        licenseId: decoded.lic ? String(decoded.lic) : undefined,
      },
    };
  } catch {
    return { error: "Invalid sync token payload", status: 401 };
  }
}

/**
 * Builds strict CORS & Cross-Tenant Cache Isolation headers.
 * Every public response includes `Vary: Host, Origin, X-Storefront-Host` and a tenant-scoped ETag
 * so CDN and browser caches never mix responses across pharmacy hostnames.
 */
export function buildResponseHeaders(options: {
  req: Request;
  storefrontId?: string;
  configVersion?: number;
  hostname?: string;
  cacheMaxAgeSec?: number;
  isPrivate?: boolean;
}): Headers {
  const origin = options.req.headers.get("origin") || "*";
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Vary": "Host, Origin, X-Storefront-Host",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Storefront-Admin-Token, X-Storefront-Admin-Secret, X-Storefront-Sync-Token, X-Storefront-Host, X-Actor-Type, X-Actor-Id, X-Actor-Email, X-Scoped-Pharmacy-Id",
  });

  if (options.storefrontId) {
    headers.set("X-Tenant-Storefront-Id", options.storefrontId);
    const v = options.configVersion ?? 1;
    const h = options.hostname || "default";
    headers.set("ETag", `W/"sf:${options.storefrontId}:v${v}:${h}"`);
  }

  if (options.isPrivate || !options.cacheMaxAgeSec) {
    headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  } else {
    headers.set(
      "Cache-Control",
      `public, max-age=${options.cacheMaxAgeSec}, s-maxage=${options.cacheMaxAgeSec * 2}, stale-while-revalidate=60`
    );
  }

  return headers;
}

// ============================================================================
// Lightweight In-Worker Sliding Window Rate Limiter (Zero External Dependency)
// ============================================================================

const rateBuckets = new Map<string, { count: number; resetAtMs: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAtMs: number } {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (v.resetAtMs <= now) rateBuckets.delete(k);
    }
  }

  const current = rateBuckets.get(key);
  if (!current || current.resetAtMs <= now) {
    const resetAtMs = now + windowMs;
    rateBuckets.set(key, { count: 1, resetAtMs });
    return { allowed: true, remaining: maxRequests - 1, resetAtMs };
  }

  if (current.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAtMs: current.resetAtMs };
  }

  current.count += 1;
  return { allowed: true, remaining: maxRequests - current.count, resetAtMs: current.resetAtMs };
}

