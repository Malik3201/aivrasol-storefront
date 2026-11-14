import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let sharpModule: any;
try {
  sharpModule = require("sharp");
} catch {
  sharpModule = require("../../../aivrasol-admin-nextjs/node_modules/sharp");
}

export interface OptimizedImageResult {
  buffer: Buffer;
  base64: string;
  sha256_hex: string;
  byte_size: number;
  width: number;
  height: number;
  mime_type: string;
  logical_file_name: string;
}

/**
 * Downloads, validates, sanitizes, and compresses a medicine photograph into ultra-lightweight WebP.
 * Strictly preserves aspect ratio and readable packaging text.
 * Targets: 25 - 60 KB for typical product packshot.
 */
export async function downloadAndOptimizeMedicineImage(
  sourceUrl: string,
  exactMasterCatalogName: string,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  }
): Promise<OptimizedImageResult | null> {
  const maxWidth = options?.maxWidth || 800;
  const maxHeight = options?.maxHeight || 800;
  const quality = options?.quality || 80;

  try {
    // 1. Safe bounded download with 15s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AivraSolMedicineImageCollector/1.0 (https://aivrasol.com; contact@aivrasol.com)",
        Accept: "image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[ImageOptimizer] Failed to fetch image: HTTP ${res.status} from ${sourceUrl}`);
      return null;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const arrayBuf = await res.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuf);

    // Sanity check: file size min 2 KB, max 12 MB
    if (inputBuffer.length < 2048 || inputBuffer.length > 12 * 1024 * 1024) {
      console.warn(`[ImageOptimizer] Rejected payload size: ${inputBuffer.length} bytes`);
      return null;
    }

    // 2. Validate image structure & dimensions with sharp
    const sharpInstance = sharpModule(inputBuffer, { failOnError: false });
    const metadata = await sharpInstance.metadata();

    if (!metadata.width || !metadata.height || metadata.width < 150 || metadata.height < 150) {
      console.warn(`[ImageOptimizer] Rejected thumbnail too small: ${metadata.width}x${metadata.height}`);
      return null;
    }

    // 3. Process image:
    // - Rotate according to EXIF
    // - Strip metadata / comments
    // - Resize inside 800x800 preserving proportions
    // - Convert to WebP with smart compression
    const { data: webpBuffer, info } = await sharpModule(inputBuffer, { failOnError: false })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer({ resolveWithObject: true });

    // 4. Compute SHA-256 for immutable content-addressed deduplication in R2
    const sha256Hex = crypto.createHash("sha256").update(webpBuffer).digest("hex");
    const safeLogicalName = `${exactMasterCatalogName.trim().replace(/[\\/:*?"<>|]/g, "_")}.webp`;

    return {
      buffer: webpBuffer,
      base64: webpBuffer.toString("base64"),
      sha256_hex: sha256Hex,
      byte_size: info.size,
      width: info.width,
      height: info.height,
      mime_type: "image/webp",
      logical_file_name: safeLogicalName,
    };
  } catch (err: any) {
    console.error(`[ImageOptimizer] Optimization failed for ${sourceUrl}:`, err?.message || err);
    return null;
  }
}
