import type {
  StorefrontBrandingRecord,
  StorefrontPublicContext,
} from "../../shared/types";

export interface Invoice80mmItemInput {
  product_name?: string | null;
  product_name_snapshot?: string | null;
  name?: string | null;
  selling_unit_name?: string | null;
  unit_label_snapshot?: string | null;
  unit_label?: string | null;
  sku_code_snapshot?: string | null;
  qty: number;
  unit_price_pkr?: number | null;
  line_total_pkr: number;
  requires_prescription?: boolean | number | null;
}

export interface Invoice80mmOrderInput {
  order_number: string;
  pos_invoice_number?: string | null;
  status?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_phone_masked?: string | null;
  customer_email?: string | null;
  fulfillment_type?: "delivery" | "pickup" | string | null;
  branch_name_snapshot?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_instructions?: string | null;
  customer_notes?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  subtotal_pkr?: number | null;
  discount_pkr?: number | null;
  delivery_fee_pkr?: number | null;
  total_pkr: number;
  cod_paid_amount_pkr?: number | null;
  cod_balance_due_pkr?: number | null;
  applied_promo_code?: string | null;
  items?: Invoice80mmItemInput[];
}

interface EmbeddedJpegLogo {
  bytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  displayWidthPt: number;
  displayHeightPt: number;
}

const PAGE_WIDTH_PT = 226.77; // Exact 80mm thermal roll width (80 / 25.4 * 72)
const MARGIN_X_PT = 11;
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - MARGIN_X_PT * 2; // 204.77pt

function sanitizePdfWinAnsi(input: unknown): string {
  const raw = String(input ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\u2014|\u2013/g, "-")
    .replace(/\u2022/g, "|")
    .replace(/\u00D7/g, "x")
    .replace(/\u2212/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Keep printable WinAnsi / ASCII range safely
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      out += raw[i];
    } else if (code === 160) {
      out += " ";
    }
  }
  return out;
}

function escapePdfLiteral(text: string): string {
  return sanitizePdfWinAnsi(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function estimateCharWidthRatio(ch: string, bold: boolean): number {
  if (ch === " ") return 0.278;
  if ("ilI1.,:;|!'`".includes(ch)) return bold ? 0.31 : 0.278;
  if ("ftrj()[]{}-".includes(ch)) return bold ? 0.37 : 0.333;
  if ("mwMW@%".includes(ch)) return bold ? 0.86 : 0.81;
  if (ch >= "A" && ch <= "Z") return bold ? 0.70 : 0.66;
  if (ch >= "0" && ch <= "9") return 0.556;
  return bold ? 0.57 : 0.53;
}

function measureTextWidthPt(text: string, fontSize: number, bold = false): number {
  const clean = sanitizePdfWinAnsi(text);
  let units = 0;
  for (let i = 0; i < clean.length; i++) {
    units += estimateCharWidthRatio(clean[i], bold);
  }
  return units * fontSize;
}

function wrapTextToWidth(
  text: string,
  maxWidthPt: number,
  fontSize: number,
  bold = false
): string[] {
  const clean = sanitizePdfWinAnsi(text);
  if (!clean) return [];
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidthPt(candidate, fontSize, bold) <= maxWidthPt) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // Break ultra-long single tokens if needed
      if (measureTextWidthPt(word, fontSize, bold) > maxWidthPt) {
        let chunk = "";
        for (const ch of word) {
          if (measureTextWidthPt(chunk + ch, fontSize, bold) <= maxWidthPt) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function hexToRgb01(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  const cleaned = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return fallback;
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3))];
}

function formatPkr(amount: number | null | undefined): string {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatReceiptDateTime(iso?: string | null): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return new Date().toLocaleString("en-GB");
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }
}

function formatPaymentMethodLabel(method?: string | null): string {
  const m = String(method || "cod").toLowerCase();
  if (m === "cod") return "Cash on Delivery (COD)";
  if (m === "counter_pay") return "Pay at Pharmacy Counter";
  if (m === "bank_transfer") return "Bank Transfer / Raast";
  return m.replace(/_/g, " ").toUpperCase();
}

function formatPaymentStatusLabel(status?: string | null): string {
  const s = String(status || "pending_cod").toLowerCase();
  if (s === "paid") return "PAID";
  if (s === "pending_cod") return "COD - Payable on Receipt";
  if (s === "partially_paid") return "Partially Paid";
  if (s === "refunded") return "Refunded";
  return "Unpaid / Pending";
}

async function loadLogoAsJpegBytes(logoUrl?: string | null): Promise<EmbeddedJpegLogo | null> {
  if (!logoUrl || typeof window === "undefined") return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), 4500);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const srcW = Math.max(1, img.naturalWidth || img.width || 120);
        const srcH = Math.max(1, img.naturalHeight || img.height || 120);

        // Render onto high-DPI white-backed canvas so transparent PNG/WebP logos look crisp
        const maxCanvasW = 360;
        const maxCanvasH = 180;
        const scale = Math.min(maxCanvasW / srcW, maxCanvasH / srcH, 3);
        const canvasW = Math.max(24, Math.round(srcW * scale));
        const canvasH = Math.max(24, Math.round(srcH * scale));

        const canvas = document.createElement("canvas");
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvasW, canvasH);

        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.94);
        const commaIdx = jpegDataUrl.indexOf(",");
        const b64 = commaIdx >= 0 ? jpegDataUrl.slice(commaIdx + 1) : jpegDataUrl;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }

        // Display size in PDF points on 80mm roll
        const maxDispW = 76;
        const maxDispH = 38;
        const dispScale = Math.min(maxDispW / srcW, maxDispH / srcH);
        const displayWidthPt = Number(Math.max(22, srcW * dispScale).toFixed(2));
        const displayHeightPt = Number(Math.max(18, srcH * dispScale).toFixed(2));

        resolve({
          bytes,
          pixelWidth: canvasW,
          pixelHeight: canvasH,
          displayWidthPt,
          displayHeightPt,
        });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = logoUrl;
  });
}

type DrawOp = (pageHeightPt: number) => string;

export async function downloadStorefront80mmInvoicePdf(params: {
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  displayName: string;
  order: Invoice80mmOrderInput;
  promoCode?: string | null;
}): Promise<void> {
  const { sf, branding, displayName, order, promoCode } = params;
  const logo = await loadLogoAsJpegBytes(branding?.logo_url);
  const brandRgb = hexToRgb01(branding?.primary_color, [0.09, 0.42, 0.345]); // #176B58
  const darkRgb: [number, number, number] = [0.082, 0.157, 0.231]; // #15283B
  const mutedRgb: [number, number, number] = [0.34, 0.41, 0.49]; // #57687D

  const ops: DrawOp[] = [];
  let curY = 0; // Top-down Y coordinate in points

  const pushRectFill = (
    x: number,
    topY: number,
    w: number,
    h: number,
    rgb: [number, number, number],
    strokeRgb?: [number, number, number],
    lineWidth = 0.6
  ) => {
    ops.push((H) => {
      const pdfY = (H - topY - h).toFixed(2);
      const fillCmd = `${rgb[0]} ${rgb[1]} ${rgb[2]} rg`;
      if (strokeRgb) {
        return `q ${fillCmd} ${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG ${lineWidth} w ${x.toFixed(2)} ${pdfY} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`;
      }
      return `q ${fillCmd} ${x.toFixed(2)} ${pdfY} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`;
    });
  };

  const pushLine = (
    x1: number,
    topY: number,
    x2: number,
    rgb: [number, number, number],
    dashed = false,
    lineWidth = 0.6
  ) => {
    ops.push((H) => {
      const py = (H - topY).toFixed(2);
      const dashCmd = dashed ? "[2.2 2.0] 0 d" : "[] 0 d";
      return `q ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineWidth} w ${dashCmd} ${x1.toFixed(2)} ${py} m ${x2.toFixed(2)} ${py} l S Q`;
    });
  };

  const pushText = (
    text: string,
    x: number,
    baselineTopY: number,
    fontSize: number,
    opts?: {
      bold?: boolean;
      mono?: boolean;
      align?: "left" | "center" | "right";
      rgb?: [number, number, number];
    }
  ) => {
    const clean = sanitizePdfWinAnsi(text);
    if (!clean) return;
    const bold = Boolean(opts?.bold);
    const mono = Boolean(opts?.mono);
    const fontKey = mono ? "/F3" : bold ? "/F2" : "/F1";
    const rgb = opts?.rgb || darkRgb;
    const align = opts?.align || "left";
    const width = mono
      ? clean.length * fontSize * 0.6
      : measureTextWidthPt(clean, fontSize, bold);

    let drawX = x;
    if (align === "center") drawX = x - width / 2;
    else if (align === "right") drawX = x - width;

    ops.push((H) => {
      const py = (H - baselineTopY).toFixed(2);
      return `BT ${fontKey} ${fontSize.toFixed(2)} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg 1 0 0 1 ${drawX.toFixed(2)} ${py} Tm (${escapePdfLiteral(clean)}) Tj ET`;
    });
  };

  // 1. Top Brand Accent Stripe
  pushRectFill(0, 0, PAGE_WIDTH_PT, 4, brandRgb);
  curY = 12;

  // 2. Centered Pharmacy Logo (if present)
  if (logo) {
    const logoX = (PAGE_WIDTH_PT - logo.displayWidthPt) / 2;
    const logoTopY = curY;
    const w = logo.displayWidthPt;
    const h = logo.displayHeightPt;
    ops.push((H) => {
      const py = (H - logoTopY - h).toFixed(2);
      return `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${logoX.toFixed(2)} ${py} cm /ImLogo Do Q`;
    });
    curY += h + 7;
  } else {
    curY += 2;
  }

  // 3. Pharmacy Name & Official Contact Header
  const headerName = (displayName || sf.pharmacy_name || "PHARMACY").toUpperCase();
  const nameLines = wrapTextToWidth(headerName, CONTENT_WIDTH_PT, 11.5, true);
  for (const ln of nameLines) {
    curY += 11;
    pushText(ln, PAGE_WIDTH_PT / 2, curY, 11.5, {
      bold: true,
      align: "center",
      rgb: darkRgb,
    });
  }

  const fullAddress = [sf.address_line, sf.city].filter(Boolean).join(", ");
  if (fullAddress) {
    const addrLines = wrapTextToWidth(fullAddress, CONTENT_WIDTH_PT - 8, 7.3, false);
    curY += 3;
    for (const ln of addrLines) {
      curY += 9;
      pushText(ln, PAGE_WIDTH_PT / 2, curY, 7.3, {
        align: "center",
        rgb: mutedRgb,
      });
    }
  }

  if (sf.contact_phone) {
    curY += 9.5;
    pushText(`Tel: ${sf.contact_phone}`, PAGE_WIDTH_PT / 2, curY, 7.5, {
      bold: true,
      align: "center",
      rgb: darkRgb,
    });
  }

  if (sf.drug_sale_license_no) {
    curY += 9;
    pushText(`License: ${sf.drug_sale_license_no}`, PAGE_WIDTH_PT / 2, curY, 6.8, {
      align: "center",
      rgb: mutedRgb,
    });
  }

  // Invoice Title Pill
  curY += 7;
  pushRectFill(
    MARGIN_X_PT + 20,
    curY,
    CONTENT_WIDTH_PT - 40,
    14,
    [0.937, 0.969, 0.953],
    brandRgb,
    0.6
  );
  pushText("ONLINE ORDER INVOICE", PAGE_WIDTH_PT / 2, curY + 9.7, 7.4, {
    bold: true,
    align: "center",
    rgb: brandRgb,
  });
  curY += 20;

  pushLine(MARGIN_X_PT, curY, PAGE_WIDTH_PT - MARGIN_X_PT, [0.75, 0.81, 0.85], true, 0.7);
  curY += 5;

  // 4. Order & Customer Metadata Rows
  const addMetaRow = (label: string, value: string, monoVal = false, boldVal = true) => {
    const cleanVal = sanitizePdfWinAnsi(value);
    if (!cleanVal) return;
    const valMaxW = CONTENT_WIDTH_PT - 62;
    const valLines = wrapTextToWidth(cleanVal, valMaxW, 7.4, boldVal);
    curY += 10;
    pushText(label, MARGIN_X_PT, curY, 7.2, { rgb: mutedRgb });
    pushText(valLines[0] || cleanVal, PAGE_WIDTH_PT - MARGIN_X_PT, curY, 7.4, {
      bold: boldVal,
      mono: monoVal,
      align: "right",
      rgb: darkRgb,
    });
    for (let i = 1; i < valLines.length; i++) {
      curY += 8.8;
      pushText(valLines[i], PAGE_WIDTH_PT - MARGIN_X_PT, curY, 7.2, {
        bold: boldVal,
        align: "right",
        rgb: darkRgb,
      });
    }
  };

  addMetaRow("Order Ref:", order.order_number, true, true);
  if (order.pos_invoice_number) {
    addMetaRow("POS Invoice:", order.pos_invoice_number, true, true);
  }
  addMetaRow("Date & Time:", formatReceiptDateTime(order.created_at), false, false);
  if (order.customer_name) {
    addMetaRow("Customer:", order.customer_name, false, true);
  }
  const phoneDisplay = order.customer_phone || order.customer_phone_masked || "";
  if (phoneDisplay) {
    addMetaRow("Phone:", phoneDisplay, false, false);
  }
  if (order.customer_email) {
    addMetaRow("Email:", order.customer_email, false, false);
  }

  curY += 6;

  // 5. Boxed Fulfillment & Payment Block (POS Receipt Style)
  const isPickup = String(order.fulfillment_type || "").toLowerCase() === "pickup";
  const fulfillHeader = isPickup ? "FULFILLMENT: COUNTER PICKUP" : "FULFILLMENT: HOME DELIVERY";
  const detailLines: string[] = [];

  if (isPickup) {
    const branchText =
      order.branch_name_snapshot || `${displayName}${sf.city ? ` (${sf.city})` : ""}`;
    detailLines.push(...wrapTextToWidth(`Counter: ${branchText}`, CONTENT_WIDTH_PT - 12, 7.0));
  } else if (order.delivery_address) {
    const addrFull = [order.delivery_address, order.delivery_city].filter(Boolean).join(", ");
    detailLines.push(...wrapTextToWidth(`Deliver To: ${addrFull}`, CONTENT_WIDTH_PT - 12, 7.0));
    if (order.delivery_instructions) {
      detailLines.push(
        ...wrapTextToWidth(`Note: ${order.delivery_instructions}`, CONTENT_WIDTH_PT - 12, 6.8)
      );
    }
  }
  detailLines.push(
    ...wrapTextToWidth(
      `Payment: ${formatPaymentMethodLabel(order.payment_method)}`,
      CONTENT_WIDTH_PT - 12,
      7.0
    )
  );

  const boxHeight = 15 + detailLines.length * 8.6 + 4;
  pushRectFill(
    MARGIN_X_PT,
    curY,
    CONTENT_WIDTH_PT,
    boxHeight,
    [0.973, 0.98, 0.976],
    [0.82, 0.87, 0.85],
    0.6
  );
  pushText(fulfillHeader, MARGIN_X_PT + 6, curY + 10, 7.3, {
    bold: true,
    rgb: brandRgb,
  });
  let boxLineY = curY + 10.5;
  for (const dl of detailLines) {
    boxLineY += 8.6;
    pushText(dl, MARGIN_X_PT + 6, boxLineY, 6.9, { rgb: darkRgb });
  }
  curY += boxHeight + 7;

  // 6. POS 4-Column Itemized Table Header
  // Columns: Item (x = 11..114, w=103), Qty (right @ 136), Rate (right @ 172), Total (right @ 215.77)
  const colItemX = MARGIN_X_PT + 3;
  const colQtyRightX = MARGIN_X_PT + 123;
  const colRateRightX = MARGIN_X_PT + 160;
  const colTotalRightX = PAGE_WIDTH_PT - MARGIN_X_PT - 2;

  pushRectFill(MARGIN_X_PT, curY, CONTENT_WIDTH_PT, 14, darkRgb);
  const thBaseline = curY + 9.5;
  const whiteRgb: [number, number, number] = [1, 1, 1];
  pushText("ITEM & UNIT", colItemX, thBaseline, 6.9, { bold: true, rgb: whiteRgb });
  pushText("QTY", colQtyRightX, thBaseline, 6.9, { bold: true, align: "right", rgb: whiteRgb });
  pushText("RATE", colRateRightX, thBaseline, 6.9, { bold: true, align: "right", rgb: whiteRgb });
  pushText("TOTAL", colTotalRightX, thBaseline, 6.9, { bold: true, align: "right", rgb: whiteRgb });
  curY += 16;

  // Item Rows
  const items = Array.isArray(order.items) ? order.items : [];
  let computedSubtotal = 0;

  items.forEach((it, idx) => {
    const rawName =
      it.product_name_snapshot || it.product_name || it.name || `Medicine Item #${idx + 1}`;
    const unitName =
      it.selling_unit_name || it.unit_label_snapshot || it.unit_label || "Unit";
    const qty = Math.max(1, Number(it.qty || 1));
    const lineTotal = Number(it.line_total_pkr || 0);
    computedSubtotal += lineTotal;
    const unitRate =
      it.unit_price_pkr !== undefined && it.unit_price_pkr !== null
        ? Number(it.unit_price_pkr)
        : Number((lineTotal / qty).toFixed(2));
    const isRx = Boolean(Number(it.requires_prescription || 0) === 1 || it.requires_prescription === true);

    const wrappedItemName = wrapTextToWidth(rawName, 100, 7.5, true);
    curY += 9.5;

    // First line: Name + Qty + Rate + Line Total
    pushText(wrappedItemName[0] || rawName, colItemX, curY, 7.5, { bold: true, rgb: darkRgb });
    pushText(String(qty), colQtyRightX, curY, 7.4, { align: "right", rgb: darkRgb });
    pushText(formatPkr(unitRate), colRateRightX, curY, 7.2, { align: "right", rgb: mutedRgb });
    pushText(formatPkr(lineTotal), colTotalRightX, curY, 7.5, {
      bold: true,
      align: "right",
      rgb: darkRgb,
    });

    for (let wIdx = 1; wIdx < wrappedItemName.length; wIdx++) {
      curY += 8.5;
      pushText(wrappedItemName[wIdx], colItemX, curY, 7.4, { bold: true, rgb: darkRgb });
    }

    // Unit & Rx Sub-caption
    curY += 8.2;
    const subCaption = `Unit: ${unitName}${isRx ? " | [Rx]" : ""}`;
    pushText(subCaption, colItemX, curY, 6.6, { rgb: mutedRgb });

    curY += 4.5;
    if (idx < items.length - 1) {
      pushLine(MARGIN_X_PT, curY, PAGE_WIDTH_PT - MARGIN_X_PT, [0.89, 0.92, 0.91], false, 0.45);
    }
  });

  curY += 3;
  pushLine(MARGIN_X_PT, curY, PAGE_WIDTH_PT - MARGIN_X_PT, [0.72, 0.79, 0.83], true, 0.75);
  curY += 4;

  // 7. Totals & Promo Discount Breakdown
  const subtotalPkr =
    order.subtotal_pkr !== undefined && order.subtotal_pkr !== null
      ? Number(order.subtotal_pkr)
      : computedSubtotal;
  const discountPkr = Math.max(0, Number(order.discount_pkr || 0));
  const deliveryFeePkr = Math.max(0, Number(order.delivery_fee_pkr || 0));
  const totalPkr = Number(order.total_pkr || 0);
  const effectivePromoCode = (order.applied_promo_code || promoCode || "").trim().toUpperCase();

  const addSummaryRow = (
    label: string,
    val: string,
    opts?: { bold?: boolean; rgb?: [number, number, number] }
  ) => {
    curY += 10.2;
    pushText(label, MARGIN_X_PT + 2, curY, 7.6, {
      bold: opts?.bold,
      rgb: opts?.rgb || mutedRgb,
    });
    pushText(val, PAGE_WIDTH_PT - MARGIN_X_PT - 2, curY, 7.8, {
      bold: opts?.bold ?? true,
      align: "right",
      rgb: opts?.rgb || darkRgb,
    });
  };

  addSummaryRow(`Subtotal (${items.length} item${items.length === 1 ? "" : "s"}):`, `PKR ${formatPkr(subtotalPkr)}`);

  if (discountPkr > 0) {
    const promoLabel = effectivePromoCode
      ? `Promo Discount (${effectivePromoCode}):`
      : "Promo Discount:";
    addSummaryRow(promoLabel, `- PKR ${formatPkr(discountPkr)}`, {
      bold: true,
      rgb: brandRgb,
    });
  }

  addSummaryRow(
    isPickup ? "Counter Pickup:" : "Delivery Charges:",
    deliveryFeePkr === 0 ? "FREE" : `PKR ${formatPkr(deliveryFeePkr)}`
  );

  // Highlighted NET TOTAL Box
  curY += 6;
  pushRectFill(
    MARGIN_X_PT,
    curY,
    CONTENT_WIDTH_PT,
    21,
    [0.937, 0.969, 0.953],
    brandRgb,
    0.85
  );
  pushText("NET TOTAL", MARGIN_X_PT + 6, curY + 14, 9.2, {
    bold: true,
    rgb: darkRgb,
  });
  pushText(`PKR ${formatPkr(totalPkr)}`, PAGE_WIDTH_PT - MARGIN_X_PT - 6, curY + 14.2, 10.5, {
    bold: true,
    align: "right",
    rgb: brandRgb,
  });
  curY += 26;

  // Payment Status Summary Line
  const payStatusText = formatPaymentStatusLabel(order.payment_status);
  curY += 8;
  pushText("Payment Status:", MARGIN_X_PT + 2, curY, 7.1, { rgb: mutedRgb });
  pushText(payStatusText, PAGE_WIDTH_PT - MARGIN_X_PT - 2, curY, 7.2, {
    bold: true,
    align: "right",
    rgb: darkRgb,
  });

  if (order.customer_notes) {
    curY += 6;
    const noteLines = wrapTextToWidth(`Order Note: ${order.customer_notes}`, CONTENT_WIDTH_PT - 4, 6.8);
    for (const nl of noteLines) {
      curY += 8.4;
      pushText(nl, MARGIN_X_PT + 2, curY, 6.8, { rgb: mutedRgb });
    }
  }

  // 8. POS Footer
  curY += 8;
  pushLine(MARGIN_X_PT, curY, PAGE_WIDTH_PT - MARGIN_X_PT, [0.75, 0.81, 0.85], true, 0.7);

  curY += 11;
  pushText("Thank you — Get well soon!", PAGE_WIDTH_PT / 2, curY, 8.0, {
    bold: true,
    align: "center",
    rgb: darkRgb,
  });

  curY += 9.5;
  pushText(
    "Keep your Order Ref to track status online anytime.",
    PAGE_WIDTH_PT / 2,
    curY,
    6.7,
    { align: "center", rgb: mutedRgb }
  );

  curY += 9;
  pushText(
    "Powered by AivraSol Mediqoo Pharmacy POS",
    PAGE_WIDTH_PT / 2,
    curY,
    6.4,
    { bold: true, align: "center", rgb: mutedRgb }
  );

  const pageHeightPt = Math.max(290, Math.ceil(curY + 16));
  const contentStreamStr = ops.map((fn) => fn(pageHeightPt)).join("\n");

  // Assemble valid PDF 1.4 binary document with exact byte offsets
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // index 0 unused (free object)
  let byteLength = 0;

  const pushStr = (s: string) => {
    const b = encoder.encode(s);
    chunks.push(b);
    byteLength += b.byteLength;
  };
  const pushBin = (b: Uint8Array) => {
    chunks.push(b);
    byteLength += b.byteLength;
  };
  const startObj = (id: number) => {
    offsets[id] = byteLength;
    pushStr(`${id} 0 obj\n`);
  };
  const endObj = () => {
    pushStr(`\nendobj\n`);
  };

  // Header with high-bit binary comment per PDF 1.4 spec
  pushStr("%PDF-1.4\n");
  pushBin(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // Obj 1: Catalog
  startObj(1);
  pushStr("<< /Type /Catalog /Pages 2 0 R >>");
  endObj();

  // Obj 2: Pages
  startObj(2);
  pushStr("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  endObj();

  // Obj 3: Single continuous 80mm thermal roll page
  const xObjDict = logo ? " /XObject << /ImLogo 7 0 R >>" : "";
  startObj(3);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH_PT.toFixed(2)} ${pageHeightPt.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${xObjDict} >> /Contents 8 0 R >>`
  );
  endObj();

  // Obj 4, 5, 6: Standard Type1 Fonts (Helvetica, Helvetica-Bold, Courier-Bold)
  startObj(4);
  pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  endObj();

  startObj(5);
  pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  endObj();

  startObj(6);
  pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>");
  endObj();

  // Obj 7: Optional Embedded JPEG Logo XObject (or Null placeholder to keep object IDs fixed)
  startObj(7);
  if (logo) {
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${logo.pixelWidth} /Height ${logo.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.byteLength} >>\nstream\n`
    );
    pushBin(logo.bytes);
    pushStr("\nendstream");
  } else {
    pushStr("null");
  }
  endObj();

  // Obj 8: Page Content Stream
  const streamBytes = encoder.encode(contentStreamStr);
  startObj(8);
  pushStr(`<< /Length ${streamBytes.byteLength} >>\nstream\n`);
  pushBin(streamBytes);
  pushStr("\nendstream");
  endObj();

  // Xref Table
  const totalObjects = 9; // 0..8
  const xrefStart = byteLength;
  pushStr(`xref\n0 ${totalObjects}\n`);
  pushStr("0000000000 65535 f \n");
  for (let id = 1; id < totalObjects; id++) {
    const offStr = String(offsets[id] || 0).padStart(10, "0");
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  // Merge Uint8Array chunks and trigger download
  const pdfBytes = new Uint8Array(byteLength);
  let cursor = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  const safeOrderRef = String(order.order_number || "Order").replace(/[^A-Za-z0-9_-]/g, "");
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `Invoice-${safeOrderRef}-80mm.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

