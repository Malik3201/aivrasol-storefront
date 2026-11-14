import {
  cleanText,
  extractAndNormalizeStrength,
  extractDosageForm,
  extractVariantModifier,
  getCoreMedicineName,
  normalizeMedicineText,
} from "../../src/shared/medicine-identity-matcher";

export interface CandidateImage {
  title: string;
  image_url: string;
  source: string;
  license: string;
  rights_verified: boolean;
  attribution: string | null;
  width: number;
  height: number;
  confidence_score: number;
  strength_match: boolean;
  dosage_form_match: boolean;
  notes: string;
}

export interface SearchTargetMedicine {
  master_catalog_id: string;
  master_catalog_name: string;
  brand?: string | null;
  generic?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  manufacturer?: string | null;
}

const PERMITTED_LICENSES = [
  "cc-zero",
  "cc0",
  "public domain",
  "pd",
  "cc-by",
  "cc by",
  "cc-by-sa",
  "cc by-sa",
  "gfdl",
  "attribution",
];

function isPermittedLicense(licenseStr: string): boolean {
  const lower = licenseStr.toLowerCase();
  return PERMITTED_LICENSES.some((perm) => lower.includes(perm));
}

/**
 * Searches Wikimedia Commons / Wikipedia Shared Repository for verified medicine packshots.
 */
export async function searchWikimediaForMedicine(
  med: SearchTargetMedicine
): Promise<CandidateImage[]> {
  const candidates: CandidateImage[] = [];
  const exactMasterName = med.master_catalog_name;
  const targetStrength =
    extractAndNormalizeStrength(med.strength || "") ||
    extractAndNormalizeStrength(exactMasterName);
  const targetForm =
    extractDosageForm(med.dosage_form || "") ||
    extractDosageForm(exactMasterName);
  const targetVariant = extractVariantModifier(exactMasterName);
  const coreBrand = getCoreMedicineName(exactMasterName);

  // Formulate search queries in priority order:
  // 1. Exact Trade Name + Strength + Form/Medicine (e.g. "Panadol 500mg tablet", "Brufen 400mg medicine")
  // 2. Generic Name + Strength + Medicine (e.g. "Paracetamol 500mg medicine")
  const formOrMed = targetForm ? targetForm.toLowerCase() : "medicine";
  const queries: string[] = [];
  if (targetStrength) {
    queries.push(`${coreBrand} ${targetStrength} ${formOrMed}`);
    queries.push(`${coreBrand} ${targetStrength}`);
  } else {
    queries.push(`${coreBrand} ${formOrMed}`);
  }
  if (med.generic && targetStrength) {
    queries.push(`${med.generic} ${targetStrength} ${formOrMed}`);
  }

  // Deduplicate queries
  const distinctQueries = Array.from(new Set(queries.filter(Boolean))).slice(0, 2);

  for (const query of distinctQueries) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
        query
      )}&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime|extmetadata`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": "AivraSolMedicineImageCollector/1.0 (https://aivrasol.com; contact@aivrasol.com)",
        },
      });

      if (!res.ok) continue;
      const data: any = await res.json();
      const pages = data?.query?.pages || {};

      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        const imgInfo = page?.imageinfo?.[0];
        if (!imgInfo || !imgInfo.url) continue;

        const title: string = page.title || "";
        const mime: string = (imgInfo.mime || "").toLowerCase();

        // Strictly allow only photographic image MIME types
        const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedMimes.includes(mime)) {
          continue;
        }

        // Skip non-photographic illustrations or documents
        if (
          /\.(pdf|djvu|svg|ogg|oga|ogv|webm|mp4|tif|tiff)$/i.test(title) ||
          title.toLowerCase().includes("skeletal") ||
          title.toLowerCase().includes("structure") ||
          title.toLowerCase().includes("chemical") ||
          title.toLowerCase().includes("diagram")
        ) {
          continue;
        }

        const extMeta = imgInfo.extmetadata || {};
        const licenseShort = extMeta.LicenseShortName?.value || extMeta.License?.value || "Unknown";
        const artist = extMeta.Artist?.value?.replace(/<[^>]*>/g, "").trim() || extMeta.Credit?.value?.replace(/<[^>]*>/g, "").trim() || null;
        const rightsVerified = isPermittedLicense(licenseShort);

        // Clinical Safety Verification on candidate image title & description
        const candidateText = `${title} ${extMeta.ObjectName?.value || ""} ${extMeta.ImageDescription?.value || ""}`.toLowerCase();

        // Must relate to pharmaceutical medicine/packaging
        const hasMedicalContext = /\b(medicine|medication|drug|pharmaceutical|tablet|tablets|tab|capsule|capsules|cap|pill|pills|syrup|injection|inj|dose|dosage|bottle|blister|vial|pack|package|box)\b/i.test(
          candidateText
        );
        if (!hasMedicalContext) {
          continue;
        }

        const candStrength = extractAndNormalizeStrength(candidateText);
        const candForm = extractDosageForm(candidateText);
        const candVariant = extractVariantModifier(candidateText);

        // ZERO TOLERANCE: Strength conflict rejection
        let strengthMatch = true;
        if (targetStrength && candStrength && targetStrength !== candStrength) {
          // Reject! (e.g. target 500mg, found 250mg or 625mg)
          continue;
        }
        if (targetStrength && !candStrength) {
          strengthMatch = false; // strength unconfirmed in filename
        }

        // ZERO TOLERANCE: Clinical variant conflict rejection
        if (targetVariant && candVariant && targetVariant !== candVariant) {
          continue;
        }
        if (candVariant === "forte" && targetVariant !== "forte") {
          continue;
        }
        if (candVariant === "extra" && targetVariant !== "extra") {
          continue;
        }

        // Dosage form safety
        let formMatch = true;
        if (targetForm && candForm && targetForm !== candForm) {
          continue;
        }
        if (targetForm && !candForm) {
          formMatch = false;
        }

        // Compute confidence score
        let confidence = 0.70;
        if (rightsVerified) confidence += 0.15;
        if (targetStrength && candStrength === targetStrength) confidence += 0.10;
        if (targetForm && candForm === targetForm) confidence += 0.05;

        // Skip low confidence candidates
        if (confidence < 0.75) continue;

        candidates.push({
          title,
          image_url: imgInfo.url,
          source: "wikimedia_commons",
          license: licenseShort,
          rights_verified: rightsVerified,
          attribution: artist,
          width: Number(imgInfo.width || 0),
          height: Number(imgInfo.height || 0),
          confidence_score: Number(confidence.toFixed(2)),
          strength_match: strengthMatch,
          dosage_form_match: formMatch,
          notes: `Matched query "${query}" with license "${licenseShort}"`,
        });
      }
    } catch (err: any) {
      console.warn(`[WikimediaSource] Search error for query "${query}":`, err?.message || err);
    }
  }

  // Sort descending by confidence score
  return candidates.sort((a, b) => b.confidence_score - a.confidence_score);
}
