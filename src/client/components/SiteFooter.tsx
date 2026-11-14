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
    `Community pharmacy serving ${sf.city} with counter-verified medicines, surgical supplies, and local healthcare fulfillment.`
  );

  const scheduleSummary = openingHours?.is_24_hours
    ? "Open 24 Hours, 7 Days a Week"
    : openingHours?.mon_sat || "Mon – Sat: 09:00 AM – 11:00 PM";

  return (
    <footer className="sf-surface-footer mt-16 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12">
          {/* Column 1: Pharmacy Identity */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3.5">
              {branding?.logo_url && !logoFailed ? (
                <div className="w-11 h-11 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-sm">
                  <img
                    src={branding.logo_url}
                    alt={displayName}
                    onError={() => setLogoFailed(true)}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center bg-white/12 border border-white/20 relative shrink-0"
                >
                  <span className="sf-heading text-xs font-bold text-white">
                    {getPharmacyMonogram(displayName)}
                  </span>
                  <span
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md flex items-center justify-center text-[#172B36]"
                    style={{ backgroundColor: "var(--sf-warm-accent)" }}
                  >
                    <PharmacyCrossIcon className="w-2.5 h-2.5" />
                  </span>
                </div>
              )}
              <div>
                <p className="sf-heading text-lg font-bold text-white leading-tight">
                  {displayName}
                </p>
                <p className="text-xs text-[#B9D6CE]">{sf.city}, Pakistan</p>
              </div>
            </div>

            <p className="text-sm text-[#C7DFD9] leading-relaxed max-w-sm">{footerDesc}</p>

            {(sf.pharmacist_name || sf.drug_sale_license_no) && (
              <div className="pt-1 space-y-1.5 text-xs text-[#B9D6CE]">
                {sf.pharmacist_name && (
                  <p className="flex items-center gap-1.5">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-[#E6A65B] shrink-0" />
                    <span>
                      Pharmacist:{" "}
                      <strong className="text-white font-semibold">{sf.pharmacist_name}</strong>
                    </span>
                  </p>
                )}
                {sf.drug_sale_license_no && (
                  <p className="flex items-center gap-1.5">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-[#E6A65B] shrink-0" />
                    <span>
                      License:{" "}
                      <strong className="text-white font-mono font-semibold">
                        {sf.drug_sale_license_no}
                      </strong>
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Shop & Ordering */}
          <div className="lg:col-span-2 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#FFF8ED]">
              Shop & Orders
            </h3>
            <ul className="space-y-2.5 text-sm text-[#C7DFD9]">
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("home")}
                  className="hover:text-white transition"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="hover:text-white transition"
                >
                  Medicines Catalog
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("delivery")}
                  className="hover:text-white transition"
                >
                  Delivery & Pickup
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("track")}
                  className="hover:text-[#E6A65B] font-medium transition"
                >
                  Track Online Order
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Pharmacy Info */}
          <div className="lg:col-span-2 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#FFF8ED]">
              Pharmacy
            </h3>
            <ul className="space-y-2.5 text-sm text-[#C7DFD9]">
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("about")}
                  className="hover:text-white transition"
                >
                  About Us
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("branches")}
                  className="hover:text-white transition"
                >
                  Locations
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("contact")}
                  className="hover:text-white transition"
                >
                  Contact Us
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectView("hours")}
                  className="hover:text-white transition"
                >
                  Business Hours
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Contact & Counter Hours */}
          <div className="lg:col-span-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#FFF8ED]">
              Counter & Assistance
            </h3>
            <div className="space-y-3 text-sm text-[#C7DFD9]">
              {sf.address_line && (
                <div className="flex items-start gap-2.5">
                  <MapPinIcon className="w-4 h-4 shrink-0 mt-0.5 text-[#E6A65B]" />
                  <span>
                    {sf.address_line}, {sf.city}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <ClockIcon className="w-4 h-4 shrink-0 text-[#E6A65B]" />
                <span>{scheduleSummary}</span>
              </div>

              {sf.contact_email && (
                <div className="flex items-center gap-2.5">
                  <MailIcon className="w-4 h-4 shrink-0 text-[#E6A65B]" />
                  <a
                    href={`mailto:${sf.contact_email}`}
                    className="hover:text-white transition truncate"
                  >
                    {sf.contact_email}
                  </a>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {sf.contact_phone && (
                  <a
                    href={`tel:${sf.contact_phone}`}
                    className="h-9 px-3.5 rounded-xl bg-white/10 hover:bg-white/18 border border-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition tabular-nums"
                  >
                    <PhoneIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                    <span>{sf.contact_phone}</span>
                  </a>
                )}

                {whatsappDigits && (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-3.5 rounded-xl sf-btn-warm text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legal & Policy Bar */}
        <div className="mt-12 pt-6 border-t border-white/12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#A7C8BF]">
          <div className="space-y-1">
            <p>
              © {year} <strong className="font-semibold text-white">{displayName}</strong>. All
              rights reserved.
            </p>
            {settings?.legal_disclaimer_text && (
              <p className="text-[11.5px] text-[#9BBDB3] max-w-2xl">
                {settings.legal_disclaimer_text}
              </p>
            )}
          </div>
          <div className="flex items-center gap-5 shrink-0 font-medium text-[#C7DFD9]">
            <button
              type="button"
              onClick={() => onSelectView("privacy")}
              className="hover:text-white transition"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onSelectView("terms")}
              className="hover:text-white transition"
            >
              Terms & Conditions
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
