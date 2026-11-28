/**
 * Free-Tier-First Compact Daily Usage Tracker & Tenant Audit Logger (Sections 6, 8 & 14)
 */

import type { D1Database } from "./env";

export interface UsageIncrementInput {
  storefrontId: string;
  pharmacyId: string;
  publicRequests?: number;
  searchRequests?: number;
  syncRequests?: number;
  manageRequests?: number;
  d1RowsReadEst?: number;
  d1RowsWrittenEst?: number;
  r2BytesStoredDelta?: number;
  r2ClassAOps?: number;
  r2ClassBOps?: number;
  ordersCreated?: number;
}

export function getTodayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Extracts real SQLite row-read / row-written metrics from Cloudflare D1 response `meta` objects,
 * so daily usage tracking reflects actual D1 billing units rather than optimistic row-length guesses.
 */
export function sumD1MetaCounts(
  results: Array<{ meta?: { rows_read?: number; rows_written?: number } } | null | undefined>,
  fallback: { rowsRead?: number; rowsWritten?: number } = {}
): { rowsRead: number; rowsWritten: number } {
  let rowsRead = 0;
  let rowsWritten = 0;
  let hasRealMeta = false;
  for (const res of results) {
    const meta = res?.meta;
    if (meta && typeof meta === "object") {
      if (typeof meta.rows_read === "number" && Number.isFinite(meta.rows_read)) {
        rowsRead += Math.max(0, Math.round(meta.rows_read));
        hasRealMeta = true;
      }
      if (typeof meta.rows_written === "number" && Number.isFinite(meta.rows_written)) {
        rowsWritten += Math.max(0, Math.round(meta.rows_written));
        hasRealMeta = true;
      }
    }
  }
  if (!hasRealMeta) {
    return {
      rowsRead: Math.max(0, Math.round(fallback.rowsRead ?? 0)),
      rowsWritten: Math.max(0, Math.round(fallback.rowsWritten ?? 0)),
    };
  }
  return { rowsRead, rowsWritten };
}

interface BufferedUsageBucket {
  storefrontId: string;
  pharmacyId: string;
  syncRequests: number;
  d1RowsRead: number;
  lastFlushAt: number;
}

const pollUsageBuffer = new Map<string, BufferedUsageBucket>();
const POLL_USAGE_FLUSH_INTERVAL_MS = 180_000;
const POLL_USAGE_FLUSH_REQ_THRESHOLD = 40;

interface BufferedPublicUsageBucket {
  storefrontId: string;
  pharmacyId: string;
  publicRequests: number;
  searchRequests: number;
  d1RowsRead: number;
  lastFlushAt: number;
}

const publicUsageBuffer = new Map<string, BufferedPublicUsageBucket>();
// Flush the whole isolate buffer at most once per 15 minutes or every 500 buffered hits
// (whichever comes first). Counts accumulated in an isolate that is evicted before flushing are
// dropped — acceptable for approximate telemetry, and it keeps public D1 writes near zero.
const PUBLIC_USAGE_FLUSH_INTERVAL_MS = 15 * 60_000;
const PUBLIC_USAGE_FLUSH_REQ_THRESHOLD = 500;
let publicUsageBufferedHits = 0;
let publicUsageLastFlushAt = Date.now();
let publicUsageFlushInFlight: Promise<void> | null = null;

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void } | undefined | null;

/** Runs a background task without blocking the response (waitUntil when available). */
export function runInBackground(task: Promise<unknown>, execCtx?: WaitUntilCtx): void {
  const safe = task.catch(() => {});
  if (execCtx && typeof execCtx.waitUntil === "function") {
    try {
      execCtx.waitUntil(safe);
    } catch {
      // ignore — promise already has a catch handler
    }
  }
}

async function flushPublicUsageBuffer(db: D1Database): Promise<void> {
  if (publicUsageBuffer.size === 0) return;
  const buckets = Array.from(publicUsageBuffer.values());
  publicUsageBuffer.clear();
  for (const b of buckets) {
    await recordStorefrontUsage(db, {
      storefrontId: b.storefrontId,
      pharmacyId: b.pharmacyId,
      publicRequests: b.publicRequests,
      searchRequests: b.searchRequests,
      d1RowsReadEst: b.d1RowsRead,
      d1RowsWrittenEst: 1,
    });
  }
}

/**
 * Buffers high-volume public storefront telemetry in isolate memory. NEVER awaits D1 inside the
 * request: flushes run via `ctx.waitUntil` (or fire-and-forget) at most once per isolate per
 * 15 minutes or every 500 hits. The returned promise resolves immediately.
 */
export async function recordBufferedPublicUsage(
  db: D1Database,
  input: {
    storefrontId: string;
    pharmacyId: string;
    publicRequests?: number;
    searchRequests?: number;
    d1RowsRead?: number;
  },
  execCtx?: WaitUntilCtx
): Promise<void> {
  const key = `${input.storefrontId}:${input.pharmacyId}`;
  const now = Date.now();
  const existing = publicUsageBuffer.get(key) || {
    storefrontId: input.storefrontId,
    pharmacyId: input.pharmacyId,
    publicRequests: 0,
    searchRequests: 0,
    d1RowsRead: 0,
    lastFlushAt: now,
  };
  const hits = input.publicRequests ?? 1;
  existing.publicRequests += hits;
  existing.searchRequests += input.searchRequests ?? 0;
  existing.d1RowsRead += Math.max(0, Math.round(input.d1RowsRead ?? 0));
  publicUsageBuffer.set(key, existing);
  publicUsageBufferedHits += Math.max(1, hits);

  if (
    !publicUsageFlushInFlight &&
    (publicUsageBufferedHits >= PUBLIC_USAGE_FLUSH_REQ_THRESHOLD ||
      now - publicUsageLastFlushAt >= PUBLIC_USAGE_FLUSH_INTERVAL_MS)
  ) {
    publicUsageBufferedHits = 0;
    publicUsageLastFlushAt = now;
    const flush = flushPublicUsageBuffer(db).finally(() => {
      publicUsageFlushInFlight = null;
    });
    publicUsageFlushInFlight = flush;
    runInBackground(flush, execCtx);
  }
}

/**
 * Non-blocking variant of `recordStorefrontUsage` for request paths (orders etc.).
 */
export function recordStorefrontUsageDeferred(
  db: D1Database,
  input: UsageIncrementInput,
  execCtx?: WaitUntilCtx
): void {
  runInBackground(recordStorefrontUsage(db, input), execCtx);
}

/**
 * Buffers high-frequency poll telemetry in isolate memory and flushes to D1 at most once per minute
 * or every 15 requests — accurately capturing real D1 rows_read while consuming ~15x fewer D1 writes.
 */
export async function recordBufferedSyncPollUsage(
  db: D1Database,
  storefrontId: string,
  pharmacyId: string,
  d1RowsRead: number
): Promise<void> {
  const key = `${storefrontId}:${pharmacyId}`;
  const now = Date.now();
  const existing = pollUsageBuffer.get(key) || {
    storefrontId,
    pharmacyId,
    syncRequests: 0,
    d1RowsRead: 0,
    lastFlushAt: now,
  };
  existing.syncRequests += 1;
  existing.d1RowsRead += Math.max(0, Math.round(d1RowsRead));
  pollUsageBuffer.set(key, existing);

  if (
    existing.syncRequests >= POLL_USAGE_FLUSH_REQ_THRESHOLD ||
    now - existing.lastFlushAt >= POLL_USAGE_FLUSH_INTERVAL_MS
  ) {
    pollUsageBuffer.delete(key);
    await recordStorefrontUsage(db, {
      storefrontId: existing.storefrontId,
      pharmacyId: existing.pharmacyId,
      syncRequests: existing.syncRequests,
      d1RowsReadEst: existing.d1RowsRead,
      d1RowsWrittenEst: 1,
    });
  }
}

/**
 * Atomically increments the compact daily usage row for a tenant storefront.
 * Consumes only 1 D1 row write per call and keeps total storage bounded to 365 rows/year/pharmacy.
 */
export async function recordStorefrontUsage(
  db: D1Database,
  input: UsageIncrementInput
): Promise<void> {
  const usageDate = getTodayUtcDateString();
  const nowIso = new Date().toISOString();

  try {
    await db
      .prepare(
        `INSERT INTO storefront_usage_daily (
           storefront_id, pharmacy_id, usage_date,
           public_requests, search_requests, sync_requests, manage_requests,
           d1_rows_read_est, d1_rows_written_est,
           r2_bytes_stored, r2_class_a_ops, r2_class_b_ops, orders_created, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(storefront_id, usage_date) DO UPDATE SET
           public_requests = storefront_usage_daily.public_requests + excluded.public_requests,
           search_requests = storefront_usage_daily.search_requests + excluded.search_requests,
           sync_requests = storefront_usage_daily.sync_requests + excluded.sync_requests,
           manage_requests = storefront_usage_daily.manage_requests + excluded.manage_requests,
           d1_rows_read_est = storefront_usage_daily.d1_rows_read_est + excluded.d1_rows_read_est,
           d1_rows_written_est = storefront_usage_daily.d1_rows_written_est + excluded.d1_rows_written_est,
           r2_bytes_stored = MAX(0, storefront_usage_daily.r2_bytes_stored + excluded.r2_bytes_stored),
           r2_class_a_ops = storefront_usage_daily.r2_class_a_ops + excluded.r2_class_a_ops,
           r2_class_b_ops = storefront_usage_daily.r2_class_b_ops + excluded.r2_class_b_ops,
           orders_created = storefront_usage_daily.orders_created + excluded.orders_created,
           updated_at = excluded.updated_at`
      )
      .bind(
        input.storefrontId,
        input.pharmacyId,
        usageDate,
        input.publicRequests ?? 0,
        input.searchRequests ?? 0,
        input.syncRequests ?? 0,
        input.manageRequests ?? 0,
        input.d1RowsReadEst ?? 1,
        input.d1RowsWrittenEst ?? 1,
        input.r2BytesStoredDelta ?? 0,
        input.r2ClassAOps ?? 0,
        input.r2ClassBOps ?? 0,
        input.ordersCreated ?? 0,
        nowIso
      )
      .run();
  } catch {
    // Non-fatal: usage telemetry should never fail user requests
  }
}

export interface AuditLogInput {
  storefrontId: string;
  pharmacyId: string;
  action: string;
  actorType: "super_admin" | "portal_owner" | "portal_manager" | "pos_sync" | "system";
  actorId?: string | null;
  actorEmail?: string | null;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeStorefrontAuditLog(
  db: D1Database,
  input: AuditLogInput
): Promise<string> {
  const id = `sfa_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO storefront_audit_logs (
         id, storefront_id, pharmacy_id, action, actor_type, actor_id, actor_email,
         entity_type, entity_id, summary, metadata_json, ip_address, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.storefrontId,
      input.pharmacyId,
      input.action,
      input.actorType,
      input.actorId ?? null,
      input.actorEmail ?? null,
      input.entityType,
      input.entityId ?? null,
      input.summary,
      JSON.stringify(input.metadata ?? {}),
      input.ipAddress ?? null,
      nowIso
    )
    .run();
  return id;
}

