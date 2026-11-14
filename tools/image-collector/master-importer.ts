import fs from "fs";
import path from "path";

export interface MasterCatalogImportConfig {
  workerBaseUrl: string;
  adminSecret: string;
  batchSize?: number;
  catalogFilePath?: string;
  maxItems?: number; // Optional limit for initial pilot testing
}

/**
 * Reads AivraSol Master Medicine Catalog and safely imports non-sensitive
 * medicine identities into the Central Image Discovery Queue.
 */
export async function runMasterCatalogImport(config: MasterCatalogImportConfig) {
  const batchSize = config.batchSize || 100;
  const baseUrl = config.workerBaseUrl.replace(/\/+$/, "");

  // Resolve pk-medicines.json path
  const candidatePaths = [
    path.resolve(process.cwd(), "../../aivrasol-pos/src/data/pk-medicines.json"),
    path.resolve(process.cwd(), "../aivrasol-pos/src/data/pk-medicines.json"),
    path.resolve(process.cwd(), "aivrasol-pos/src/data/pk-medicines.json"),
    "D:\\aivrasol Pharmacy POS\\aivrasol-pos\\src\\data\\pk-medicines.json",
  ];
  let catalogPath = config.catalogFilePath;
  if (!catalogPath) {
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        catalogPath = p;
        break;
      }
    }
  }
  if (!catalogPath || !fs.existsSync(catalogPath)) {
    throw new Error(`Master catalog file not found. Checked: ${candidatePaths.join(", ")}`);
  }

  const rawJson = fs.readFileSync(catalogPath, "utf-8");
  const parsed = JSON.parse(rawJson);

  let extractedItems: Array<{
    master_catalog_id: string;
    master_catalog_name: string;
    brand?: string;
    generic?: string;
    strength?: string;
    dosage_form?: string;
    manufacturer?: string;
    pack_size?: number;
    pack_unit?: string;
    barcode?: string;
  }> = [];

  if (parsed.format === "aivrasol-master-v2-compact" && parsed.dicts && Array.isArray(parsed.items)) {
    const d = parsed.dicts;
    const items: any[] = parsed.items;
    console.log(`[MasterImporter] Unpacking ${items.length} compact dictionary-encoded catalog medicines...`);

    const limit = config.maxItems ? Math.min(config.maxItems, items.length) : items.length;

    for (let i = 0; i < limit; i++) {
      const t = items[i];
      const idOrIcode = t[0];
      const isNum = typeof idOrIcode === "number";
      const id = isNum ? `ABZ-ITEM-${idOrIcode}` : String(idOrIcode);
      const brandName = String(t[1] || "").trim();
      const originalName = t[2] === 0 ? brandName : String(t[2] || brandName).trim();
      const genericName = t[3] >= 0 ? d.genericName[t[3]] : undefined;
      const strength = t[4] >= 0 ? d.strength[t[4]] : undefined;
      const rawForm = t[5] >= 0 ? d.dosageForm[t[5]] : "Other";
      const manufacturer = t[8] >= 0 && d.manufacturer ? d.manufacturer[t[8]] : undefined;
      const packUnits = typeof t[11] === "number" && t[11] > 0 ? t[11] : 1;
      const baseUnit = t[10] >= 0 && d.baseUnit ? d.baseUnit[t[10]] : "unit";
      const barcode = typeof t[27] === "string" ? t[27] : undefined;

      extractedItems.push({
        master_catalog_id: id,
        master_catalog_name: originalName || brandName,
        brand: brandName,
        generic: genericName,
        strength,
        dosage_form: rawForm,
        manufacturer,
        pack_size: packUnits,
        pack_unit: baseUnit,
        barcode,
      });
    }
  } else if (Array.isArray(parsed)) {
    console.log(`[MasterImporter] Loading ${parsed.length} raw catalog items...`);
    const limit = config.maxItems ? Math.min(config.maxItems, parsed.length) : parsed.length;
    for (let i = 0; i < limit; i++) {
      const r = parsed[i];
      extractedItems.push({
        master_catalog_id: String(r.id || r.code),
        master_catalog_name: String(r.originalName || r.name || r.brandName),
        brand: r.brandName || r.brand,
        generic: r.genericName || r.generic,
        strength: r.strength,
        dosage_form: r.dosageForm || r.dosage_form,
        manufacturer: r.manufacturer,
        pack_size: r.packUnits || r.pack_size,
        pack_unit: r.baseUnit || r.unit,
        barcode: r.barcode,
      });
    }
  }

  console.log(`[MasterImporter] Extracted ${extractedItems.length} candidate medicines for discovery queue.`);

  // Send in safe bounded batches to Storefront Worker
  let totalImported = 0;
  const totalBatches = Math.ceil(extractedItems.length / batchSize);

  for (let b = 0; b < totalBatches; b++) {
    const chunk = extractedItems.slice(b * batchSize, (b + 1) * batchSize);
    process.stdout.write(`[MasterImporter] Sending Batch ${b + 1}/${totalBatches} (${chunk.length} items)... `);

    const res = await fetch(`${baseUrl}/api/v1/manage/central-library/discovery/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-storefront-admin-secret": config.adminSecret,
      },
      body: JSON.stringify({ items: chunk }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log(`FAILED (HTTP ${res.status}): ${errText}`);
      throw new Error(`Failed to import batch ${b + 1}: HTTP ${res.status}`);
    }

    const data: any = await res.json();
    totalImported += Number(data.importedCount || chunk.length);
    console.log(`OK (Imported: ${data.importedCount || chunk.length})`);
  }

  console.log(`[MasterImporter] Master Catalog Import Completed! Total ${totalImported} items queued.`);
  return { totalQueued: totalImported };
}
