import fs from "fs";
import path from "path";
import { searchWikimediaForMedicine, SearchTargetMedicine } from "./wikimedia-source";
import { downloadAndOptimizeMedicineImage } from "./image-optimizer";
import { runMasterCatalogImport } from "./master-importer";

export interface CollectorConfig {
  workerBaseUrl: string;
  adminSecret: string;
  batchSize?: number;
  delayBetweenSearchesMs?: number;
  maxJobsPerSession?: number;
}

function loadConfig(): CollectorConfig {
  const configPath = path.resolve(process.cwd(), "config.json");
  let cfg: Partial<CollectorConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      // ignore
    }
  }

  return {
    workerBaseUrl:
      process.env.STOREFRONT_WORKER_URL ||
      cfg.workerBaseUrl ||
      "https://aivrasol-storefront-staging.aivrasol-storefront.workers.dev",
    adminSecret:
      process.env.STOREFRONT_ADMIN_SECRET ||
      cfg.adminSecret ||
      "staging_admin_secret_2026",
    batchSize: Number(process.env.COLLECTOR_BATCH_SIZE || cfg.batchSize || 5),
    delayBetweenSearchesMs: Number(
      process.env.COLLECTOR_DELAY_MS || cfg.delayBetweenSearchesMs || 1500
    ),
    maxJobsPerSession: Number(
      process.env.COLLECTOR_MAX_JOBS || cfg.maxJobsPerSession || 25
    ),
  };
}

async function runCollectorSession(config: CollectorConfig) {
  const baseUrl = config.workerBaseUrl.replace(/\/+$/, "");
  console.log(`\n======================================================`);
  console.log(`[AivraSol Image Collector] Starting Discovery Session`);
  console.log(`Worker: ${baseUrl}`);
  console.log(`Batch Size: ${config.batchSize} | Delay: ${config.delayBetweenSearchesMs}ms`);
  console.log(`======================================================\n`);

  let totalProcessed = 0;
  const maxJobs = config.maxJobsPerSession || 25;

  while (totalProcessed < maxJobs) {
    const fetchLimit = Math.min(config.batchSize || 5, maxJobs - totalProcessed);
    console.log(`[Collector] Requesting next batch (limit ${fetchLimit}) from Cloudflare...`);

    const batchRes = await fetch(
      `${baseUrl}/api/v1/manage/central-library/discovery/batch?limit=${fetchLimit}`,
      {
        headers: {
          "x-storefront-admin-secret": config.adminSecret,
        },
      }
    );

    if (!batchRes.ok) {
      const err = await batchRes.text().catch(() => "");
      console.error(`[Collector] Failed to fetch batch: HTTP ${batchRes.status} ${err}`);
      break;
    }

    const batchData: any = await batchRes.json();
    if (batchData.paused) {
      console.log(`[Collector] Queue paused: ${batchData.message || "Collector paused"}`);
      break;
    }

    const items: any[] = batchData.items || [];
    if (items.length === 0) {
      console.log(`[Collector] No more pending items in discovery queue. Session complete.`);
      break;
    }

    console.log(`[Collector] Acquired ${items.length} item(s) to search.`);

    for (const item of items) {
      totalProcessed++;
      const queueId = String(item.id);
      const masterName = String(item.master_catalog_name || item.brand || "");
      const masterId = String(item.master_catalog_id || "");

      console.log(
        `\n[Collector ${totalProcessed}/${maxJobs}] Processing: "${masterName}" (${masterId})`
      );

      const target: SearchTargetMedicine = {
        master_catalog_id: masterId,
        master_catalog_name: masterName,
        brand: item.brand,
        generic: item.generic,
        strength: item.strength,
        dosage_form: item.dosage_form,
        manufacturer: item.manufacturer,
      };

      try {
        // 1. Search Wikimedia Commons for clinical match
        const candidates = await searchWikimediaForMedicine(target);

        if (candidates.length === 0) {
          console.log(`  -> No matching photographs found in free repositories.`);
          await fetch(`${baseUrl}/api/v1/manage/central-library/discovery/submit`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-storefront-admin-secret": config.adminSecret,
            },
            body: JSON.stringify({
              queue_id: queueId,
              status: "not_found",
              source: "wikimedia_commons",
            }),
          });
        } else {
          const topCandidate = candidates[0];
          console.log(
            `  -> Found Candidate: "${topCandidate.title}" (Score: ${(
              topCandidate.confidence_score * 100
            ).toFixed(0)}%, License: ${topCandidate.license})`
          );

          // 2. Download and Optimize using Sharp into ultra-lightweight WebP
          console.log(`  -> Downloading and compressing to WebP (target 25-60 KB)...`);
          const optResult = await downloadAndOptimizeMedicineImage(
            topCandidate.image_url,
            masterName
          );

          if (!optResult) {
            console.log(`  -> Image download or optimization failed. Scheduling retry.`);
            await fetch(`${baseUrl}/api/v1/manage/central-library/discovery/submit`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-storefront-admin-secret": config.adminSecret,
              },
              body: JSON.stringify({
                queue_id: queueId,
                status: "failed",
                source: "wikimedia_commons",
                error: "Image optimization failed",
              }),
            });
          } else {
            console.log(
              `  -> WebP Generated: ${(optResult.byte_size / 1024).toFixed(1)} KB, ` +
                `${optResult.width}x${optResult.height}px, SHA-256: ${optResult.sha256_hex.slice(0, 10)}...`
            );

            // 3. Upload optimized WebP to Storefront R2 via central library API
            console.log(`  -> Uploading to R2 with logical filename "${optResult.logical_file_name}"...`);
            const uploadRes = await fetch(
              `${baseUrl}/api/v1/manage/central-library/discovery/upload-optimized`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-storefront-admin-secret": config.adminSecret,
                },
                body: JSON.stringify({
                  data_base64: optResult.base64,
                  sha256_hex: optResult.sha256_hex,
                  master_catalog_name: masterName,
                  logical_file_name: optResult.logical_file_name,
                  width: optResult.width,
                  height: optResult.height,
                  byte_size: optResult.byte_size,
                  rights_status: topCandidate.license,
                  attribution: topCandidate.attribution,
                  source_type: "wikimedia_commons",
                }),
              }
            );

            if (!uploadRes.ok) {
              const uErr = await uploadRes.text().catch(() => "");
              console.error(`  -> Upload failed: HTTP ${uploadRes.status} ${uErr}`);
            } else {
              const uploadData: any = await uploadRes.json();
              console.log(
                `  -> Upload Successful! Media ID: ${uploadData.media_id} (${
                  uploadData.deduplicated ? "Deduplicated / Reused R2" : "Stored in R2"
                })`
              );

              // 4. Submit candidate discovery result
              topCandidate.image_url = uploadData.public_url;
              (topCandidate as any).media_id = uploadData.media_id;
              (topCandidate as any).r2_key = uploadData.r2_key;

              const submitRes = await fetch(
                `${baseUrl}/api/v1/manage/central-library/discovery/submit`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-storefront-admin-secret": config.adminSecret,
                  },
                  body: JSON.stringify({
                    queue_id: queueId,
                    status: "candidate_found",
                    source: "wikimedia_commons",
                    candidates: [topCandidate],
                  }),
                }
              );

              const submitData: any = await submitRes.json();
              console.log(`  -> Discovery Status: ${submitData.status || "needs_review"}`);
            }
          }
        }
      } catch (err: any) {
        console.error(`[Collector] Error processing item ${masterId}:`, err?.message || err);
      }

      // Rate limit delay between items
      if (config.delayBetweenSearchesMs && config.delayBetweenSearchesMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.delayBetweenSearchesMs));
      }
    }
  }

  console.log(`\n[AivraSol Image Collector] Session Finished. Total Processed: ${totalProcessed}\n`);
}

// CLI entry point
const args = process.argv.slice(2);
const cfg = loadConfig();

if (args.includes("--import") || args.includes("--import-all")) {
  const isImportAll = args.includes("--import-all");
  const maxIdx = args.indexOf("--max");
  const maxItems = !isImportAll && maxIdx >= 0 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : undefined;
  console.log(
    isImportAll
      ? "[MasterImporter] Starting automated population of ENTIRE 41,441 Master Catalog medicines..."
      : `[MasterImporter] Starting bounded import (limit: ${maxItems || "all"})...`
  );
  runMasterCatalogImport({
    workerBaseUrl: cfg.workerBaseUrl,
    adminSecret: cfg.adminSecret,
    maxItems,
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[MasterImporter] Fatal:", err);
      process.exit(1);
    });
} else {
  runCollectorSession(cfg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Collector] Fatal:", err);
      process.exit(1);
    });
}

