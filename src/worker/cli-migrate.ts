/**
 * CLI runner for D1 Local SQLite Migrations (`up` and `down`)
 */

import path from 'node:path';
import { LocalSqliteD1Database } from './d1-sqlite-adapter';
import { runStorefrontMigrationsDown, runStorefrontMigrationsUp } from './migrate';

async function main() {
  const direction = process.argv[2] || 'up';
  const dbPath =
    process.env.STOREFRONT_LOCAL_DB_PATH ||
    path.resolve(process.cwd(), '.local-d1', 'storefront.sqlite');
  const migrationsDir = path.resolve(process.cwd(), 'migrations');

  const db = new LocalSqliteD1Database(dbPath);
  try {
    if (direction === 'down') {
      const result = await runStorefrontMigrationsDown(db, migrationsDir);
      console.log(
        `[Storefront D1 Migrate DOWN] Reverted: ${result.reverted.join(', ') || 'none'} (${dbPath})`
      );
    } else {
      const result = await runStorefrontMigrationsUp(db, migrationsDir);
      console.log(
        `[Storefront D1 Migrate UP] Applied: ${result.applied.join(', ') || 'already up to date'} (${dbPath})`
      );
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[Storefront D1 Migrate Error]', err);
  process.exit(1);
});

