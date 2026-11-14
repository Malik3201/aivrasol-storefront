import {
  matchMedicineIdentity,
  extractAndNormalizeStrength,
  extractDosageForm,
  CanonicalMedicineRecord,
} from "../src/shared/medicine-identity-matcher";

const canonicalCatalog: CanonicalMedicineRecord[] = [
  {
    id: "cmed_panadol_500",
    canonical_name: "Panadol 500mg Tablets",
    brand_name: "Panadol",
    generic_name: "Paracetamol",
    strength: "500mg",
    dosage_form: "Tablet",
    manufacturer: "Haleon",
    pack_size: 100,
    pack_unit: "Tablet",
    barcode: "8964000123456",
    preferred_media_id: "sfm_panadol_500_shared",
    aliases_json: JSON.stringify(["Febrol 500mg Tablets", "Panadol Regular Tab"]),
  },
  {
    id: "cmed_panadol_syp",
    canonical_name: "Panadol Suspension 120ml",
    brand_name: "Panadol",
    generic_name: "Paracetamol",
    strength: "120mg/5ml",
    dosage_form: "Syrup",
    manufacturer: "Haleon",
    pack_size: 1,
    pack_unit: "Bottle",
    preferred_media_id: "sfm_panadol_syp_shared",
    aliases_json: JSON.stringify(["PANADOL LIQUID", "Panadol Baby Syrup"]),
  },
  {
    id: "cmed_brufen_400",
    canonical_name: "Brufen 400mg Tablets",
    brand_name: "Brufen",
    generic_name: "Ibuprofen",
    strength: "400mg",
    dosage_form: "Tablet",
    manufacturer: "Abbott",
    pack_size: 30,
    pack_unit: "Tablet",
    preferred_media_id: "sfm_brufen_400_shared",
  },
];

console.log("=== RUNNING MEDICINE IDENTITY MATCHER SAFETY TESTS ===");

// Test 1: Exact Barcode Match
const res1 = matchMedicineIdentity(
  {
    name: "Panadol 500",
    barcode: "8964000123456",
    strength: "500mg",
    dosage_form: "Tablet",
  },
  canonicalCatalog
);
console.log("Test 1 (Barcode Match):", res1.matched, res1.canonicalId === "cmed_panadol_500" ? "PASS" : "FAIL");

// Test 2: Strength Safety Constraint (250mg must NOT match 500mg)
const res2 = matchMedicineIdentity(
  {
    name: "Panadol 250mg Tablets",
    strength: "250mg",
    dosage_form: "Tablet",
  },
  canonicalCatalog
);
console.log("Test 2 (Strength Mismatch 250mg != 500mg):", !res2.matched ? "PASS (Safely Rejected)" : "FAIL");

// Test 3: Form Safety Constraint (Tablets must NOT match Syrup)
const res3 = matchMedicineIdentity(
  {
    name: "Panadol Liquid",
    strength: "120mg/5ml",
    dosage_form: "Tablet", // Deliberate mismatch
  },
  canonicalCatalog
);
console.log("Test 3 (Form Mismatch Tab != Syp):", !res3.matched ? "PASS (Safely Rejected)" : "FAIL");

// Test 4: Approved Alias Match (Febrol 500mg Tablets -> Panadol 500mg)
const res4 = matchMedicineIdentity(
  {
    name: "Febrol 500mg Tablets",
    strength: "500mg",
    dosage_form: "Tablet",
  },
  canonicalCatalog
);
console.log("Test 4 (Approved Alias Match):", res4.matched && res4.matchType === "alias" ? "PASS" : "FAIL");

// Test 5: Exact Normalized Match (Brufen 400mg Tablets)
const res5 = matchMedicineIdentity(
  {
    name: "Brufen 400mg Tablets",
    generic_name: "Ibuprofen",
    strength: "400mg",
    dosage_form: "Tablet",
    packing_label: "Box of 30 tab",
  },
  canonicalCatalog
);
console.log("Test 5 (Normalized Identity Match):", res5.matched && res5.canonicalId === "cmed_brufen_400" ? "PASS" : "FAIL");

// Test 6: Variant Difference (Panadol Extra must NOT match plain Panadol 500mg)
const res6 = matchMedicineIdentity(
  {
    name: "Panadol Extra 500mg Tablets",
    strength: "500mg",
    dosage_form: "Tablet",
  },
  canonicalCatalog
);
console.log("Test 6 (Variant Guard Panadol Extra != Panadol):", !res6.matched ? "PASS (Safely Rejected)" : "FAIL");

// Test 7: Unrelated Medicine Falls back to placeholder
const res7 = matchMedicineIdentity(
  {
    name: "Augmentin 625mg Tablets",
    strength: "625mg",
    dosage_form: "Tablet",
  },
  canonicalCatalog
);
console.log("Test 7 (Unknown Medicine Fallback):", !res7.matched ? "PASS (Uses Placeholder)" : "FAIL");
