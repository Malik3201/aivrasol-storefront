/**
 * Local Multi-Tenant Storefront Worker + Static Assets Server
 *
 * Simulates Cloudflare Workers + D1 + R2 + Static Assets locally on port 8787.
 * Supports hostname resolution via Host header, X-Storefront-Host header, or ?__host= query parameter.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalDiskR2Bucket, LocalSqliteD1Database } from './d1-sqlite-adapter';
import { runStorefrontMigrationsUp } from './migrate';
import { handleWorkerRequest, injectStorefrontSeoMetadata } from './index';
import type { StorefrontWorkerEnv } from './env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.STOREFRONT_PORT || 8787);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DB_PATH =
  process.env.STOREFRONT_LOCAL_DB_PATH ||
  path.join(ROOT_DIR, '.local-d1', 'storefront.sqlite');
const R2_DIR =
  process.env.STOREFRONT_LOCAL_R2_DIR ||
  path.join(ROOT_DIR, '.local-d1', 'r2-bucket');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'migrations');
const DIST_CLIENT_DIR = path.join(ROOT_DIR, 'dist', 'client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

async function startServer() {
  const db = new LocalSqliteD1Database(DB_PATH);
  const r2 = new LocalDiskR2Bucket(R2_DIR);

  const applied = await runStorefrontMigrationsUp(db, MIGRATIONS_DIR);
  if (applied.applied.length > 0) {
    console.log(`[Storefront Worker] Applied migrations: ${applied.applied.join(', ')}`);
  }

  const env: StorefrontWorkerEnv = {
    DB: db,
    MEDIA_BUCKET: r2,
    PLATFORM_BASE_DOMAIN: process.env.PLATFORM_BASE_DOMAIN || 'aivrasol.pk',
    ALLOW_DEV_HOST_OVERRIDE: 'true',
    STOREFRONT_ADMIN_SECRET:
      process.env.STOREFRONT_ADMIN_SECRET || 'aivrasol-storefront-dev-admin-secret-2026',
    STOREFRONT_SYNC_SECRET:
      process.env.STOREFRONT_SYNC_SECRET || 'aivrasol-storefront-dev-sync-secret-2026',
  };

  const server = http.createServer(async (req, res) => {
    try {
      const hostHeader = req.headers.host || `localhost:${PORT}`;
      const protocol = 'http';
      const fullUrl = new URL(req.url || '/', `${protocol}://${hostHeader}`);

      // Route API, health checks, and SEO sitemap/robots through the Cloudflare Worker fetch handler
      if (
        fullUrl.pathname.startsWith('/api/') ||
        fullUrl.pathname === '/healthz' ||
        fullUrl.pathname === '/sitemap.xml' ||
        fullUrl.pathname === '/robots.txt'
      ) {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else if (typeof value === 'string') {
            headers.set(key, value);
          }
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const bodyBuffer = Buffer.concat(chunks);

        const workerReq = new Request(fullUrl.toString(), {
          method: req.method || 'GET',
          headers,
          body:
            req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase()) && bodyBuffer.length > 0
              ? bodyBuffer
              : undefined,
        });

        const workerRes = await handleWorkerRequest(workerReq, env);
        res.statusCode = workerRes.status;
        workerRes.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });
        const arrayBuf = await workerRes.arrayBuffer();
        res.end(Buffer.from(arrayBuf));
        return;
      }

      // Serve static assets from dist/client (Cloudflare Workers Static Assets simulation)
      if (fs.existsSync(DIST_CLIENT_DIR)) {
        const safePath = path
          .normalize(decodeURIComponent(fullUrl.pathname))
          .replace(/^(\.\.(\/|\\|$))+/, '');
        const candidatePath = path.join(DIST_CLIENT_DIR, safePath);

        if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
          const ext = path.extname(candidatePath).toLowerCase();
          res.statusCode = 200;
          res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
          res.setHeader('Vary', 'Host, Origin, X-Storefront-Host');
          res.end(fs.readFileSync(candidatePath));
          return;
        }

        const indexHtmlPath = path.join(DIST_CLIENT_DIR, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
          const rawHtml = fs.readFileSync(indexHtmlPath, 'utf8');
          const reqHeaders = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') reqHeaders.set(k, v);
          }
          const seoReq = new Request(fullUrl.toString(), { method: 'GET', headers: reqHeaders });
          const seoHtml = await injectStorefrontSeoMetadata(rawHtml, seoReq, env);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Vary', 'Host, Origin, X-Storefront-Host');
          res.end(seoHtml);
          return;
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        `<!DOCTYPE html><html><body><p>Storefront Worker API running on port ${PORT}. Build client assets with vite build.</p></body></html>`
      );
    } catch (err) {
      console.error('[Storefront Dev Server Error]', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          error: 'internal_server_error',
          message: err instanceof Error ? err.message : 'Unexpected server error',
        })
      );
    }
  });

  server.listen(PORT, () => {
    console.log(`[AivraSol Storefront Worker] Listening on http://localhost:${PORT}`);
    console.log(`[AivraSol Storefront D1] Using SQLite file: ${DB_PATH}`);
  });
}

startServer().catch((err) => {
  console.error('[AivraSol Storefront Worker Startup Failed]', err);
  process.exit(1);
});
