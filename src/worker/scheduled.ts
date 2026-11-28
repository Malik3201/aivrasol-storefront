/**
 * Daily Free-Tier Maintenance (Cloudflare Cron Trigger → `scheduled` handler)
 *
 * Prunes append-only operational tables so D1 storage and index sizes stay bounded.
 * Every DELETE is capped (`rowid IN (SELECT rowid ... LIMIT N)`) so a single run can never
 * blow the 100k rows-written/day free-tier budget; leftovers are pruned on subsequent days.
 *
 * Tables & retention:
 *   storefront_import_idempotency : expired (expires_at < now) OR created > 7 days ago
 *                                   (POS order-ack keys use 30d expiry → we honour expires_at
 *                                    first and only fall back to 7d for catalog sync keys)
 *   storefront_sync_events        : > 30 days
 *   storefront_sync_failures      : > 30 days
 *   storefront_audit_logs         : > 90 days (operational website audit trail only — POS financial
 *                                   records live in the POS database and are never touched here)
 *   storefront_usage_daily        : > 120 days
 */

import type { StorefrontWorkerEnv, WorkerExecutionContext } from "./env";

const MAX_ROWS_PER_TABLE_PER_RUN = 5000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

interface PruneResult {
  table: string;
  deleted: number;
  error?: string;
}

async function boundedDelete(
  env: StorefrontWorkerEnv,
  table: string,
  whereClause: string,
  params: unknown[]
): Promise<PruneResult> {
  try {
    const res = await env.DB.prepare(
      `DELETE FROM ${table}
       WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${whereClause} LIMIT ${MAX_ROWS_PER_TABLE_PER_RUN})`
    )
      .bind(...params)
      .run();
    return { table, deleted: Number(res?.meta?.changes || 0) };
  } catch (err: any) {
    return { table, deleted: 0, error: String(err?.message || err) };
  }
}

export async function runScheduledMaintenance(
  env: StorefrontWorkerEnv,
  ctx: WorkerExecutionContext
): Promise<void> {
  void ctx;
  if (!env?.DB) return;

  const nowIso = new Date().toISOString();
  const results: PruneResult[] = [];

  // Idempotency keys: honour explicit expiry; hard cap at 30 days for anything left behind
  // (POS order-ack keys are issued with a 30-day expiry, catalog-sync keys with 7 days).
  results.push(
    await boundedDelete(
      env,
      "storefront_import_idempotency",
      "expires_at < ? OR created_at < ?",
      [nowIso, isoDaysAgo(30)]
    )
  );
  // Catalog-sync keys are written with a 7-day expires_at, so they are pruned after 7 days by the
  // `expires_at < now` branch above; order-ack keys keep their intended 30-day replay window.

  results.push(
    await boundedDelete(env, "storefront_sync_events", "created_at < ?", [isoDaysAgo(30)])
  );
  results.push(
    await boundedDelete(env, "storefront_sync_failures", "created_at < ?", [isoDaysAgo(30)])
  );
  results.push(
    await boundedDelete(env, "storefront_audit_logs", "created_at < ?", [isoDaysAgo(90)])
  );
  results.push(
    await boundedDelete(env, "storefront_usage_daily", "usage_date < ?", [dateDaysAgo(120)])
  );

  const summary = results
    .map((r) => `${r.table}=${r.deleted}${r.error ? ` (err: ${r.error})` : ""}`)
    .join(", ");
  console.log(`[ScheduledMaintenance] ${nowIso} pruned: ${summary}`);
}
