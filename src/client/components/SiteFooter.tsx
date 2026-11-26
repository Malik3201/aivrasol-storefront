import { useEffect, useState } from "react";
import type {
  StorefrontBrandingRecord,
  StorefrontPublicContext,
  StorefrontSettingsRecord,
} from "../../shared/types";
import { getPharmacyMonogram, sanitizePublicCopy } from "../design/theme";
import type { StorefrontView } from "../types-ui";
import {
  ClockIcon,
  MailIcon,
  MapPinIcon,
  PharmacyCrossIcon,
  PhoneIcon,
  ShieldCheckIcon,
  WhatsAppIcon,
} from "./Icons";

interface SiteFooterProps {
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  settings?: Partial<StorefrontSettingsRecord> | Record<string, any> | null;
  displayName: string;
  openingHours: Record<string, any>;
  onSelectView: (view: StorefrontView) => void;
}

export function SiteFooter({
  sf,
  branding,
  settings,
  displayName,
  openingHours,
  onSelectView,
}: SiteFooterProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
  }, [branding?.logo_url]);

  const year = new Date().getFullYear();
  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");

  const footerDesc = sanitizePublicCopy(
    branding?.footer_tagline || branding?.tagline,
    sf,
    `Licensed pharmacy serving ${sf.city} with counter-verified medicines, surgical supplies, and local home delivery.`
  );

  const scheduleSummary = openingHours?.is_24_hours
    ? "Open 24 Hours, 7 Days a Week"
    : openingHours?.mon_sat || "Mon – Sat: 09:00 AM – 11:00 PM";

  return (
    <footer className="bg-[#0B1220] text-[#D1D5DB] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-9 sm:py-12">
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-7 sm:gap-8 lg:gap-10">
          {/* Column 1: Pharmacy Identity */}
          <div className="col-span-2 lg:col-span-4 space-y-3.5">
            <div className="flex items-center gap-3">
              {branding?.logo_url && !logoFailed ? (
                <div className="w-10 h-10 rounded-lg bg-white p-1.5 flex items-center justify-center shrink-0">
                  <img
                    src={branding.logo_url}
                    alt={displayName}
                    onError={() => setLogoFailed(true)}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center relative shrink-0 text-white"
                  style={{ backgroundColor: "var(--sf-primary)" }}
                >
                  <span className="sf-heading text-xs font-extrabold">
                    {getPharmacyMonogram(displayName)}
                  </span>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded bg-white text-[#0B1220] flex items-center justify-center">
                    <PharmacyCrossIcon className="w-2.5 h-2.5" />
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="sf-heading text-base font-extrabold text-white leading-tight truncate">
                  {displayName}
                </p>
                <p className="text-xs text-[#9CA3AF]">{sf.city}, Pakistan</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed max-w-sm">
              {footerDesc}
            </p>

            {(sf.pharmacist_name || sf.drug_sale_license_no) && (
              <div className="pt-1 space-y-1 text-xs text-[#9CA3AF]">
                {sf.pharmacist_name && (
                  <p className="flex items-center gap-1.5">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      Pharmacist: <strong className="text-white">{sf.pharmacist_name}</strong>
                    </span>
                  </p>
                )}
                {sf.drug_sale_license_no && (
                  <p className="flex items-center gap-1.5">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      License:{" "}
                      <strong className="text-white font-mono">{sf.drug_sale_license_no}</strong>
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Shop & Ordering */}
          <div className="col-span-1 lg:col-span-2 space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">
              Shop &amp; Orders
            </h3>
            <ul className="space-y-1 text-xs sm:text-sm text-[#9CA3AF]">
              <li>
                <button type="button" onClick={() => onSelectView("home")} className="py-1.5 hover:text-white transition text-left">
                  Home
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onSelectView("shop")} className="py-1.5 hover:text-white transition text-left">
                  Medicines Catalog
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onSelectView("delivery")} className="py-1.5 hover:text-white transition text-left">
                  Delivery &amp; Pickup
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onSelectView("track")} className="py-1.5 text-emerald-400 hover:text-emerald-300 font-semibold transition text-left">
                  Track Order
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Pharmacy Info */}
          <div className="col-span-1 lg:col-span-2 space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">
              Pharmacy
            </h3>
            <ul className="space-y-1 text-xs sm:text-sm text-[#9CA3AF]">
              <li>
                <button type="button" onClick={() => onSelectView("about")} className="py-1.5 hover:text-white transition text-left">
                  About Us
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onSelectView("branches")} className="py-1.5 hover:text-white transition text-left">
                  Store Locations
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onSelectView("contact")} className="py-1.5 hover:text-white transition text-left">
                  Contact Us
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onSelectView("hours")} className="py-1.5 hover:text-white transition text-left">
                  Business Hours
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Counter Assistance */}
          <div className="col-span-2 lg:col-span-4 space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">
              Counter &amp; Support
            </h3>
            <div className="space-y-2.5 text-xs sm:text-sm text-[#9CA3AF]">
              {sf.address_line && (
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>
                    {sf.address_line}, {sf.city}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{scheduleSummary}</span>
              </div>

              {sf.contact_email && (
                <div className="flex items-center gap-2 min-w-0">
                  <MailIcon className="w-4 h-4 shrink-0 text-emerald-400" />
                  <a href={`mailto:${sf.contact_email}`} className="hover:text-white transition truncate">
                    {sf.contact_email}
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-1.5">
                {sf.contact_phone && (
                  <a
                    href={`tel:${sf.contact_phone}`}
                    className="min-h-[42px] sm:h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition active:scale-[0.97] tabular-nums"
                  >
                    <PhoneIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{sf.contact_phone}</span>
                  </a>
                )}

                {whatsappDigits && (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[42px] sm:h-9 px-3 rounded-lg sf-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legal Bar */}
        <div className="mt-8 sm:mt-10 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#9CA3AF]">
          <div className="space-y-1">
            <p>
              © {year} <strong className="font-semibold text-white">{displayName}</strong>. All rights reserved.
            </p>
            {settings?.legal_disclaimer_text && (
              <p className="text-[11px] text-[#6B7280] max-w-2xl">
                {settings.legal_disclaimer_text}
              </p>
            )}
          </div>
          <div className="flex items-center gap-5 shrink-0 font-medium">
            <button type="button" onClick={() => onSelectView("privacy")} className="py-1.5 hover:text-white transition">
              Privacy Policy
            </button>
            <button type="button" onClick={() => onSelectView("terms")} className="py-1.5 hover:text-white transition">
              Terms &amp; Conditions
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
