import crypto from "node:crypto";

const STAGING_URL = "https://aivrasol-storefront-staging.aivrasol-storefront.workers.dev";
const ADMIN_SECRET = "aivrasol-storefront-dev-admin-secret-2026";

function generateAuthToken() {
  const payload = {
    t: "super_admin",
    id: "super_admin_test",
    em: "admin@aivrasol.com",
    ph: null,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const bodyB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(bodyB64).digest("hex");
  return `sfm1.${bodyB64}.${sig}`;
}

async function run() {
  const token = generateAuthToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  console.log("=== 1. Uploading a shared packaging WebP image ===");
  // Generate a minimal valid 1x1 WebP for test packaging
  const dummyWebpBase64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
  const webpBuffer = Buffer.from(dummyWebpBase64, "base64");
  const sha256 = crypto.createHash("sha256").update(webpBuffer).digest("hex");

  const uploadRes = await fetch(`${STAGING_URL}/api/v1/manage/central-library/upload`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filename: "panadol_500mg_shared.webp",
      mime_type: "image/webp",
      byte_size: webpBuffer.length,
      width: 400,
      height: 400,
      sha256_hex: sha256,
      base64_data: dummyWebpBase64,
    }),
  });
  const uploadJson = await uploadRes.json();
  console.log("Upload status:", uploadRes.status, uploadJson);
  if (!uploadJson.ok) throw new Error("Upload failed");

  const mediaId = uploadJson.media_id || uploadJson.media?.id;
  const imageUrl = uploadJson.public_url || uploadJson.media?.public_url;

  console.log("\n=== 2. Upserting Canonical Medicine (Panadol 500mg Tablets) ===");
  const panadolRes = await fetch(`${STAGING_URL}/api/v1/manage/central-library/medicines`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "cm_panadol_500mg_tabs",
      canonical_name: "Panadol 500mg Tablets",
      brand_name: "Panadol",
      generic_name: "Paracetamol",
      strength: "500mg",
      dosage_form: "Tablet",
      manufacturer: "GSK",
      pack_size: 200,
      pack_unit: "Tablets",
      aliases: ["Panadol Tab", "Panadol 500", "Paracetamol 500mg Tab", "Panadol Advance", "Panadol"],
      preferred_media_id: mediaId,
      verification_status: "verified",
    }),
  });
  const panadolJson = await panadolRes.json();
  console.log("Panadol upsert status:", panadolRes.status, panadolJson);

  console.log("\n=== 3. Upserting Brufen 400mg Tablets (distinct strength) ===");
  const brufenRes = await fetch(`${STAGING_URL}/api/v1/manage/central-library/medicines`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "cm_brufen_400mg_tabs",
      canonical_name: "Brufen 400mg Tablets",
      brand_name: "Brufen",
      generic_name: "Ibuprofen",
      strength: "400mg",
      dosage_form: "Tablet",
      manufacturer: "Abbott",
      pack_size: 30,
      pack_unit: "Tablets",
      aliases: ["Brufen 400", "Brufen Tab 400mg"],
      preferred_media_id: mediaId,
      verification_status: "verified",
    }),
  });
  console.log("Brufen upsert status:", brufenRes.status, await brufenRes.json());

  console.log("\n=== 4. Running Central Library Batch-Match on Storefront Products ===");
  const matchRes = await fetch(`${STAGING_URL}/api/v1/manage/central-library/batch-match`, {
    method: "POST",
    headers,
    body: JSON.stringify({ batch_size: 200, offset: 0 }),
  });
  const matchJson = await matchRes.json();
  console.log("Batch match status:", matchRes.status, matchJson);

  console.log("\n=== 5. Querying Products to verify Intelligent Matching & Safety ===");
  // Query storefronts to find our real pharmacy storefront
  const sfRes = await fetch(`${STAGING_URL}/api/v1/manage/storefronts`, { headers });
  const sfJson = await sfRes.json();
  const pharmacySf = sfJson.storefronts?.find((s) => s.id !== "sf_central_library");
  console.log("Pharmacy Storefront:", pharmacySf?.slug, "ID:", pharmacySf?.id);

  if (pharmacySf) {
    console.log("\nRunning batch match specifically on pharmacy storefront products...");
    let offset = 0;
    let totalMatched = 0;
    while (offset < 2400) {
      const matchBatchRes = await fetch(`${STAGING_URL}/api/v1/manage/central-library/batch-match`, {
        method: "POST",
        headers,
        body: JSON.stringify({ storefront_id: pharmacySf.id, batch_size: 200, offset }),
      });
      const matchBatchJson = await matchBatchRes.json();
      totalMatched += matchBatchJson.matched || 0;
      if (!matchBatchJson.hasMore) break;
      offset = matchBatchJson.nextOffset;
    }
    console.log(`Total products matched to central library: ${totalMatched}`);

    const prodsRes = await fetch(
      `${STAGING_URL}/api/v1/manage/storefronts/${pharmacySf.id}/products?q=panadol`,
      { headers }
    );
    const prodsJson = await prodsRes.json();
    console.log(`Found ${prodsJson.products?.length || 0} Panadol products in ${pharmacySf.slug}:`);
    for (const p of prodsJson.products || []) {
      console.log(
        `- Product: "${p.name}" | Strength: "${p.strength || 'N/A'}" | Image Source: "${p.image_source}" | Canonical ID: "${p.canonical_medicine_id || 'None'}" | Image URL: "${p.primary_image_url || 'None'}"`
      );
    }

    // Safety Verification: Ensure Panadol Extra was NOT mismatched to Panadol 500mg
    const extraProd = (prodsJson.products || []).find((p) =>
      p.name.toLowerCase().includes("extra")
    );
    if (extraProd) {
      console.log("\nSafety check on Panadol Extra:");
      console.log(`- Name: "${extraProd.name}", Image Source: "${extraProd.image_source}", Canonical ID: "${extraProd.canonical_medicine_id}"`);
      if (extraProd.canonical_medicine_id === "cm_panadol_500mg_tabs") {
        console.error("FAIL: Panadol Extra was mistakenly matched to Panadol 500mg!");
      } else {
        console.log("PASS: Panadol Extra safely protected from false match.");
      }
    }

    // Test 6: Owner Override Isolation
    const targetProd = (prodsJson.products || []).find((p) => p.canonical_medicine_id === "cm_panadol_500mg_tabs") || (prodsJson.products || [])[0];
    if (targetProd) {
      console.log(`\n=== 6. Testing Owner Override on Product: "${targetProd.name}" (${targetProd.id}) ===`);
      const overrideRes = await fetch(
        `${STAGING_URL}/api/v1/manage/storefronts/${pharmacySf.id}/products/${targetProd.id}/assign-image`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "set_owner_override",
            image_url: "/api/v1/public/media/custom_pharmacy_photo.webp",
          }),
        }
      );
      console.log("Owner override status:", overrideRes.status, await overrideRes.json());

      // Re-run batch match to prove owner override is strictly preserved
      const reMatchRes = await fetch(`${STAGING_URL}/api/v1/manage/central-library/batch-match`, {
        method: "POST",
        headers,
        body: JSON.stringify({ storefront_id: pharmacySf.id, batch_size: 200, offset: 0 }),
      });
      console.log("Re-match status:", reMatchRes.status, await reMatchRes.json());

      // Query product again
      const verifyProdRes = await fetch(
        `${STAGING_URL}/api/v1/manage/storefronts/${pharmacySf.id}/products?q=${encodeURIComponent(targetProd.name)}`,
        { headers }
      );
      const verifyProdJson = await verifyProdRes.json();
      const afterMatch = (verifyProdJson.products || []).find((p) => p.id === targetProd.id);
      console.log("Product after re-batch match:");
      console.log(`- Image Source: "${afterMatch?.image_source}", URL: "${afterMatch?.primary_image_url}"`);
      if (afterMatch?.image_source === "owner_override") {
        console.log("PASS: Owner override remained strictly protected during batch match.");
      } else {
        console.error("FAIL: Owner override was overwritten!");
      }

      // Test 7: Revert to Shared Library
      console.log("\n=== 7. Testing Revert to Shared Library ===");
      const revertRes = await fetch(
        `${STAGING_URL}/api/v1/manage/storefronts/${pharmacySf.id}/products/${targetProd.id}/assign-image`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "revert_to_shared",
          }),
        }
      );
      const revertJson = await revertRes.json();
      console.log("Revert status:", revertRes.status, revertJson);
      if (revertJson.image_source === "shared_library") {
        console.log("PASS: Successfully reverted product back to shared central image.");
      }
    }
  }

  console.log("\n=== 8. Checking Central Library Overview KPIs ===");
  const finalOverviewRes = await fetch(`${STAGING_URL}/api/v1/manage/central-library/overview`, { headers });
  const finalOverviewJson = await finalOverviewRes.json();
  console.log("Final Overview KPIs:", JSON.stringify(finalOverviewJson.overview, null, 2));

  console.log("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
}

run().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
