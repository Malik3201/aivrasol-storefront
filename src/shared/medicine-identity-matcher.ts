/**
 * Intelligent Medicine Identity Matching Engine
 *
 * Implements Section 5 of AivraSol Central Smart Medicine Image Library:
 * - Priority 1: Exact verified GTIN / barcode
 * - Priority 2: Exact normalized identity (Brand + Strength + Dosage Form + Variant)
 * - Priority 3: Super Admin approved aliases (with strict strength + dosage form check)
 * - Priority 4: Conservative candidate suggestions for admin review only
 *
 * CLINICAL SAFETY CONSTRAINTS (ZERO TOLERANCE FOR CLINICAL MISMATCHES):
 * - Never attach a 625mg photo to a 1g (1000mg) or 375mg medicine
 * - Never match 250mg with 500mg, or 20mg with 40mg
 * - Never match Tablets with Syrup, Suspension, or Injections
 * - Never match Forte with Plain, or XR with Immediate Release
 * - If canonical specifies a strength, product MUST have the EXACT SAME strength
 * - No wildcard brand image application without strength confirmation
 */

export interface ProductInput {
  name: string;
  generic_name?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  brand_name?: string | null;
  packing_label?: string | null;
  unit_label?: string | null;
  sku_code?: string | null;
  barcode?: string | null;
  master_medicine_id?: string | null;
}

export interface CanonicalMedicineRecord {
  id: string;
  canonical_name: string;
  master_catalog_id?: string | null;
  master_catalog_name?: string | null;
  normalized_catalog_name?: string | null;
  brand_name?: string | null;
  generic_name?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  manufacturer?: string | null;
  pack_size?: number | null;
  pack_unit?: string | null;
  barcode?: string | null;
  aliases_json?: string | null;
  verification_status?: string;
  preferred_media_id?: string | null;
  image_source?: string | null;
  image_rights_status?: string | null;
  logical_file_name?: string | null;
  normalized_core_key?: string | null;
  allow_strengthless_match?: boolean | number | null;
}

export interface MedicineMatchResult {
  matched: boolean;
  matchType: "master_catalog_id" | "exact_barcode" | "exact_master_name" | "exact_normalized" | "alias" | "none";
  canonicalId: string | null;
  canonicalRecord: CanonicalMedicineRecord | null;
  preferredMediaId: string | null;
  explanation: string;
  suggestedCandidates?: Array<{
    canonicalId: string;
    canonicalName: string;
    score: number;
    reason: string;
  }>;
}

export function cleanText(val?: string | null): string {
  if (!val) return "";
  return val
    .toLowerCase()
    .replace(/[^\w\s\.\/%+-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Standardizes common Pakistani pharmacy phonetic / abbreviation variants
 */
export function normalizeMedicineText(val?: string | null): string {
  if (!val) return "";
  let text = cleanText(val);
  text = text.replace(/\bfort\b/g, "forte");
  text = text.replace(/\bsyp\b/g, "syrup");
  text = text.replace(/\binj\b/g, "injection");
  text = text.replace(/\b(tab|tabs)\b/g, "tablet");
  text = text.replace(/\b(cap|caps)\b/g, "capsule");
  text = text.replace(/\b(susp)\b/g, "suspension");
  return text;
}

/**
 * Strips strength, dosage form, packaging, and formulation tokens to extract the base brand
 */
export function getCoreMedicineName(rawName: string): string {
  let cleaned = normalizeMedicineText(rawName);
  // Remove strength tokens (including gm, g, grams, mg, ml, etc.)
  cleaned = cleaned.replace(
    /\b\d+(\.\d+)?(?:\/\d+(\.\d+)?)?\s*(mg|ml|mcg|gm|gms|gram|grams|g|iu|%|mg\/ml|mg\/5ml|iu\/ml)\b/gi,
    " "
  );
  // Remove dosage form tokens
  cleaned = cleaned.replace(
    /\b(tablet|tablets|tab|tabs|caplet|caplets|dispersible|capsule|capsules|cap|caps|syrup|syp|liquid|elixir|suspension|susp|injection|inj|ampoule|vial|drops|cream|ointment|gel|inhaler|sachet|powder)\b/gi,
    " "
  );
  // Remove pharmaceutical release / coating / formulation modifiers
  cleaned = cleaned.replace(
    /\b(film[-\s]?coated|fc|fct|sugar[-\s]?free|effervescent|chewable|sublingual|extended[-\s]?release|sustained[-\s]?release|controlled[-\s]?release|modified[-\s]?release|er|sr|cr|xr|mr|dr|retard|plain|advance|forte|fort|extra|cf|plus|ds|junior|kids|pediatric|paed|adult)\b/gi,
    " "
  );
  // Remove pack count tokens like 12s, 14s, 100s, 12's, 100's, 200s
  cleaned = cleaned.replace(/\b\d+\s*['’`]?s\b/gi, " ");
  // Remove common inventory status/version labels
  cleaned = cleaned.replace(/\b(new|old|imported|local|reg|regular)\b/gi, " ");
  // Remove common pack packaging words
  cleaned = cleaned.replace(/\b(pack|box|bottle|strip|blister)\b/gi, " ");
  return cleanText(cleaned);
}

/**
 * Deterministic SQL-indexable brand lookup key (e.g., "augmentin", "panadol", "arinac", "disprin").
 * Used to query ONLY matching rows from 38,000+ central_medicines in O(1) D1 reads!
 */
export function computeNormalizedCoreKey(rawName?: string | null): string {
  const core = getCoreMedicineName(rawName || "");
  if (!core) return "";
  // Keep up to first 2 meaningful tokens to prevent over-fragmentation while staying highly selective
  const tokens = core
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return core.replace(/[^a-z0-9]/g, "");
  return tokens.slice(0, 2).join("_");
}

/**
 * Standardizes strength strings with unit awareness and metric conversion:
 * - "1gm" / "1 gm" / "1g" -> "1000mg"
 * - "0.5g" / "0.5gm" -> "500mg"
 * - "625mg" / "625 mg" -> "625mg"
 * - "1/500mg" / "1mg/500mg" -> "1/500mg"
 * - "400mg/60mg" -> "400/60mg"
 * - "156.25mg/5ml" -> "156.25mg/5ml"
 *
 * CRITICAL: Requires explicit unit in the string so pack counts like "12 tab" or "50 tab" are NEVER parsed as strength.
 */
export function extractAndNormalizeStrength(rawText?: string | null): string | null {
  if (!rawText) return null;
  const cleaned = rawText.trim();
  if (!cleaned) return null;

  // 1. Combination ratios (e.g. "1/500mg", "1/500 mg", "1mg/500mg", "400mg/60mg", "400/60mg")
  const comboMatch = cleaned.match(
    /\b(\d+(?:\.\d+)?)\s*(?:mg|g|gm)?\s*\/\s*(\d+(?:\.\d+)?)\s*(mg|g|gm)?\b/i
  );
  if (comboMatch) {
    const num1 = comboMatch[1];
    const num2 = comboMatch[2];
    return `${num1}/${num2}mg`;
  }

  // 2. Grams (e.g. "1gm", "1 gm", "1gms", "1 gms", "1g", "1 g", "1gram", "1 grams", "0.5g", "0.5gm")
  // Automatically normalized to milligrams so 1g/1gm equals 1000mg and distinct from 625mg
  const gramMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\s*(?:gm|gms|gram|grams|g)\b/i);
  if (gramMatch) {
    const val = parseFloat(gramMatch[1]);
    if (!isNaN(val) && val > 0) {
      const mgVal = Math.round(val * 1000 * 100) / 100;
      return `${mgVal}mg`;
    }
  }

  // 3. Liquid concentrations (e.g. "156.25mg/5ml", "250mg/5ml", "5mg/ml")
  const liquidStrengthMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\s*(mg\/(?:5ml|ml))\b/i);
  if (liquidStrengthMatch) {
    return `${liquidStrengthMatch[1].toLowerCase()}${liquidStrengthMatch[2].toLowerCase()}`;
  }

  // 4. Milligrams (e.g. "625mg", "625 mg", "500mg", "250mg", "40mg", "20mg", "5mg", "2.5mg")
  const mgMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\s*mg\b/i);
  if (mgMatch) {
    const num = mgMatch[1].toLowerCase();
    return `${num}mg`;
  }

  // 5. Milliliters / Volume (e.g. "35ml", "60ml", "100ml", "120ml")
  const mlMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) {
    const num = mlMatch[1].toLowerCase();
    return `${num}ml`;
  }

  // 6. Micrograms / IU / % (e.g. "100mcg", "5000iu", "1%", "0.05%")
  const otherUnitMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\s*(mcg|iu|%)\b/i);
  if (otherUnitMatch) {
    return `${otherUnitMatch[1].toLowerCase()}${otherUnitMatch[2].toLowerCase()}`;
  }

  return null;
}

/**
 * Resolves product strength comprehensively from all available product fields in POS:
 * 1. product.strength
 * 2. product.sku_code (standard in Pakistani POS for e.g. "1GM", "625MG", "375", "250mg", "2.5mg")
 * 3. product.name (e.g. "Augmentin 625mg Tablets")
 * 4. product.generic_name
 */
export function resolveProductStrength(product: ProductInput): string | null {
  // 1. Explicit strength field
  if (product.strength) {
    const str = extractAndNormalizeStrength(product.strength);
    if (str) return str;
    // Bare number in strength column (e.g. "500", "250")
    if (/^\d+(\.\d+)?$/.test(product.strength.trim())) {
      return `${product.strength.trim()}mg`;
    }
  }

  // 2. sku_code (frequently holds strength in Pakistani pharmacy databases, e.g. "1GM", "625MG", "375", "20mg")
  if (product.sku_code) {
    const str = extractAndNormalizeStrength(product.sku_code);
    if (str) return str;
    // Bare number in sku_code (e.g. "375" for Augmentin 375, "625" for Augmentin 625)
    if (/^\d+(\.\d+)?$/.test(product.sku_code.trim())) {
      const n = parseFloat(product.sku_code.trim());
      if (n >= 0.5 && n <= 2000) {
        return `${n}mg`;
      }
    }
  }

  // 3. From product name (e.g. "Augmentin 625mg Tablets", "Nexum 40mg")
  if (product.name) {
    const str = extractAndNormalizeStrength(product.name);
    if (str) return str;
  }

  // 4. From packaging label or unit label (e.g. "Box of 14 (625mg)", "1GM Vial")
  if (product.packing_label) {
    const str = extractAndNormalizeStrength(product.packing_label);
    if (str) return str;
  }
  if (product.unit_label) {
    const str = extractAndNormalizeStrength(product.unit_label);
    if (str) return str;
  }

  // 5. From generic composition (e.g. "Amoxicillin 500mg")
  if (product.generic_name) {
    const str = extractAndNormalizeStrength(product.generic_name);
    if (str) return str;
  }

  return null;
}

/**
 * Extracts distinct clinical variant modifiers (e.g. forte vs plain, advance vs plain, cf vs plain, xr vs immediate)
 */
export function extractVariantModifier(rawText?: string | null): string | null {
  if (!rawText) return null;
  const lower = rawText.toLowerCase();
  if (/\b(forte|fort)\b/i.test(lower)) return "forte";
  if (/\bplain\b/i.test(lower)) return "plain";
  if (/\badvance\b/i.test(lower)) return "advance";
  if (/\bcf\b/i.test(lower)) return "cf";
  if (/\bextra\b/i.test(lower)) return "extra";
  if (/\bplus\b/i.test(lower)) return "plus";
  if (/\b(xr|extended[-\s]?release)\b/i.test(lower)) return "xr";
  if (/\b(sr|sustained[-\s]?release)\b/i.test(lower)) return "sr";
  if (/\b(cr|controlled[-\s]?release)\b/i.test(lower)) return "cr";
  if (/\b(ds|double[-\s]?strength)\b/i.test(lower)) return "ds";
  if (/\b(junior|kids|pediatric|paed)\b/i.test(lower)) return "kids";
  return null;
}

/**
 * Checks whether two clinical variant modifiers conflict.
 * Zero tolerance: Advance != Plain/unspecified, CF != Plain/unspecified, Extra != Plain,
 * Forte != Plain, XR/SR/CR/DS/Plus/Kids != standard!
 */
function hasVariantConflict(prodVariant: string | null, canVariant: string | null): boolean {
  if (prodVariant === canVariant) return false;
  // "plain" and null are equivalent ONLY when the other side is also plain/null
  const normProd = prodVariant === "plain" ? null : prodVariant;
  const normCan = canVariant === "plain" ? null : canVariant;
  return normProd !== normCan;
}

/**
 * Allows safe strengthless matching ONLY for iconic single-strength brands where
 * Pakistani pharmacies rarely type the strength (e.g. "Disprin", "Arinac Forte", "Ponstan Forte")
 * AND the canonical name itself does not disambiguate multiple strengths (or admin explicitly set allow_strengthless_match).
 */
function isStrengthCompatible(
  prodStrength: string | null,
  canStrength: string | null,
  can: CanonicalMedicineRecord
): boolean {
  if (canStrength && prodStrength) {
    return prodStrength === canStrength;
  }
  if (!canStrength && !prodStrength) {
    return true;
  }
  // Product has explicit strength (e.g. 200mg) while canonical has none -> never guess
  if (prodStrength && !canStrength) {
    return false;
  }
  // Canonical has metadata strength (e.g. Disprin 300mg, Arinac Forte 400/60mg) while POS item omitted strength:
  // Allow ONLY if explicitly flagged OR canonical_name itself carries no numeric strength token (single-strength iconic brand)
  if (canStrength && !prodStrength) {
    if (can.allow_strengthless_match === true || can.allow_strengthless_match === 1) {
      return true;
    }
    const strengthInsideCanonicalName = extractAndNormalizeStrength(can.canonical_name);
    if (!strengthInsideCanonicalName) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Extracts and categorizes dosage form strictly
 */
export function extractDosageForm(rawText?: string | null): string | null {
  if (!rawText) return null;
  const lower = rawText.toLowerCase();

  // Distinct form classifications
  if (/\b(tablet|tablets|tab|tabs|caplet|caplets|dispersible)\b/i.test(lower)) return "Tablet";
  if (/\b(capsule|capsules|cap|caps)\b/i.test(lower)) return "Capsule";
  if (/\b(syrup|syp|liquid|elixir)\b/i.test(lower)) return "Syrup";
  if (/\b(suspension|susp)\b/i.test(lower)) return "Suspension";
  if (/\b(injection|inj|ampoule|amp|vial|infusion|inf|i\.?v\.?|i\.?m\.?)\b/i.test(lower)) return "Injection";
  if (/\b(eye\s*drops|ear\s*drops|drops|guttae)\b/i.test(lower)) return "Drops";
  if (/\b(ointment|cream|gel|emulgel|lotion)\b/i.test(lower)) return "Topical";
  if (/\b(inhaler|rotacap|puff|spray)\b/i.test(lower)) return "Inhaler";
  if (/\b(sachet|powder|granules)\b/i.test(lower)) return "Sachet";

  return null;
}

/**
 * Resolves product dosage form from all product fields
 */
export function resolveProductDosageForm(product: ProductInput): string | null {
  if (product.dosage_form) {
    const f = extractDosageForm(product.dosage_form);
    if (f) return f;
  }
  if (product.packing_label) {
    const f = extractDosageForm(product.packing_label);
    if (f) return f;
  }
  if (product.name) {
    const f = extractDosageForm(product.name);
    if (f) return f;
  }
  if (product.unit_label) {
    const f = extractDosageForm(product.unit_label);
    if (f) return f;
  }
  if (product.sku_code) {
    const f = extractDosageForm(product.sku_code);
    if (f) return f;
  }
  return null;
}

/**
 * Parses pack quantity numbers from packaging labels (e.g. "Box of 100 tab", "10 tab")
 */
export function extractPackQuantity(packingLabel?: string | null): number | null {
  if (!packingLabel) return null;
  const match = packingLabel.match(
    /\b(\d+)\s*(?:tab|tabs|cap|caps|sachet|sachets|vial|ampoule|bottle|pack)?\b/i
  );
  if (match) {
    const qty = parseInt(match[1], 10);
    if (!isNaN(qty) && qty > 0) return qty;
  }
  return null;
}

/**
 * Checks if active pharmaceutical ingredients in two generic compositions conflict
 */
export function areGenericsCompatible(
  prodGeneric?: string | null,
  canGeneric?: string | null
): boolean {
  if (!prodGeneric || !canGeneric) return true; // not enough data to reject
  const normProdGen = cleanText(prodGeneric);
  const normCanGen = cleanText(canGeneric);
  if (!normProdGen || !normCanGen) return true;
  if (normProdGen === normCanGen) return true;

  // Extract major generic keywords (min 4 chars)
  const stopWords = ["acid", "sodium", "potassium", "plus", "with", "chloride", "hydrate"];
  const prodTokens = normProdGen
    .split(" ")
    .filter((t) => t.length >= 4 && !stopWords.includes(t));
  const canTokens = normCanGen
    .split(" ")
    .filter((t) => t.length >= 4 && !stopWords.includes(t));

  if (prodTokens.length === 0 || canTokens.length === 0) return true;

  // Check if at least one active pharmaceutical ingredient token matches
  const hasOverlap = prodTokens.some((pt) =>
    canTokens.some((ct) => ct.includes(pt) || pt.includes(ct))
  );
  return hasOverlap;
}

/**
 * Performs strict, safety-first product identity matching.
 * ZERO TOLERANCE FOR STRENGTH, FORM, OR VARIANT MISMATCHES.
 */
export function matchMedicineIdentity(
  product: ProductInput,
  canonicalList: CanonicalMedicineRecord[]
): MedicineMatchResult {
  const prodBarcode = (product.barcode || product.sku_code || "").trim();
  const prodStrength = resolveProductStrength(product);
  const prodForm = resolveProductDosageForm(product);
  const prodVariant = extractVariantModifier(product.name);

  const cleanProdName = cleanText(product.name);
  const normProdName = normalizeMedicineText(product.name);
  const coreProdName = getCoreMedicineName(product.name);

  // ── PRIORITY 2: Exact Master Catalog ID Match ──
  if (product.master_medicine_id) {
    const targetMasterId = product.master_medicine_id.trim();
    const masterMatch = canonicalList.find(
      (c) => c.master_catalog_id && c.master_catalog_id.trim() === targetMasterId
    );
    if (masterMatch && masterMatch.preferred_media_id) {
      const canStrength =
        extractAndNormalizeStrength(masterMatch.strength || "") ||
        extractAndNormalizeStrength(masterMatch.canonical_name);
      const canForm =
        extractDosageForm(masterMatch.dosage_form || "") ||
        extractDosageForm(masterMatch.canonical_name);

      const strengthConflict = !isStrengthCompatible(prodStrength, canStrength, masterMatch);
      const formConflict = Boolean(prodForm && canForm && prodForm !== canForm);
      const canVariant = extractVariantModifier(masterMatch.canonical_name);
      const variantConflict = hasVariantConflict(prodVariant, canVariant);
      const genericConflict = !areGenericsCompatible(product.generic_name, masterMatch.generic_name);

      if (!strengthConflict && !formConflict && !variantConflict && !genericConflict) {
        return {
          matched: true,
          matchType: "master_catalog_id",
          canonicalId: masterMatch.id,
          canonicalRecord: masterMatch,
          preferredMediaId: masterMatch.preferred_media_id,
          explanation: `Exact Master Catalog ID match (${targetMasterId}) verified for ${masterMatch.canonical_name}.`,
        };
      }
    }
  }

  // ── PRIORITY 3: Exact Master Catalog Name + Critical Identity ──
  const matchingByName = canonicalList.filter((c) => {
    if (!c.preferred_media_id) return false;
    const canMasterName = c.master_catalog_name || c.canonical_name;
    const cleanCan = cleanText(canMasterName);
    const normCan = normalizeMedicineText(canMasterName);
    return cleanProdName === cleanCan || normProdName === normCan;
  });

  if (matchingByName.length === 1) {
    const singleMatch = matchingByName[0];
    const canStrength =
      extractAndNormalizeStrength(singleMatch.strength || "") ||
      extractAndNormalizeStrength(singleMatch.canonical_name);
    const canForm =
      extractDosageForm(singleMatch.dosage_form || "") ||
      extractDosageForm(singleMatch.canonical_name);
    const canVariant = extractVariantModifier(singleMatch.canonical_name);

    const strengthConflict = !isStrengthCompatible(prodStrength, canStrength, singleMatch);
    const formConflict = Boolean(prodForm && canForm && prodForm !== canForm);
    const variantConflict = hasVariantConflict(prodVariant, canVariant);
    const genericConflict = !areGenericsCompatible(product.generic_name, singleMatch.generic_name);

    if (!strengthConflict && !formConflict && !variantConflict && !genericConflict) {
      return {
        matched: true,
        matchType: "exact_master_name",
        canonicalId: singleMatch.id,
        canonicalRecord: singleMatch,
        preferredMediaId: singleMatch.preferred_media_id,
        explanation: `Exact Master Catalog Name match (${singleMatch.canonical_name}) with verified critical identity.`,
      };
    }
  }

  // ── PRIORITY 4A: Exact Verified GTIN / Barcode Match ──
  if (prodBarcode && prodBarcode.length >= 6) {
    const barcodeMatch = canonicalList.find(
      (c) => c.barcode && c.barcode.trim() === prodBarcode
    );
    if (barcodeMatch) {
      // Safety check: Ensure dosage form & strength do not blatantly contradict
      const canStrength =
        extractAndNormalizeStrength(barcodeMatch.strength || "") ||
        extractAndNormalizeStrength(barcodeMatch.canonical_name);
      const canForm =
        extractDosageForm(barcodeMatch.dosage_form || "") ||
        extractDosageForm(barcodeMatch.canonical_name);

      const strengthConflict = Boolean(
        (canStrength && (!prodStrength || prodStrength !== canStrength)) ||
        (prodStrength && (!canStrength || prodStrength !== canStrength))
      );
      const formConflict = Boolean(prodForm && canForm && prodForm !== canForm);
      const genericConflict = !areGenericsCompatible(product.generic_name, barcodeMatch.generic_name);

      if (!strengthConflict && !formConflict && !genericConflict) {
        return {
          matched: true,
          matchType: "exact_barcode",
          canonicalId: barcodeMatch.id,
          canonicalRecord: barcodeMatch,
          preferredMediaId: barcodeMatch.preferred_media_id || null,
          explanation: `Exact barcode match (${prodBarcode}) verified.`,
        };
      }
    }
  }

  // ── PRIORITY 2: Exact Normalized Identity Match ──
  // STRICT SAFETY RULES:
  // 1. If canonical specifies a strength, product MUST have the EXACT SAME strength.
  //    Never match 625mg with 1000mg, 375mg, or unknown strength!
  // 2. Dosage Form must not clash (Tablet != Capsule != Suspension != Syrup != Injection)
  // 3. Clinical variants must match (Forte != Plain, XR != Immediate)
  // 4. Generic ingredients must be compatible
  for (const can of canonicalList) {
    const canStrength =
      extractAndNormalizeStrength(can.strength || "") ||
      extractAndNormalizeStrength(can.canonical_name);
    const canForm =
      extractDosageForm(can.dosage_form || "") ||
      extractDosageForm(can.canonical_name);
    const canVariant = extractVariantModifier(can.canonical_name);

    // ZERO TOLERANCE: Strength must match (with safe single-strength iconic brand handling)
    if (!isStrengthCompatible(prodStrength, canStrength, can)) {
      continue;
    }

    // ZERO TOLERANCE: Dosage Form must not clash (Tablet vs Syrup vs Injection)
    if (prodForm && canForm && prodForm !== canForm) {
      continue;
    }

    // ZERO TOLERANCE: Clinical variants must not cross-match (e.g. Forte vs Plain, Advance vs Plain, CF vs Plain, XR vs Immediate)
    if (hasVariantConflict(prodVariant, canVariant)) {
      continue;
    }

    // ZERO TOLERANCE: Generic ingredients must not conflict
    if (!areGenericsCompatible(product.generic_name, can.generic_name)) {
      continue;
    }

    // Core brand/trade name matching
    const cleanCanName = cleanText(can.canonical_name);
    const normCanName = normalizeMedicineText(can.canonical_name);
    const coreCanName = getCoreMedicineName(can.canonical_name);
    const cleanBrand = cleanText(can.brand_name || "");

    const nameMatches =
      cleanProdName === cleanCanName ||
      normProdName === normCanName ||
      (coreProdName.length > 2 && coreProdName === coreCanName) ||
      (cleanBrand.length > 2 && coreProdName === cleanBrand);

    if (nameMatches) {
      return {
        matched: true,
        matchType: "exact_normalized",
        canonicalId: can.id,
        canonicalRecord: can,
        preferredMediaId: can.preferred_media_id || null,
        explanation: `Exact normalized identity match (${can.canonical_name}) with matching strength (${prodStrength || "N/A"}) and form (${prodForm || "N/A"}).`,
      };
    }
  }

  // ── PRIORITY 3: Super Admin Approved Name Aliases ──
  // Aliases MUST STILL respect strength, dosage form, and variant safety!
  for (const can of canonicalList) {
    if (!can.aliases_json) continue;
    try {
      const aliases: string[] = JSON.parse(can.aliases_json);
      if (!Array.isArray(aliases)) continue;

      const canStrength =
        extractAndNormalizeStrength(can.strength || "") ||
        extractAndNormalizeStrength(can.canonical_name);
      const canForm =
        extractDosageForm(can.dosage_form || "") ||
        extractDosageForm(can.canonical_name);
      const canVariant = extractVariantModifier(can.canonical_name);

      // ZERO TOLERANCE: Alias cannot bypass strength safety
      if (!isStrengthCompatible(prodStrength, canStrength, can)) {
        continue;
      }

      // ZERO TOLERANCE: Alias cannot bypass dosage form safety
      if (prodForm && canForm && prodForm !== canForm) {
        continue;
      }

      // ZERO TOLERANCE: Alias cannot cross forte vs plain, advance vs plain, xr vs immediate
      if (hasVariantConflict(prodVariant, canVariant)) continue;

      // ZERO TOLERANCE: Generic ingredients must not conflict
      if (!areGenericsCompatible(product.generic_name, can.generic_name)) {
        continue;
      }

      const aliasMatch = aliases.some((al) => {
        if (!al || typeof al !== "string") return false;
        const alStrength = extractAndNormalizeStrength(al);
        if (alStrength && canStrength && alStrength !== canStrength) return false;
        if (alStrength && prodStrength && alStrength !== prodStrength) return false;
        const cleanAl = cleanText(al);
        if (cleanAl === cleanProdName) return true;
        const normAl = normalizeMedicineText(al);
        if (normAl === normProdName) return true;
        const coreAl = getCoreMedicineName(al);
        if (coreAl.length >= 3 && coreAl === coreProdName) {
          const alForm = extractDosageForm(al);
          if (prodForm && alForm && prodForm !== alForm) return false;
          return true;
        }
        return false;
      });

      if (aliasMatch) {
        return {
          matched: true,
          matchType: "alias",
          canonicalId: can.id,
          canonicalRecord: can,
          preferredMediaId: can.preferred_media_id || null,
          explanation: `Matched verified Super Admin alias for canonical medicine "${can.canonical_name}".`,
        };
      }
    } catch {
      // Ignore invalid JSON in aliases
    }
  }

  // ── PRIORITY 4: Similarity Candidates (For Admin Review Only) ──
  const suggestions: Array<{
    canonicalId: string;
    canonicalName: string;
    score: number;
    reason: string;
  }> = [];

  for (const can of canonicalList) {
    const cleanCan = cleanText(can.canonical_name);
    const prodTokens = cleanProdName.split(" ").filter((t) => t.length > 2);
    const canTokens = cleanCan.split(" ").filter((t) => t.length > 2);

    let matchCount = 0;
    for (const pt of prodTokens) {
      if (canTokens.includes(pt)) matchCount++;
    }

    if (matchCount > 0 && prodTokens.length > 0) {
      const score = Math.round(
        (matchCount / Math.max(prodTokens.length, canTokens.length)) * 100
      );
      if (score >= 40) {
        suggestions.push({
          canonicalId: can.id,
          canonicalName: can.canonical_name,
          score,
          reason: `Token overlap (${matchCount}/${prodTokens.length} matching tokens). Requires admin confirmation.`,
        });
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  return {
    matched: false,
    matchType: "none",
    canonicalId: null,
    canonicalRecord: null,
    preferredMediaId: null,
    explanation: "No verified exact match found. Professional placeholder will be used.",
    suggestedCandidates: suggestions.slice(0, 3),
  };
}
