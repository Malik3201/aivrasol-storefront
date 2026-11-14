/**
 * Cloudflare Worker Environment & D1 / R2 Binding Interfaces
 */

export interface D1Meta {
  duration: number;
  changes: number;
  last_row_id: number;
  rows_read: number;
  rows_written: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface R2ObjectBody {
  key: string;
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<{ key: string; size: number; etag: string }>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ key: string; size: number; etag: string } | null>;
  delete(key: string): Promise<void>;
  list?(options?: { limit?: number; prefix?: string }): Promise<{ objects: unknown[]; truncated?: boolean }>;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export interface StorefrontWorkerEnv {
  DB: D1Database;
  MEDIA_BUCKET?: R2Bucket;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  STOREFRONT_ADMIN_SECRET: string;
  STOREFRONT_SYNC_SECRET: string;
  PLATFORM_BASE_DOMAIN?: string;
  ALLOW_DEV_HOST_OVERRIDE?: string;
  PORTAL_INTERNAL_URL?: string;
}

