/**
 * Versioned & Reversible D1 Schema Migration Runner
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database } from "./env";

export const MIGRATION_0001_VERSION = "0001";
export const MIGRATION_0001_NAME = "0001_initial_storefront_schema";
export const MIGRATION_0002_VERSION = "0002";
export const MIGRATION_0002_NAME = "0002_milestone2_3_ordering_media_sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveMigrationsDir(customDir?: string): string {
  const candidates = [
    customDir,
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "../aivrasol-storefront/migrations"),
    path.resolve(__dirname, "../../migrations"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "0001_initial_storefront_schema.sql"))) {
      return dir;
    }
  }
  throw new Error("Could not locate storefront D1 migrations directory.");
}

export async function runStorefrontMigrationsUp(
  db: D1Database,
  customDir?: string
): Promise<{
  applied: string[];
  alreadyApplied: string[];
}> {
  const dir = resolveMigrationsDir(customDir);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS storefront_schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  const migrations = [
    {
      version: MIGRATION_0001_VERSION,
      name: MIGRATION_0001_NAME,
      file: "0001_initial_storefront_schema.sql",
    },
    {
      version: MIGRATION_0002_VERSION,
      name: MIGRATION_0002_NAME,
      file: "0002_milestone2_3_ordering_media_sync.sql",
    },
  ];

  for (const m of migrations) {
    const filePath = path.join(dir, m.file);
    if (!fs.existsSync(filePath)) continue;

    const existing = await db
      .prepare("SELECT version FROM storefront_schema_migrations WHERE version = ?")
      .bind(m.version)
      .first<{ version: string }>();

    if (existing) {
      alreadyApplied.push(m.version);
      continue;
    }

    const sql = fs.readFileSync(filePath, "utf8");
    // Execute statements safely (ignoring duplicate column errors if re-run partially)
    try {
      await db.exec(sql);
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (!msg.includes("duplicate column name")) {
        throw err;
      }
    }

    await db
      .prepare("INSERT INTO storefront_schema_migrations (version, name) VALUES (?, ?)")
      .bind(m.version, m.name)
      .run();

    applied.push(m.version);
  }

  return { applied, alreadyApplied };
}

export async function runStorefrontMigrationsDown(
  db: D1Database,
  customDir?: string
): Promise<{
  reverted: string[];
}> {
  const dir = resolveMigrationsDir(customDir);
  const downSql = fs.readFileSync(path.join(dir, "0001_initial_storefront_schema.down.sql"), "utf8");
  await db.exec(downSql);
  return { reverted: [MIGRATION_0001_VERSION, MIGRATION_0002_VERSION] };
}
