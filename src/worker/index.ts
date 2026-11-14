/**
 * AivraSol Multi-Tenant Pharmacy Storefront — Cloudflare Worker Entry Point
 *
 * Modular Monolith Architecture (Section 3):
 * - `/api/v1/public/*` : Tenant-isolated public storefront runtime & catalog API
 * - `/api/v1/manage/*` : Authenticated Super Admin & Scoped Owner Portal management API
 * - `/api/v1/sync/*`   : Authenticated POS-to-Storefront catalog delta & Order Inbox API
 * - `/*`               : Cloudflare Workers Static Assets with lightweight crawler SEO metadata injection
 */

import { extractRequestHostname, resolveTenantByHostname } from "./domain-resolver";
import type { StorefrontWorkerEnv, WorkerExecutionContext } from "./env";
import { handleManageRoutes } from "./routes/manage-routes";
import { handlePublicRoutes } from "./routes/public-routes";
import { handleSyncRoutes } from "./routes/sync-routes";
import { buildResponseHeaders, checkRateLimit } from "./security";

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Lightweight Worker-side SEO metadata injection for public HTML responses (Section 13).
 * Ensures search crawlers and WhatsApp/social previews see pharmacy-specific titles,
 * canonical URLs, descriptions, and Product schema.org JSON-LD without SSR complexity.
 */
export async function injectStorefrontSeoMetadata(
  html: string,
  req: Request,
  env: StorefrontWorkerEnv
): Promise<string> {
  try {
    const url = new URL(req.url);
    const rawHost = extractRequestHostname(req, env);
    const ctx = await resolveTenantByHostname(env.DB, rawHost, env.PLATFORM_BASE_DOMAIN);
    if (!ctx.ok || !ctx.storefront) return html;

    const sf = ctx.storefront;
    const [settings, branding] = await Promise.all([
      env.DB.prepare(
        "SELECT seo_title, seo_description FROM storefront_settings WHERE storefront_id = ? LIMIT 1"
      )
        .bind(sf.id)
        .first<{ seo_title: string | null; seo_description: string | null }>(),
      env.DB.prepare(
        "SELECT display_name FROM storefront_branding WHERE storefront_id = ? LIMIT 1"
      )
        .bind(sf.id)
        .first<{ display_name: string | null }>(),
    ]);

    const brandName = (branding?.display_name && branding.display_name.trim()) || sf.pharmacy_name;

    let pageTitle =
      settings?.seo_title || `${brandName} — Online Pharmacy (${sf.city})`;
    let pageDesc =
      settings?.seo_description ||
      `Order medicines and healthcare essentials online from ${brandName} in ${sf.city}.`;
    const canonicalUrl = `https://${sf.primary_domain}${url.pathname === "/" ? "" : url.pathname}`;
    let jsonLd = "";

    // Check if this is a product detail URL (`/product/:slug`)
    const prodMatch = url.pathname.match(/^\/product\/([^/]+)$/);
    if (prodMatch) {
      const slug = decodeURIComponent(prodMatch[1]);
      const prod = await env.DB.prepare(
        `SELECT name, generic_name, strength, dosage_form, brand_name, public_description,
                public_selling_price_pkr, override_price_pkr, availability_status, primary_image_url
         FROM storefront_products
         WHERE storefront_id = ? AND pharmacy_id = ? AND publish_status = 'published'
           AND (slug = ? OR id = ?)
         LIMIT 1`
      )
        .bind(sf.id, sf.pharmacy_id, slug, slug)
        .first<Record<string, any>>();

      if (prod) {
        const effPrice =
          prod.override_price_pkr !== null && prod.override_price_pkr !== undefined
            ? Number(prod.override_price_pkr)
            : Number(prod.public_selling_price_pkr || 0);
        const cleanGeneric =
          prod.generic_name && prod.generic_name !== "00" ? ` (${prod.generic_name})` : "";
        pageTitle = `${prod.name} — ${brandName}`;
        pageDesc =
          prod.public_description ||
          `Order ${prod.name}${cleanGeneric} at PKR ${effPrice} from ${brandName}, ${sf.city}.`;
        const schemaObj = {
          "@context": "https://schema.org",
          "@type": "Product",
          name: prod.name,
          description: pageDesc,
          brand: prod.brand_name ? { "@type": "Brand", name: prod.brand_name } : undefined,
          offers: {
            "@type": "Offer",
            priceCurrency: "PKR",
            price: effPrice,
            availability:
              prod.availability_status === "in_stock" || prod.availability_status === "low_stock"
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            seller: {
              "@type": "Pharmacy",
              name: brandName,
            },
          },
        };
        jsonLd = `<script type="application/ld+json">${JSON.stringify(schemaObj)}</script>`;
      }
    }

    const seoTags = [
      `<title>${escapeHtmlAttr(pageTitle)}</title>`,
      `<meta name="description" content="${escapeHtmlAttr(pageDesc)}" />`,
      `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`,
      `<meta property="og:title" content="${escapeHtmlAttr(pageTitle)}" />`,
      `<meta property="og:description" content="${escapeHtmlAttr(pageDesc)}" />`,
      `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
      `<meta property="og:type" content="website" />`,
      jsonLd,
    ]
      .filter(Boolean)
      .join("\n    ");

    if (html.includes("<title>")) {
      return html.replace(/<title>.*?<\/title>/i, seoTags);
    }
    return html.replace("</head>", `    ${seoTags}\n  </head>`);
  } catch {
    return html;
  }
}

export async function handleWorkerRequest(
  req: Request,
  env: StorefrontWorkerEnv,
  execCtx?: WorkerExecutionContext
): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildResponseHeaders({ req, isPrivate: true }),
    });
  }

  // Forward top-level SEO sitemap & robots to public handler
  if (pathname === "/sitemap.xml" && req.method === "GET") {
    return await handlePublicRoutes(req, env, "/api/v1/public/sitemap.xml", execCtx);
  }
  if (pathname === "/robots.txt" && req.method === "GET") {
    return await handlePublicRoutes(req, env, "/api/v1/public/robots.txt", execCtx);
  }

  // Rate limiting per client IP + route group
  const clientIp =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1";

  if (pathname.startsWith("/api/")) {
    const bucketGroup = pathname.startsWith("/api/v1/sync/")
      ? "sync"
      : pathname.startsWith("/api/v1/manage/")
      ? "manage"
      : "public";
    const maxPerMinute = bucketGroup === "public" ? 240 : bucketGroup === "manage" ? 180 : 120;
    const rl = checkRateLimit(`${clientIp}:${bucketGroup}`, maxPerMinute, 60_000);
    if (!rl.allowed) {
      const headers = buildResponseHeaders({ req, isPrivate: true });
      headers.set("Retry-After", String(Math.ceil((rl.resetAtMs - Date.now()) / 1000)));
      return new Response(
        JSON.stringify({
          ok: false,
          error: "rate_limit_exceeded",
          message: "Too many requests. Please retry shortly.",
        }),
        { status: 429, headers }
      );
    }
  }

  try {
    if ((pathname === "/api/v1/health" || pathname === "/healthz") && req.method === "GET") {
      let d1Available = false;
      let r2Available = false;
      try {
        if (env.DB) {
          const probe = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
          d1Available = probe?.ok === 1;
        }
      } catch {
        d1Available = false;
      }
      try {
        if (env.MEDIA_BUCKET && typeof env.MEDIA_BUCKET.list === "function") {
          await env.MEDIA_BUCKET.list({ limit: 1 });
          r2Available = true;
        } else if (env.MEDIA_BUCKET) {
          r2Available = true;
        }
      } catch {
        r2Available = false;
      }
      return new Response(
        JSON.stringify({
          ok: true,
          service: "aivrasol-storefront-worker",
          version: "2.2.0",
          d1_available: d1Available,
          r2_available: r2Available,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: buildResponseHeaders({ req, isPrivate: true }) }
      );
    }

    if (pathname.startsWith("/api/v1/public/")) {
      return await handlePublicRoutes(req, env, pathname, execCtx);
    }

    if (pathname.startsWith("/api/v1/manage/")) {
      return await handleManageRoutes(req, env, pathname);
    }

    if (pathname.startsWith("/api/v1/sync/")) {
      return await handleSyncRoutes(req, env, pathname);
    }

    // Serve static frontend assets if bound in Cloudflare Workers Static Assets
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(req);
      const ct = assetRes.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const rawHtml = await assetRes.text();
        const seoHtml = await injectStorefrontSeoMetadata(rawHtml, req, env);
        const headers = new Headers(assetRes.headers);
        headers.set("Vary", "Host, Origin, X-Storefront-Host");
        headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
        return new Response(seoHtml, { status: assetRes.status, headers });
      }
      return assetRes;
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: "not_found",
        message: `Route ${pathname} not found.`,
      }),
      { status: 404, headers: buildResponseHeaders({ req, isPrivate: true }) }
    );
  } catch (err: any) {
    console.error("[StorefrontWorker] Unhandled error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "internal_server_error",
        message: "An unexpected error occurred while processing the storefront request.",
      }),
      { status: 500, headers: buildResponseHeaders({ req, isPrivate: true }) }
    );
  }
}

export default {
  async fetch(
    req: Request,
    env: StorefrontWorkerEnv,
    ctx?: WorkerExecutionContext
  ): Promise<Response> {
    return handleWorkerRequest(req, env, ctx);
  },
};
