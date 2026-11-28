/**
 * AivraSol Multi-Tenant Pharmacy Storefront — Cloudflare Worker Entry Point
 *
 * Modular Monolith Architecture (Section 3):
 * - `/api/v1/public/*` : Tenant-isolated public storefront runtime & catalog API
 * - `/api/v1/manage/*` : Authenticated Super Admin & Scoped Owner Portal management API
 * - `/api/v1/sync/*`   : Authenticated POS-to-Storefront catalog delta & Order Inbox API
 * - `/*`               : Cloudflare Workers Static Assets with lightweight crawler SEO metadata injection
 */

import {
  extractRequestHostname,
  resolveTenantBundleCached,
} from "./domain-resolver";
import { getCatalogSnapshotForTenant, findProductInSnapshot } from "./edge-cache-and-snapshots";
import type { StorefrontWorkerEnv, WorkerExecutionContext } from "./env";
import { handleManageRoutes } from "./routes/manage-routes";
import { handlePublicRoutes } from "./routes/public-routes";
import { handleSyncRoutes } from "./routes/sync-routes";
import { runScheduledMaintenance } from "./scheduled";
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
    const bundle = await resolveTenantBundleCached(env.DB, rawHost, env.PLATFORM_BASE_DOMAIN);
    const ctx = bundle.ctx;
    if (!ctx.ok || !ctx.storefront) return html;

    const sf = ctx.storefront;
    const settings = bundle.settings;
    const branding = bundle.branding;

    const brandName = (branding?.display_name && branding.display_name.trim()) || sf.pharmacy_name;
    const originUrl = `https://${sf.primary_domain}`;
    const subPath = url.pathname.replace(/^\/s\/[a-z0-9-]+/i, "") || "/";

    const toAbsMediaUrl = (raw?: string | null): string => {
      if (!raw) return `${originUrl}/media/storefront/hero-pharmacy-retail.webp`;
      if (/^https?:\/\//i.test(raw)) return raw;
      return `${originUrl}${raw.startsWith("/") ? raw : `/${raw}`}`;
    };

    const rawSeoTitle = settings?.seo_title?.trim();
    const hasStaleOwnerTitle =
      rawSeoTitle &&
      brandName.toLowerCase() !== "abdul rehman" &&
      /abdul\s*rehman/i.test(rawSeoTitle);

    let pageTitle =
      rawSeoTitle && !hasStaleOwnerTitle
        ? rawSeoTitle
        : `${brandName} — Online Pharmacy & Medicine Delivery in ${sf.city}`;
    let pageDesc =
      settings?.seo_description?.trim() ||
      `Order genuine counter-verified medicines, prescriptions, surgical items & healthcare essentials online from ${brandName} in ${sf.city}, Pakistan with fast doorstep delivery and counter pickup.`;
    let ogImage = toAbsMediaUrl(branding?.hero_banner_url || branding?.logo_url);
    let ogType = "website";
    const canonicalPath = subPath === "/" ? "" : subPath;
    const canonicalUrl = `${originUrl}${canonicalPath}`;

    const reviewAggregate = bundle.reviewSummary;

    const schemaGraph: Array<Record<string, unknown>> = [
      {
        "@type": ["Pharmacy", "MedicalBusiness", "LocalBusiness"],
        "@id": `${originUrl}/#pharmacy`,
        name: brandName,
        url: originUrl,
        description: pageDesc,
        image: toAbsMediaUrl(branding?.hero_banner_url),
        ...(branding?.logo_url ? { logo: toAbsMediaUrl(branding.logo_url) } : {}),
        ...(sf.contact_phone ? { telephone: sf.contact_phone } : {}),
        ...(sf.contact_email ? { email: sf.contact_email } : {}),
        ...(reviewAggregate
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: reviewAggregate.avg,
                reviewCount: reviewAggregate.count,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
        priceRange: "PKR",
        address: {
          "@type": "PostalAddress",
          ...(sf.address_line ? { streetAddress: sf.address_line } : {}),
          addressLocality: sf.city || "Lahore",
          addressCountry: sf.country || "PK",
        },
        ...(sf.latitude !== null &&
        sf.latitude !== undefined &&
        sf.longitude !== null &&
        sf.longitude !== undefined
          ? {
              geo: {
                "@type": "GeoCoordinates",
                latitude: Number(sf.latitude),
                longitude: Number(sf.longitude),
              },
            }
          : {}),
        areaServed: {
          "@type": "City",
          name: sf.city || "Lahore",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${originUrl}/#website`,
        url: originUrl,
        name: brandName,
        publisher: { "@id": `${originUrl}/#pharmacy` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${originUrl}/catalog?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ];

    // Catalog / Category Page Auto-SEO
    if (subPath === "/catalog" || subPath === "/shop") {
      const catParam = url.searchParams.get("category")?.trim();
      const qParam = url.searchParams.get("q")?.trim();
      if (catParam && catParam !== "all") {
        pageTitle = `${catParam} — Buy Online at ${brandName} (${sf.city})`;
        pageDesc = `Browse genuine ${catParam} products online from ${brandName} in ${sf.city}. Live pharmacy stock, transparent PKR pricing, and same-day local delivery.`;
      } else if (qParam) {
        pageTitle = `Search "${qParam}" — ${brandName} Online Pharmacy`;
      } else {
        pageTitle = `Medicines & Healthcare Catalog — ${brandName} (${sf.city})`;
        pageDesc = `Shop all counter-verified medicines, syrups, tablets, vitamins, and surgical supplies online from ${brandName} in ${sf.city}.`;
      }
      schemaGraph.push({
        "@type": "CollectionPage",
        name: pageTitle,
        description: pageDesc,
        url: canonicalUrl,
        isPartOf: { "@id": `${originUrl}/#website` },
      });
    }

    // Check if this is a product detail URL (`/product/:slug` or `/s/:store/product/:slug`)
    // Resolved 100% from R2 / Isolate RAM catalog snapshot (0 D1 reads!)
    const prodMatch = url.pathname.match(/^(?:\/s\/[a-z0-9-]+)?\/product\/([^/]+)$/i);
    if (prodMatch) {
      const slug = decodeURIComponent(prodMatch[1]);
      const { snapshot } = await getCatalogSnapshotForTenant(env, sf);
      const prod = findProductInSnapshot(snapshot, slug) as Record<string, any> | undefined;

      if (prod) {
        const effPrice =
          prod.override_price_pkr !== null && prod.override_price_pkr !== undefined
            ? Number(prod.override_price_pkr)
            : Number(prod.public_selling_price_pkr || 0);
        const cleanGeneric =
          prod.generic_name && prod.generic_name !== "00" && prod.generic_name !== "0"
            ? ` (${prod.generic_name})`
            : "";
        pageTitle = `${prod.name} Price in Pakistan — Buy at ${brandName} (${sf.city})`;
        pageDesc =
          prod.public_description ||
          `Buy ${prod.name}${cleanGeneric} online at PKR ${effPrice.toLocaleString()} from ${brandName}, ${sf.city}. Genuine counter-verified stock with doorstep delivery and pickup.`;
        ogType = "product";
        if (prod.primary_image_url) {
          ogImage = toAbsMediaUrl(prod.primary_image_url);
        }

        schemaGraph.push(
          {
            "@type": "Product",
            name: prod.name,
            description: pageDesc,
            ...(prod.primary_image_url ? { image: [toAbsMediaUrl(prod.primary_image_url)] } : {}),
            ...(prod.sku_code ? { sku: prod.sku_code } : {}),
            ...(prod.category_name ? { category: prod.category_name } : {}),
            ...(prod.brand_name ? { brand: { "@type": "Brand", name: prod.brand_name } } : {}),
            offers: {
              "@type": "Offer",
              url: canonicalUrl,
              priceCurrency: "PKR",
              price: effPrice,
              itemCondition: "https://schema.org/NewCondition",
              availability:
                prod.availability_status === "in_stock" || prod.availability_status === "low_stock"
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              seller: { "@id": `${originUrl}/#pharmacy` },
            },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: originUrl },
              { "@type": "ListItem", position: 2, name: "Catalog", item: `${originUrl}/catalog` },
              { "@type": "ListItem", position: 3, name: prod.name, item: canonicalUrl },
            ],
          }
        );
      }
    }

    const jsonLd = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": schemaGraph,
    })}</script>`;

    const faviconHref = branding?.favicon_url || branding?.logo_url;
    const seoTags = [
      `<title>${escapeHtmlAttr(pageTitle)}</title>`,
      `<meta name="description" content="${escapeHtmlAttr(pageDesc)}" />`,
      `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
      `<meta name="theme-color" content="#0A6B5C" />`,
      `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`,
      faviconHref ? `<link rel="icon" href="${escapeHtmlAttr(toAbsMediaUrl(faviconHref))}" />` : "",
      `<meta property="og:site_name" content="${escapeHtmlAttr(brandName)}" />`,
      `<meta property="og:locale" content="en_PK" />`,
      `<meta property="og:type" content="${escapeHtmlAttr(ogType)}" />`,
      `<meta property="og:title" content="${escapeHtmlAttr(pageTitle)}" />`,
      `<meta property="og:description" content="${escapeHtmlAttr(pageDesc)}" />`,
      `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
      `<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtmlAttr(pageTitle)}" />`,
      `<meta name="twitter:description" content="${escapeHtmlAttr(pageDesc)}" />`,
      `<meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />`,
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
    let rl = checkRateLimit(`${clientIp}:${bucketGroup}`, maxPerMinute, 60_000);
    // Tighter per-IP guard on checkout writes (each order costs ~10–15 D1 rows written).
    if (rl.allowed && req.method === "POST" && pathname === "/api/v1/public/orders") {
      rl = checkRateLimit(`${clientIp}:public-orders`, 10, 60_000);
    }
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
        // Free-tier: never call MEDIA_BUCKET.list() here (Class A op on every health ping).
        // A HEAD on a fixed key is a cheap Class B op and still proves the binding works.
        if (env.MEDIA_BUCKET && typeof (env.MEDIA_BUCKET as any).head === "function") {
          await (env.MEDIA_BUCKET as any).head("__healthcheck__");
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
      return await handleSyncRoutes(req, env, pathname, execCtx);
    }

    // Serve static frontend assets if bound in Cloudflare Workers Static Assets
    if (env.ASSETS) {
      // Free-tier: SEO-injected HTML is edge-cached per tenant + config_version + path so repeat
      // deep-link hits skip tenant resolution, catalog loading and HTML rewriting entirely.
      const htmlCache =
        req.method === "GET" && typeof caches !== "undefined"
          ? (caches as unknown as { default?: Cache }).default
          : undefined;
      let htmlCacheKey: Request | null = null;
      if (htmlCache) {
        try {
          const rawHost = extractRequestHostname(req, env);
          const bundle = await resolveTenantBundleCached(env.DB, rawHost, env.PLATFORM_BASE_DOMAIN);
          const sfRow = bundle.ctx.ok ? bundle.ctx.storefront : null;
          if (sfRow) {
            const keyUrl = new URL(req.url);
            keyUrl.searchParams.set("__html", "1");
            keyUrl.searchParams.set("__sf", sfRow.id);
            keyUrl.searchParams.set("__v", String(sfRow.config_version || 1));
            keyUrl.searchParams.set("__h", rawHost || "default");
            htmlCacheKey = new Request(keyUrl.toString(), { method: "GET" });
            const hit = await htmlCache.match(htmlCacheKey);
            if (hit) return hit;
          }
        } catch {
          htmlCacheKey = null;
        }
      }

      const assetRes = await env.ASSETS.fetch(req);
      const ct = assetRes.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const rawHtml = await assetRes.text();
        const seoHtml = await injectStorefrontSeoMetadata(rawHtml, req, env);
        const headers = new Headers(assetRes.headers);
        headers.set("Vary", "Host, Origin, X-Storefront-Host");
        // Browser revalidates every minute; the edge copy (below) lives 10 minutes and rotates on config_version.
        headers.set("Cache-Control", "public, max-age=60, must-revalidate");
        const htmlRes = new Response(seoHtml, { status: assetRes.status, headers });
        if (htmlCache && htmlCacheKey && assetRes.status === 200) {
          const storeHeaders = new Headers(headers);
          storeHeaders.set("Cache-Control", "public, max-age=600");
          const put = htmlCache
            .put(htmlCacheKey, new Response(seoHtml, { status: 200, headers: storeHeaders }))
            .catch(() => {});
          if (execCtx && typeof execCtx.waitUntil === "function") execCtx.waitUntil(put);
        }
        return htmlRes;
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
  // Daily maintenance (wrangler.toml [triggers] crons): bounded pruning of idempotency,
  // sync events, audit and usage rows so D1 storage and index sizes stay flat long-term.
  async scheduled(
    _event: unknown,
    env: StorefrontWorkerEnv,
    ctx: WorkerExecutionContext
  ): Promise<void> {
    const task = runScheduledMaintenance(env, ctx).catch((err) =>
      console.error("[StorefrontWorker] scheduled maintenance failed:", err)
    );
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(task);
    else await task;
  },
};
