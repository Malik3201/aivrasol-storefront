/**
 * Cloudflare D1-compatible SQLite Adapter using Node.js built-in `node:sqlite` (DatabaseSync).
 *
 * Used for:
 * - Local Worker development & E2E verification without external paid cloud dependencies
 * - Automated Vitest / integration test suites
 * - Local Super Admin & Owner Portal integration when running on the same machine
 *
 * In Cloudflare production, the Worker binds directly to native Cloudflare D1 (`env.DB`).
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  D1Database,
  D1ExecResult,
  D1PreparedStatement,
  D1Result,
  R2Bucket,
  R2ObjectBody,
} from "./env";

class SqliteD1PreparedStatement implements D1PreparedStatement {
  private boundValues: unknown[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    const next = new SqliteD1PreparedStatement(this.db, this.query);
    next.boundValues = values.map((v) => {
      if (v === undefined) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    });
    return next;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const row = stmt.get(...(this.boundValues as any[])) as Record<string, unknown> | undefined;
    if (!row) return null;
    const plain = { ...row };
    if (colName !== undefined) {
      return (plain[colName] as T) ?? null;
    }
    return plain as unknown as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const start = performance.now();
    const stmt = this.db.prepare(this.query);
    const rawRows = stmt.all(...(this.boundValues as any[])) as Record<string, unknown>[];
    const results = rawRows.map((r) => ({ ...r })) as unknown as T[];
    const duration = performance.now() - start;
    return {
      results,
      success: true,
      meta: {
        duration,
        changes: 0,
        last_row_id: 0,
        rows_read: results.length || 1,
        rows_written: 0,
      },
    };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const start = performance.now();
    const stmt = this.db.prepare(this.query);
    const info = stmt.run(...(this.boundValues as any[]));
    const duration = performance.now() - start;
    const changes = Number(info.changes ?? 0);
    return {
      results: [],
      success: true,
      meta: {
        duration,
        changes,
        last_row_id: Number(info.lastInsertRowid ?? 0),
        rows_read: 0,
        rows_written: Math.max(1, changes),
      },
    };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const { results } = await this.all<Record<string, unknown>>();
    return results.map((r) => Object.values(r) as unknown as T);
  }
}

export class LocalSqliteD1Database implements D1Database {
  public readonly rawDb: DatabaseSync;

  constructor(filename: string = ":memory:") {
    if (filename !== ":memory:") {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    }
    this.rawDb = new DatabaseSync(filename);
    this.rawDb.exec("PRAGMA foreign_keys = ON;");
    this.rawDb.exec("PRAGMA busy_timeout = 5000;");
    if (filename !== ":memory:") {
      this.rawDb.exec("PRAGMA journal_mode = WAL;");
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.rawDb, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const out: D1Result<T>[] = [];
    this.rawDb.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      for (const stmt of statements) {
        const q = (stmt as unknown as { query?: string }).query || "";
        const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(q);
        if (isSelect) {
          out.push(await stmt.all<T>());
        } else {
          out.push(await stmt.run<T>());
        }
      }
      this.rawDb.exec("COMMIT;");
      return out;
    } catch (err) {
      try {
        this.rawDb.exec("ROLLBACK;");
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    const start = performance.now();
    this.rawDb.exec(query);
    const duration = performance.now() - start;
    return {
      count: query.split(";").filter((s) => s.trim().length > 0).length,
      duration,
    };
  }

  close(): void {
    this.rawDb.close();
  }
}

/**
 * In-memory R2 Bucket adapter for local development & tenant media isolation tests.
 */
export class LocalMemoryR2Bucket implements R2Bucket {
  private store = new Map<
    string,
    {
      bytes: Uint8Array;
      etag: string;
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    }
  >();

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<{ key: string; size: number; etag: string }> {
    let bytes: Uint8Array;
    if (typeof value === "string") {
      bytes = new TextEncoder().encode(value);
    } else if (value instanceof Uint8Array) {
      bytes = new Uint8Array(value);
    } else {
      bytes = new Uint8Array(value);
    }
    const etag = `etag_${bytes.byteLength}_${Date.now()}`;
    this.store.set(key, {
      bytes,
      etag,
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
    });
    return { key, size: bytes.byteLength, etag };
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      key,
      size: entry.bytes.byteLength,
      etag: entry.etag,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
      async arrayBuffer() {
        return entry.bytes.buffer.slice(
          entry.bytes.byteOffset,
          entry.bytes.byteOffset + entry.bytes.byteLength
        ) as ArrayBuffer;
      },
    };
  }

  async head(key: string): Promise<{ key: string; size: number; etag: string } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { key, size: entry.bytes.byteLength, etag: entry.etag };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Persistent Disk-Backed R2 Bucket adapter for local staging environments.
 * Stores real binary WebP payloads + HTTP/custom metadata sidecars on disk so
 * uploaded pharmacy logos, banners, and product photos persist across Worker restarts.
 */
export class LocalDiskR2Bucket implements R2Bucket {
  constructor(private readonly rootDir: string) {
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  private resolveSafePaths(key: string): { blobPath: string; metaPath: string } {
    const cleanKey = key
      .replace(/\\/g, "/")
      .split("/")
      .filter((seg) => seg && seg !== "." && seg !== "..")
      .join("/");
    const blobPath = path.join(this.rootDir, cleanKey);
    const metaPath = `${blobPath}.r2meta.json`;
    return { blobPath, metaPath };
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<{ key: string; size: number; etag: string }> {
    let bytes: Uint8Array;
    if (typeof value === "string") {
      bytes = new TextEncoder().encode(value);
    } else if (value instanceof Uint8Array) {
      bytes = new Uint8Array(value);
    } else {
      bytes = new Uint8Array(value);
    }
    const { blobPath, metaPath } = this.resolveSafePaths(key);
    fs.mkdirSync(path.dirname(blobPath), { recursive: true });
    fs.writeFileSync(blobPath, bytes);

    const etag = `etag_${bytes.byteLength}_${Date.now()}`;
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        key,
        size: bytes.byteLength,
        etag,
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
      }),
      "utf8"
    );
    return { key, size: bytes.byteLength, etag };
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const { blobPath, metaPath } = this.resolveSafePaths(key);
    if (!fs.existsSync(blobPath)) return null;
    const buf = fs.readFileSync(blobPath);
    let meta: any = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      } catch {
        meta = {};
      }
    }
    return {
      key,
      size: buf.byteLength,
      etag: meta.etag || `etag_${buf.byteLength}`,
      httpMetadata: meta.httpMetadata,
      customMetadata: meta.customMetadata,
      async arrayBuffer() {
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      },
    };
  }

  async head(key: string): Promise<{ key: string; size: number; etag: string } | null> {
    const { blobPath, metaPath } = this.resolveSafePaths(key);
    if (!fs.existsSync(blobPath)) return null;
    const stat = fs.statSync(blobPath);
    let etag = `etag_${stat.size}`;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        if (meta.etag) etag = meta.etag;
      } catch {
        // ignore
      }
    }
    return { key, size: stat.size, etag };
  }

  async delete(key: string): Promise<void> {
    const { blobPath, metaPath } = this.resolveSafePaths(key);
    if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  }
}
