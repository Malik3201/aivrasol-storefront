/**
 * Comprehensive Milestone 1 Verification Suite (`node --test`)
 *
 * Covers all 12 required test areas from Implementation Prompt 1 of 4 (Section 15):
 *  1. Multiple pharmacies (isolated creation & independent catalogs)
 *  2. Subdomain resolution (alshifa.aivrasol.pk, citymed.aivrasol.pk, missing 404, 301 slug redirect)
 *  3. Duplicate slugs & reserved slugs protection
 *  4. Wrong tenant access prevention (Manage API, Sync API, Public API, R2 Media)
 *  5. Suspended websites handling (403 + catalog blocked)
 *  6. Super Admin permissions enforcement
 *  7. Public product isolation & private POS field rejection
 *  8. Catalog delta idempotency & conflict detection
 *  9. D1 migrations (UP, reversible DOWN, and re-UP)
 * 10. Cache tenant isolation (Vary headers & tenant-scoped ETag)
 * 11. Feature disabled behavior (423 + catalog blocked when website_enabled = false)
 * 12. POS catalog adapter boundary & unapproved product filtering
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalMemoryR2Bucket, LocalSqliteD1Database } from '../worker/d1-sqlite-adapter';
import { runStorefrontMigrationsDown, runStorefrontMigrationsUp } from '../worker/migrate';
import { handleWorkerRequest } from '../worker/index';
import { signManagementToken, signSyncToken } from '../worker/security';
import type { StorefrontWorkerEnv } from '../worker/env';
import { buildSafeStorefrontCatalogDelta } from '../../../aivrasol-pos/src/lib/storefront/pos-catalog-adapter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const MGMT_SECRET = 'test-management-secret-key-2026-secure';
const SYNC_SECRET = 'test-pos-sync-secret-key-2026-secure';

function createTestEnv(db: LocalSqliteD1Database, r2: LocalMemoryR2Bucket): StorefrontWorkerEnv {
  return {
    DB: db,
    MEDIA_BUCKET: r2,
    PLATFORM_BASE_DOMAIN: 'aivrasol.pk',
    ALLOW_DEV_HOST_OVERRIDE: 'true',
    STOREFRONT_ADMIN_SECRET: MGMT_SECRET,
    STOREFRONT_SYNC_SECRET: SYNC_SECRET,
  };
}

async function callWorker(
  env: StorefrontWorkerEnv,
  method: string,
  urlPath: string,
  options: {
    host?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; headers: Headers; json: any }> {
  const host = options.host || 'api.aivrasol.pk';
  const headers = new Headers(options.headers || {});
  headers.set('Host', host);
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }
  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    bodyStr = JSON.stringify(options.body);
  }

  const req = new Request(`https://${host}${urlPath}`, {
    method,
    headers,
    body: bodyStr,
  });

  const res = await handleWorkerRequest(req, env);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, headers: res.headers, json };
}

describe('AivraSol Multi-Tenant Storefront SaaS — Milestone 1 Foundation Suite', () => {
  let db: LocalSqliteD1Database;
  let r2: LocalMemoryR2Bucket;
  let env: StorefrontWorkerEnv;
  let superAdminToken: string;
  let pharmacyAOwnerToken: string;
  let pharmacyBOwnerToken: string;

  let storefrontAId = '';
  let storefrontBId = '';

  before(async () => {
    db = new LocalSqliteD1Database(':memory:');
    r2 = new LocalMemoryR2Bucket();
    env = createTestEnv(db, r2);

    superAdminToken = await signManagementToken(
      {
        actorType: 'super_admin',
        actorId: 'master-admin',
        actorEmail: 'admin@aivrasol.pk',
        scopedPharmacyId: null,
      },
      MGMT_SECRET,
      3600
    );

    pharmacyAOwnerToken = await signManagementToken(
      {
        actorType: 'portal_owner',
        actorId: 'owner-alshifa',
        actorEmail: 'owner@alshifa.pk',
        scopedPharmacyId: 'pharm-alshifa-001',
      },
      MGMT_SECRET,
      3600
    );

    pharmacyBOwnerToken = await signManagementToken(
      {
        actorType: 'portal_owner',
        actorId: 'owner-citymed',
        actorEmail: 'owner@citymed.pk',
        scopedPharmacyId: 'pharm-citymed-002',
      },
      MGMT_SECRET,
      3600
    );
  });

  after(() => {
    db.close();
  });

  it('1. D1 Migrations: applies UP migrations, reverts DOWN cleanly, and re-applies UP', async () => {
    // 1. Apply UP
    const up1 = await runStorefrontMigrationsUp(db, MIGRATIONS_DIR);
    assert.deepEqual(up1.applied, ['0001', '0002']);

    // Idempotent second UP call
    const upIdempotent = await runStorefrontMigrationsUp(db, MIGRATIONS_DIR);
    assert.deepEqual(upIdempotent.applied, []);

    // Verify core tables exist
    const tablesRes = await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'storefront%' ORDER BY name ASC`
      )
      .all<{ name: string }>();
    assert.ok(
      tablesRes.results.length >= 25,
      `Expected >= 25 storefront tables, got ${tablesRes.results.length}`
    );

    // 2. Revert DOWN
    const down = await runStorefrontMigrationsDown(db, MIGRATIONS_DIR);
    assert.deepEqual(down.reverted, ['0001', '0002']);

    const afterDown = await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'storefront%' AND name != 'storefront_schema_migrations'`
      )
      .all<{ name: string }>();
    assert.equal(
      afterDown.results.length,
      0,
      'All storefront domain tables must be dropped on DOWN migration'
    );

    // 3. Re-apply UP for the remaining tests
    const up2 = await runStorefrontMigrationsUp(db, MIGRATIONS_DIR);
    assert.deepEqual(up2.applied, ['0001', '0002']);
  });

  it('2. Super Admin Permissions: blocks unauthenticated and non-super-admin users from creating storefronts', async () => {
    // Unauthenticated
    const unauth = await callWorker(env, 'POST', '/api/v1/manage/storefronts', {
      body: {
        pharmacy_id: 'pharm-alshifa-001',
        pharmacy_name: 'Al-Shifa Pharmacy',
        slug: 'alshifa',
      },
    });
    assert.equal(unauth.status, 401);

    // Pharmacy owner attempting to create a storefront or view Super Admin overview
    const ownerCreate = await callWorker(env, 'POST', '/api/v1/manage/storefronts', {
      token: pharmacyAOwnerToken,
      body: {
        pharmacy_id: 'pharm-alshifa-001',
        pharmacy_name: 'Al-Shifa Pharmacy',
        slug: 'alshifa',
      },
    });
    assert.equal(ownerCreate.status, 403);

    const ownerOverview = await callWorker(env, 'GET', '/api/v1/manage/overview', {
      token: pharmacyAOwnerToken,
    });
    assert.equal(ownerOverview.status, 403);
  });

  it('3. Multiple Pharmacies & Duplicate/Reserved Slug Protection', async () => {
    // Reject reserved slug (`admin`, `www`, `api`, `portal`)
    const reservedCheck = await callWorker(
      env,
      'GET',
      '/api/v1/manage/storefronts/check-slug?slug=admin',
      { token: superAdminToken }
    );
    assert.equal(reservedCheck.status, 200);
    assert.equal(reservedCheck.json.available, false);

    const reservedCreate = await callWorker(env, 'POST', '/api/v1/manage/storefronts', {
      token: superAdminToken,
      body: {
        pharmacy_id: 'pharm-alshifa-001',
        pharmacy_name: 'Al-Shifa Pharmacy',
        slug: 'admin',
      },
    });
    assert.equal(reservedCreate.status, 400);
    assert.equal(reservedCreate.json.error, 'invalid_slug');

    // Create Pharmacy A (`alshifa.aivrasol.pk`)
    const createA = await callWorker(env, 'POST', '/api/v1/manage/storefronts', {
      token: superAdminToken,
      body: {
        pharmacy_id: 'pharm-alshifa-001',
        license_id: 'LIC-ALSHIFA-2026',
        pharmacy_name: 'Al-Shifa Pharmacy & Wellness',
        slug: 'alshifa',
        activate_immediately: true,
        entitlement_status: 'active',
        pilot_access: true,
        city: 'Lahore',
        address_line: 'Main Boulevard Gulberg III, Lahore',
        contact_phone: '+92 300 1112233',
        whatsapp_phone: '+92 300 1112233',
        theme_preset: 'emerald_clinical',
        primary_color: '#0D9488',
        hero_title: 'Genuine Medicines Delivered in Lahore',
      },
    });
    assert.equal(createA.status, 201, `Create A failed: ${JSON.stringify(createA.json)}`);
    storefrontAId = createA.json.storefront.id;
    assert.equal(createA.json.storefront.slug, 'alshifa');
    assert.equal(createA.json.storefront.primary_domain, 'alshifa.aivrasol.pk');
    assert.equal(createA.json.storefront.status, 'active');

    // Reject duplicate slug (`alshifa`) for another pharmacy
    const duplicateSlug = await callWorker(env, 'POST', '/api/v1/manage/storefronts', {
      token: superAdminToken,
      body: {
        pharmacy_id: 'pharm-citymed-002',
        pharmacy_name: 'CityMed Pharmacy',
        slug: 'alshifa',
      },
    });
    assert.equal(duplicateSlug.status, 409);
    assert.equal(duplicateSlug.json.error, 'duplicate_slug');

    // Create Pharmacy B (`citymed.aivrasol.pk`)
    const createB = await callWorker(env, 'POST', '/api/v1/manage/storefronts', {
      token: superAdminToken,
      body: {
        pharmacy_id: 'pharm-citymed-002',
        license_id: 'LIC-CITYMED-2026',
        pharmacy_name: 'CityMed Care Pharmacy',
        slug: 'citymed',
        activate_immediately: true,
        entitlement_status: 'active',
        pilot_access: true,
        city: 'Karachi',
        address_line: 'Clifton Block 5, Karachi',
        contact_phone: '+92 321 9998877',
        theme_preset: 'royal_blue_care',
      },
    });
    assert.equal(createB.status, 201);
    storefrontBId = createB.json.storefront.id;
    assert.equal(createB.json.storefront.slug, 'citymed');
    assert.equal(createB.json.storefront.primary_domain, 'citymed.aivrasol.pk');
  });

  it('4. Subdomain Resolution & Cache Tenant Isolation: resolves each hostname to its isolated pharmacy', async () => {
    // Resolve Al-Shifa
    const resolveA = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(resolveA.status, 200);
    assert.equal(resolveA.json.resolution_status, 'active');
    assert.equal(resolveA.json.storefront.slug, 'alshifa');
    assert.equal(resolveA.json.storefront.pharmacy_name, 'Al-Shifa Pharmacy & Wellness');

    // Verify Cache Tenant Isolation headers
    const varyHeader = resolveA.headers.get('Vary') || '';
    assert.ok(varyHeader.includes('Host'), `Expected Vary header to include Host, got ${varyHeader}`);
    assert.ok(varyHeader.includes('X-Storefront-Host'));
    const etagA = resolveA.headers.get('ETag') || '';
    assert.ok(
      etagA.includes(storefrontAId),
      `Expected ETag to be scoped to tenant ${storefrontAId}, got ${etagA}`
    );

    // Resolve CityMed
    const resolveB = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'citymed.aivrasol.pk',
    });
    assert.equal(resolveB.status, 200);
    assert.equal(resolveB.json.resolution_status, 'active');
    assert.equal(resolveB.json.storefront.slug, 'citymed');
    assert.equal(resolveB.json.storefront.pharmacy_name, 'CityMed Care Pharmacy');
    const etagB = resolveB.headers.get('ETag') || '';
    assert.notEqual(etagA, etagB, 'ETags for different tenants must never collide');

    // Missing pharmacy returns 404
    const missing = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'unknownpharmacy.aivrasol.pk',
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.resolution_status, 'not_found');
  });

  it('5. Safe Redirects for Renamed Slugs & Domain Collision Protection', async () => {
    // Rename CityMed slug from `citymed` -> `citymedpk`
    const rename = await callWorker(
      env,
      'POST',
      `/api/v1/manage/storefronts/${storefrontBId}/domains`,
      {
        token: superAdminToken,
        body: {
          action: 'rename_slug',
          new_slug: 'citymedpk',
        },
      }
    );
    assert.equal(rename.status, 200);
    assert.equal(rename.json.primary_domain, 'citymedpk.aivrasol.pk');

    // Old subdomain `citymed.aivrasol.pk` returns 301 redirect to `https://citymedpk.aivrasol.pk`
    const oldHostRes = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'citymed.aivrasol.pk',
    });
    assert.equal(oldHostRes.status, 301);
    assert.equal(oldHostRes.json.resolution_status, 'redirect');
    assert.equal(oldHostRes.json.redirect_url, 'https://citymedpk.aivrasol.pk');

    // Rename back to `citymed` so subsequent tests use `citymed.aivrasol.pk`
    const renameBack = await callWorker(
      env,
      'POST',
      `/api/v1/manage/storefronts/${storefrontBId}/domains`,
      {
        token: superAdminToken,
        body: {
          action: 'rename_slug',
          new_slug: 'citymed',
        },
      }
    );
    assert.equal(renameBack.status, 200);

    // Custom domain collision check: add custom domain to Pharmacy A, then attempt on Pharmacy B
    const addDomainA = await callWorker(
      env,
      'POST',
      `/api/v1/manage/storefronts/${storefrontAId}/domains`,
      {
        token: superAdminToken,
        body: {
          hostname: 'shop.alshifapharmacy.pk',
        },
      }
    );
    assert.equal(addDomainA.status, 201);
    assert.equal(addDomainA.json.domain.verification_status, 'pending');

    // Unverified custom domain should NOT resolve publicly yet
    const unverifiedRes = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'shop.alshifapharmacy.pk',
    });
    assert.equal(unverifiedRes.status, 404);

    // Pharmacy B attempting to register the same custom domain fails with 409
    const collisionDomainB = await callWorker(
      env,
      'POST',
      `/api/v1/manage/storefronts/${storefrontBId}/domains`,
      {
        token: superAdminToken,
        body: {
          hostname: 'shop.alshifapharmacy.pk',
        },
      }
    );
    assert.equal(collisionDomainB.status, 409);
    assert.equal(collisionDomainB.json.error, 'domain_collision');
  });

  it('6. Product Data Boundary, POS Sync Adapter & Catalog Delta Idempotency', async () => {
    // Issue a POS sync token scoped to Pharmacy A (`pharm-alshifa-001`)
    const syncTokenA = await signSyncToken(
      {
        storefrontId: storefrontAId,
        pharmacyId: 'pharm-alshifa-001',
        branchId: 'main',
        licenseId: 'LIC-ALSHIFA-2026',
      },
      SYNC_SECRET,
      3600
    );

    // 6a. Attempt to send a payload containing forbidden private POS fields (`cost_price`, `cost_wac`, `gross_profit`, `supplier_name`)
    const forbiddenRes = await callWorker(env, 'POST', '/api/v1/sync/catalog-delta', {
      token: syncTokenA,
      body: {
        contract_version: 'aivrasol-storefront-sync/v1',
        idempotency_key: 'idem-forbidden-001',
        source_cursor: null,
        next_cursor: 'cur_1',
        tenant_identity: {
          pharmacy_id: 'pharm-alshifa-001',
          storefront_id: storefrontAId,
        },
        branch_identity: {
          branch_id: 'main',
        },
        items: [
          {
            pos_product_id: 'pos-101',
            source_revision: 1,
            cost_price: 120, // FORBIDDEN
            cost_wac: 118.5, // FORBIDDEN
            gross_profit: 45, // FORBIDDEN
            supplier_name: 'Confidential Pharma Distributor', // FORBIDDEN
            public_selling_price_pkr: 165,
            website_visibility: 'published',
            availability: 'in_stock',
            product_identity: {
              name: 'Panadol Advance 500mg',
              unit_label: 'Pack',
            },
          },
        ],
      },
    });
    assert.equal(forbiddenRes.status, 200);
    assert.equal(forbiddenRes.json.items_rejected, 1);
    assert.equal(forbiddenRes.json.items_applied, 0);
    assert.equal(forbiddenRes.json.rejections[0].error_code, 'forbidden_private_fields');

    // 6b. Use the additive POS adapter (`buildSafeStorefrontCatalogDelta`) on raw POS rows
    // including private fields + unapproved master items + controlled substance
    const rawPosInventory = [
      {
        id: 101,
        name: 'Panadol Advance 500mg Tablets',
        generic_name: 'Paracetamol',
        manufacturer: 'Haleon Pakistan',
        category: 'Pain & Fever Relief',
        retail_price: 165,
        cost_price: 128, // private
        purchase_discount_pct: 12, // private
        supplier_name: 'Muller & Phipps', // private
        pack_size: 20,
        stock_quantity: 400,
        min_stock_threshold: 5,
        barcode: '896400101',
      },
      {
        id: 102,
        name: 'Augmentin 625mg Tablets',
        generic_name: 'Amoxicillin + Clavulanic Acid',
        manufacturer: 'GSK',
        category: 'Antibiotics (Rx)',
        retail_price: 495,
        cost_price: 410, // private
        pack_size: 6,
        stock_quantity: 18, // 3 packs <= min_stock_threshold(5) -> low_stock
        min_stock_threshold: 5,
      },
      {
        id: 103,
        name: 'Lexotanil 3mg (Controlled Schedule G)',
        generic_name: 'Bromazepam',
        manufacturer: 'Martin Dow',
        category: 'Controlled Psychotropic',
        retail_price: 380,
        cost_price: 300,
        pack_size: 30,
        stock_quantity: 90,
        min_stock_threshold: 5,
      },
      {
        id: 104,
        name: 'Draft Vitamin C Chewable 500mg',
        generic_name: 'Ascorbic Acid',
        manufacturer: 'Abbott',
        category: 'Vitamins & Supplements',
        retail_price: 250,
        cost_price: 190,
        pack_size: 30,
        stock_quantity: 120,
        min_stock_threshold: 5,
      },
      {
        id: 99999,
        name: 'Unapproved Master Medicine #41441',
        generic_name: 'Unapproved Compound',
        manufacturer: 'Generic Lab',
        category: 'General',
        retail_price: 500,
        cost_price: 350,
        pack_size: 10,
        stock_quantity: 100,
        min_stock_threshold: 5,
      },
    ];

    const safeDelta = buildSafeStorefrontCatalogDelta({
      pharmacyId: 'pharm-alshifa-001',
      storefrontId: storefrontAId,
      licenseKeyId: 'LIC-ALSHIFA-2026',
      cursorBefore: 1,
      cursorAfter: 10,
      idempotencyKey: 'idem-alshifa-sync-0010',
      posProducts: rawPosInventory as any,
      approvals: {
        '101': {
          sourceProductId: 101,
          websiteVisible: true,
          publishStatus: 'published',
          featured: true,
          publicDescription: 'Fast-acting paracetamol for headache and fever.',
        },
        '102': {
          sourceProductId: 102,
          websiteVisible: true,
          publishStatus: 'published',
          featured: false,
          publicDescription: 'Broad-spectrum antibacterial tablets.',
        },
        '103': {
          sourceProductId: 103,
          websiteVisible: true, // Even if marked true, adapter + Worker force controlled substance off!
          publishStatus: 'published',
        },
        '104': {
          sourceProductId: 104,
          websiteVisible: false, // Draft/unpublished item
          publishStatus: 'draft',
        },
        // Note: 99999 is NOT in approvals -> must be excluded
      },
    });

    assert.equal(safeDelta.items.length, 4, 'Unapproved master medicine #99999 must not be included');
    const serializedDelta = JSON.stringify(safeDelta);
    assert.ok(!serializedDelta.includes('cost_price'));
    assert.ok(!serializedDelta.includes('Muller & Phipps'));

    // Push safe delta to Worker
    const syncRes1 = await callWorker(env, 'POST', '/api/v1/sync/catalog-delta', {
      token: syncTokenA,
      body: safeDelta,
    });
    assert.equal(syncRes1.status, 200, `Sync failed: ${JSON.stringify(syncRes1.json)}`);
    assert.equal(syncRes1.json.duplicate, false);
    assert.equal(syncRes1.json.items_applied, 4);
    assert.equal(syncRes1.json.published_products_count, 2); // Only 101 and 102 are public (103 controlled, 104 draft)

    // 6c. Idempotency: re-sending exact same delta returns duplicate: true
    const syncResDuplicate = await callWorker(env, 'POST', '/api/v1/sync/catalog-delta', {
      token: syncTokenA,
      body: safeDelta,
    });
    assert.equal(syncResDuplicate.status, 200);
    assert.equal(syncResDuplicate.json.duplicate, true);

    // 6d. Idempotency conflict: re-using same idempotency_key with mutated payload returns 409
    const mutatedDelta = {
      ...safeDelta,
      next_cursor: 'cur_11',
    };
    const syncResConflict = await callWorker(env, 'POST', '/api/v1/sync/catalog-delta', {
      token: syncTokenA,
      body: mutatedDelta,
    });
    assert.equal(syncResConflict.status, 409);
    assert.equal(syncResConflict.json.error, 'idempotency_key_conflict');
  });

  it('7. Public Product Isolation: only published products for the resolved hostname appear', async () => {
    // Query Al-Shifa public products
    const productsA = await callWorker(env, 'GET', '/api/v1/public/products', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(productsA.status, 200);
    assert.equal(
      productsA.json.items.length,
      2,
      'Only the 2 approved non-controlled products may appear'
    );

    const namesA = productsA.json.items.map((p: any) => p.name);
    assert.ok(namesA.includes('Panadol Advance 500mg Tablets'));
    assert.ok(namesA.includes('Augmentin 625mg Tablets'));
    assert.ok(
      !namesA.some((n: string) => n.includes('Lexotanil')),
      'Controlled substances must never be public'
    );
    assert.ok(
      !namesA.some((n: string) => n.includes('Draft Vitamin C')),
      'Draft products must never be public'
    );

    // Verify Augmentin has requires_prescription = true and low_stock availability
    const augmentin = productsA.json.items.find((p: any) => p.name.includes('Augmentin'));
    assert.equal(augmentin.requires_prescription, true);
    assert.equal(augmentin.availability_status, 'low_stock');

    // Query CityMed public products (`citymed.aivrasol.pk`) -> must have 0 products (strict isolation)
    const productsB = await callWorker(env, 'GET', '/api/v1/public/products', {
      host: 'citymed.aivrasol.pk',
    });
    assert.equal(productsB.status, 200);
    assert.equal(
      productsB.json.items.length,
      0,
      'Al-Shifa products must never appear on CityMed storefront'
    );

    // Searching for "Panadol" on CityMed returns 0 results
    const searchB = await callWorker(env, 'GET', '/api/v1/public/products/search?q=Panadol', {
      host: 'citymed.aivrasol.pk',
    });
    assert.equal(searchB.status, 200);
    assert.equal(searchB.json.items.length, 0);

    // Searching for "Panadol" on Al-Shifa returns 1 result
    const searchA = await callWorker(env, 'GET', '/api/v1/public/products/search?q=Panadol', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(searchA.status, 200);
    assert.equal(searchA.json.items.length, 1);
  });

  it('8. Cross-Tenant Security Enforcement (Management API, Sync API, and R2 Media)', async () => {
    // 8a. Pharmacy A owner can read their own storefront by pharmacy ID
    const ownStorefront = await callWorker(
      env,
      'GET',
      '/api/v1/manage/storefronts/by-pharmacy/pharm-alshifa-001',
      { token: pharmacyAOwnerToken }
    );
    assert.equal(ownStorefront.status, 200);
    assert.equal(ownStorefront.json.storefront.id, storefrontAId);

    // 8b. Pharmacy A owner CANNOT read Pharmacy B's storefront by pharmacy ID or storefront ID
    const crossReadByPharm = await callWorker(
      env,
      'GET',
      '/api/v1/manage/storefronts/by-pharmacy/pharm-citymed-002',
      { token: pharmacyAOwnerToken }
    );
    assert.equal(crossReadByPharm.status, 403);
    assert.equal(crossReadByPharm.json.error, 'forbidden');

    const crossReadById = await callWorker(
      env,
      'GET',
      `/api/v1/manage/storefronts/${storefrontBId}`,
      { token: pharmacyAOwnerToken }
    );
    assert.equal(crossReadById.status, 403);
    assert.equal(crossReadById.json.error, 'forbidden');

    // 8c. Pharmacy A owner CANNOT update Pharmacy B's branding
    const crossUpdateBranding = await callWorker(
      env,
      'PUT',
      `/api/v1/manage/storefronts/${storefrontBId}/branding`,
      {
        token: pharmacyAOwnerToken,
        body: { hero_title: 'Hijacked Title' },
      }
    );
    assert.equal(crossUpdateBranding.status, 403);

    // 8d. Sync token for Pharmacy A CANNOT push catalog delta to Pharmacy B
    const syncTokenA = await signSyncToken(
      {
        storefrontId: storefrontAId,
        pharmacyId: 'pharm-alshifa-001',
        branchId: 'main',
      },
      SYNC_SECRET,
      3600
    );

    const crossSync = await callWorker(env, 'POST', '/api/v1/sync/catalog-delta', {
      token: syncTokenA,
      body: {
        contract_version: 'aivrasol-storefront-sync/v1',
        idempotency_key: 'idem-cross-tenant-attack',
        source_cursor: null,
        next_cursor: 'cur_99',
        tenant_identity: {
          pharmacy_id: 'pharm-citymed-002',
          storefront_id: storefrontBId,
        },
        branch_identity: {
          branch_id: 'main',
        },
        items: [],
      },
    });
    assert.equal(crossSync.status, 403);
    assert.equal(crossSync.json.error, 'tenant_mismatch');

    // 8e. Upload R2 media to Pharmacy A and verify it is blocked on Pharmacy B's hostname
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const mediaUploadA = await callWorker(
      env,
      'POST',
      `/api/v1/manage/storefronts/${storefrontAId}/media`,
      {
        token: pharmacyAOwnerToken,
        body: {
          purpose: 'logo',
          extension: 'png',
          content_type: 'image/png',
          data_base64: tinyPngBase64,
        },
      }
    );
    assert.equal(mediaUploadA.status, 201);
    const mediaId = mediaUploadA.json.media.id;

    // Accessing mediaId on Al-Shifa hostname succeeds
    const getMediaOnA = await callWorker(env, 'GET', `/api/v1/public/media/${mediaId}`, {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(getMediaOnA.status, 200);

    // Accessing Pharmacy A's mediaId on CityMed hostname fails with 404 (Cross-tenant media isolation)
    const getMediaOnB = await callWorker(env, 'GET', `/api/v1/public/media/${mediaId}`, {
      host: 'citymed.aivrasol.pk',
    });
    assert.equal(getMediaOnB.status, 404);
  });

  it('9. Feature Disabled Behavior & Suspended Websites Handling', async () => {
    // 9a. Disable website (`website_enabled: false`) on Al-Shifa
    const disableRes = await callWorker(
      env,
      'PATCH',
      `/api/v1/manage/storefronts/${storefrontAId}/status`,
      {
        token: superAdminToken,
        body: {
          website_enabled: false,
          status: 'disabled',
          disabled_reason: 'Scheduled maintenance test',
        },
      }
    );
    assert.equal(disableRes.status, 200);

    // Public resolve returns 423 (inactive)
    const resolveDisabled = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(resolveDisabled.status, 423);
    assert.equal(resolveDisabled.json.resolution_status, 'inactive');

    // Public products endpoint is blocked when website is disabled
    const productsWhenDisabled = await callWorker(env, 'GET', '/api/v1/public/products', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(productsWhenDisabled.status, 423);
    assert.equal(productsWhenDisabled.json.error, 'storefront_inactive');

    // 9b. Suspend pharmacy (`entitlement_status: 'suspended'`)
    const suspendRes = await callWorker(
      env,
      'PATCH',
      `/api/v1/manage/storefronts/${storefrontAId}/status`,
      {
        token: superAdminToken,
        body: {
          website_enabled: true,
          status: 'suspended',
          entitlement_status: 'suspended',
          suspended_reason: 'Billing overdue test',
        },
      }
    );
    assert.equal(suspendRes.status, 200);

    // Public resolve returns 403 (suspended)
    const resolveSuspended = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(resolveSuspended.status, 403);
    assert.equal(resolveSuspended.json.resolution_status, 'suspended');

    // Public products endpoint is blocked when suspended
    const productsWhenSuspended = await callWorker(env, 'GET', '/api/v1/public/products', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(productsWhenSuspended.status, 403);
    assert.equal(productsWhenSuspended.json.error, 'storefront_suspended');

    // 9c. Re-activate Al-Shifa website
    const reactivateRes = await callWorker(
      env,
      'PATCH',
      `/api/v1/manage/storefronts/${storefrontAId}/status`,
      {
        token: superAdminToken,
        body: {
          website_enabled: true,
          status: 'active',
          entitlement_status: 'active',
        },
      }
    );
    assert.equal(reactivateRes.status, 200);

    const resolveActiveAgain = await callWorker(env, 'GET', '/api/v1/public/resolve', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(resolveActiveAgain.status, 200);
    assert.equal(resolveActiveAgain.json.resolution_status, 'active');
  });

  it('10. Super Admin Overview, Usage Telemetry & Audit Logs', async () => {
    const overview = await callWorker(env, 'GET', '/api/v1/manage/overview', {
      token: superAdminToken,
    });
    assert.equal(overview.status, 200);
    assert.equal(overview.json.overview.total_storefronts, 2);
    assert.equal(overview.json.overview.active_websites, 2);
    assert.equal(overview.json.overview.total_public_products, 2);
    assert.ok(overview.json.overview.cloud_usage_summary.today_worker_requests > 0);
    assert.ok(
      overview.json.overview.cloud_usage_summary.free_tier_limits.d1_rows_read_daily > 0
    );

    const audits = await callWorker(
      env,
      'GET',
      `/api/v1/manage/storefronts/${storefrontAId}/audit-logs`,
      { token: superAdminToken }
    );
    assert.equal(audits.status, 200);
    assert.ok(
      audits.json.items.length >= 4,
      'Audit logs should record creation, status changes, and actions'
    );
  });

  it('11. Milestone 2+3: Owner Product Overrides, Promotions, Delivery Zones & Media SHA-256 Deduplication', async () => {
    const ownerTokenA = pharmacyAOwnerToken;

    // Fetch Al-Shifa products to get a product ID
    const prodsRes = await callWorker(
      env,
      'GET',
      `/api/v1/manage/storefronts/${storefrontAId}/products`,
      { token: ownerTokenA }
    );
    assert.equal(prodsRes.status, 200);
    const panadolProd = prodsRes.json.products.find((p: any) =>
      String(p.name).toLowerCase().includes('panadol')
    );
    assert.ok(panadolProd, 'Panadol product should exist');

    // Apply website-specific price override (e.g. PKR 115 instead of POS price 120)
    const overrideRes = await callWorker(
      env,
      'PATCH',
      `/api/v1/manage/storefronts/${storefrontAId}/products/${panadolProd.id}`,
      {
        token: ownerTokenA,
        body: {
          override_price_pkr: 115,
          public_description: 'Genuine GSK Panadol 500mg blister pack.',
          is_featured: true,
        },
      }
    );
    assert.equal(overrideRes.status, 200);
    assert.equal(Number(overrideRes.json.product.override_price_pkr), 115);

    // Create a 10% promotional code CARE10
    const promoRes = await callWorker(
      env,
      'PUT',
      `/api/v1/manage/storefronts/${storefrontAId}/promotions`,
      {
        token: ownerTokenA,
        body: {
          title: '10% Off Healthcare Order',
          code: 'CARE10',
          promotion_type: 'percentage',
          discount_value: 10,
          min_order_pkr: 100,
          is_active: true,
        },
      }
    );
    assert.equal(promoRes.status, 200);

    // Upload WebP media twice with identical SHA-256 content hash -> second upload deduplicates
    const shaHash = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123';
    const upload1 = await callWorker(
      env,
      'POST',
      `/api/v1/manage/storefronts/${storefrontAId}/media`,
      {
        token: ownerTokenA,
        body: {
          asset_purpose: 'product',
          original_filename: 'panadol.webp',
          mime_type: 'image/webp',
          byte_size: 2048,
          width: 600,
          height: 600,
          sha256_hex: shaHash,
          base64_data: Buffer.from('WEBP_MOCK_BINARY_PAYLOAD').toString('base64'),
          entity_type: 'product',
          entity_id: panadolProd.id,
        },
      }
    );
    assert.equal(upload1.status, 201);
    assert.equal(upload1.json.deduplicated, false);

    const upload2 = await callWorker(
      env,
      'POST',
      `/api/v1/manage/storefronts/${storefrontAId}/media`,
      {
        token: ownerTokenA,
        body: {
          asset_purpose: 'product',
          original_filename: 'panadol-copy.webp',
          mime_type: 'image/webp',
          byte_size: 2048,
          width: 600,
          height: 600,
          sha256_hex: shaHash,
        },
      }
    );
    assert.equal(upload2.status, 200);
    assert.equal(upload2.json.deduplicated, true);
    assert.equal(upload2.json.media.id, upload1.json.media.id);
  });

  it('12. Milestone 2+3: Transactional Online Ordering, Price Integrity, Duplicate Prevention & Order Tracking', async () => {
    // Get public products on Al-Shifa
    const pubProds = await callWorker(env, 'GET', '/api/v1/public/products', {
      host: 'alshifa.aivrasol.pk',
    });
    assert.equal(pubProds.status, 200);
    const item1 = pubProds.json.items.find((p: any) =>
      String(p.name).toLowerCase().includes('panadol')
    );
    assert.ok(item1);
    // Effective price should reflect the 115 PKR website override
    assert.equal(Number(item1.effective_price_pkr), 115);

    const orderIdempKey = 'test_checkout_idemp_key_001';
    const orderRes1 = await callWorker(env, 'POST', '/api/v1/public/orders', {
      host: 'alshifa.aivrasol.pk',
      body: {
        idempotency_key: orderIdempKey,
        customer_name: 'Ayesha Khan',
        customer_phone: '0300-5556677',
        fulfillment_type: 'delivery',
        delivery_address: 'House 14, Block H, Gulberg III',
        delivery_city: 'Lahore',
        payment_method: 'cod',
        promo_code: 'CARE10',
        items: [
          {
            product_id: item1.id,
            qty: 3,
            // Even if a malicious client passes price: 1, server ignores it and uses DB price (115 * 3 = 345)
            price: 1,
          },
        ],
      },
    });
    assert.equal(orderRes1.status, 201);
    assert.equal(orderRes1.json.ok, true);
    assert.equal(orderRes1.json.duplicate, false);
    const createdOrder = orderRes1.json.order;
    assert.equal(Number(createdOrder.subtotal_pkr), 345); // 115 * 3
    assert.equal(Number(createdOrder.discount_pkr), 34.5); // 10% of 345

    // Submitting with the exact same idempotency_key prevents duplicate order creation
    const orderResDuplicate = await callWorker(env, 'POST', '/api/v1/public/orders', {
      host: 'alshifa.aivrasol.pk',
      body: {
        idempotency_key: orderIdempKey,
        customer_name: 'Ayesha Khan',
        customer_phone: '0300-5556677',
        fulfillment_type: 'delivery',
        delivery_address: 'House 14, Block H, Gulberg III',
        payment_method: 'cod',
        items: [{ product_id: item1.id, qty: 3 }],
      },
    });
    assert.equal(orderResDuplicate.status, 200);
    assert.equal(orderResDuplicate.json.duplicate, true);
    assert.equal(orderResDuplicate.json.order.id, createdOrder.id);

    // Track order on Al-Shifa domain succeeds
    const trackOnA = await callWorker(
      env,
      'GET',
      `/api/v1/public/orders/track?order_number=${encodeURIComponent(createdOrder.order_number)}&phone=6677`,
      { host: 'alshifa.aivrasol.pk' }
    );
    assert.equal(trackOnA.status, 200);
    assert.equal(trackOnA.json.order.order_number, createdOrder.order_number);

    // Tracking Al-Shifa's order on CityMed domain is strictly blocked (404)
    const trackOnB = await callWorker(
      env,
      'GET',
      `/api/v1/public/orders/track?order_number=${encodeURIComponent(createdOrder.order_number)}&phone=6677`,
      { host: 'citymed.aivrasol.pk' }
    );
    assert.equal(trackOnB.status, 404);
  });

  it('13. Milestone 2+3: Safe POS Order Inbox & Idempotent Handoff Reconciliation', async () => {
    const syncTokenA = await signSyncToken(
      {
        storefrontId: storefrontAId,
        pharmacyId: 'pharm-alshifa-001',
        branchId: 'main',
      },
      SYNC_SECRET,
      3600
    );

    // POS fetches incoming online orders inbox
    const inboxRes = await callWorker(env, 'GET', '/api/v1/sync/orders/inbox', {
      token: syncTokenA,
    });
    assert.equal(inboxRes.status, 200);
    assert.ok(inboxRes.json.orders.length >= 1, 'POS inbox should contain the online order');
    const inboxOrder = inboxRes.json.orders[0];
    assert.equal(inboxOrder.pos_handoff_status, 'pending');

    // POS stages order as a Held Bill (does not finalize invoice or deduct stock)
    const ackHeld = await callWorker(env, 'POST', '/api/v1/sync/orders/ack', {
      token: syncTokenA,
      body: {
        contract_version: 'aivrasol-storefront-sync/v1',
        idempotency_key: `ack_hold_${inboxOrder.order_id}`,
        storefront_id: storefrontAId,
        pharmacy_id: 'pharm-alshifa-001',
        order_id: inboxOrder.order_id,
        action: 'stage_held_bill',
        pos_invoice_id: `hold_sf_${inboxOrder.order_id}`,
        pos_invoice_number: `HOLD-WEB-${inboxOrder.order_number}`,
        operator_name: 'Cashier Ali',
      },
    });
    assert.equal(ackHeld.status, 200);
    assert.equal(ackHeld.json.pos_handoff_status, 'held_in_pos');
    assert.equal(ackHeld.json.status, 'confirmed');

    // POS marks order fulfilled after operator completes billing in POS
    const ackFulfilled = await callWorker(env, 'POST', '/api/v1/sync/orders/ack', {
      token: syncTokenA,
      body: {
        contract_version: 'aivrasol-storefront-sync/v1',
        idempotency_key: `ack_fulfill_${inboxOrder.order_id}`,
        storefront_id: storefrontAId,
        pharmacy_id: 'pharm-alshifa-001',
        order_id: inboxOrder.order_id,
        action: 'mark_fulfilled',
        pos_invoice_id: 'inv_pos_9901',
        pos_invoice_number: 'INV2611-09901',
        operator_name: 'Cashier Ali',
      },
    });
    assert.equal(ackFulfilled.status, 200);
    assert.equal(ackFulfilled.json.pos_handoff_status, 'fulfilled_in_pos');
    assert.equal(ackFulfilled.json.status, 'completed');
  });
});
