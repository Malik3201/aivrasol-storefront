import React, { useMemo, useState } from "react";
import type { StorefrontBranchRecord, StorefrontPublicContext } from "../../shared/types";
import {
  CheckCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PhoneIcon,
  WhatsAppIcon,
} from "./Icons";

export interface ResolvedPharmacyPin {
  label: string;
  addressLine: string;
  city: string;
  phone: string | null;
  whatsappDigits: string;
  latitude: number | null;
  longitude: number | null;
  hasExactCoords: boolean;
  embedUrl: string;
  directionsUrl: string;
  openMapsUrl: string;
  fullAddressText: string;
}

function toValidCoord(val: unknown, min: number, max: number): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return Number(num.toFixed(6));
}

export function resolvePharmacyLocationPin(params: {
  sf: StorefrontPublicContext;
  displayName: string;
  branch?: Partial<StorefrontBranchRecord> & { branch_name?: string; contact_phone?: string | null };
  branches?: Array<Partial<StorefrontBranchRecord> & { branch_name?: string; contact_phone?: string | null }>;
}): ResolvedPharmacyPin {
  const { sf, displayName, branch, branches } = params;
  const fallbackMainBranch =
    branch ||
    branches?.find((b) => Number(b.is_main) === 1) ||
    branches?.[0];

  const lat =
    toValidCoord(branch?.latitude, -90, 90) ??
    toValidCoord(sf.latitude, -90, 90) ??
    toValidCoord(fallbackMainBranch?.latitude, -90, 90);
  const lng =
    toValidCoord(branch?.longitude, -180, 180) ??
    toValidCoord(sf.longitude, -180, 180) ??
    toValidCoord(fallbackMainBranch?.longitude, -180, 180);

  const hasExactCoords = lat !== null && lng !== null;

  const addressLine = String(
    branch?.address_line || sf.address_line || fallbackMainBranch?.address_line || ""
  ).trim();
  const city = String(
    branch?.city || sf.city || fallbackMainBranch?.city || "Pakistan"
  ).trim();
  const phone =
    String(
      branch?.contact_phone ||
        branch?.phone ||
        sf.contact_phone ||
        fallbackMainBranch?.phone ||
        ""
    ).trim() || null;
  const whatsappDigits = String(
    branch?.whatsapp_phone ||
      sf.whatsapp_phone ||
      phone ||
      ""
  ).replace(/[^0-9]/g, "");

  const label = String(branch?.branch_name || branch?.name || displayName).trim() || displayName;
  const fullAddressText = addressLine
    ? `${addressLine}, ${city}`
    : `${displayName}, ${city}, Pakistan`;

  const queryText = hasExactCoords
    ? `${lat},${lng}`
    : [displayName, addressLine, city, "Pakistan"].filter(Boolean).join(", ");

  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
    queryText
  )}&z=${hasExactCoords ? 17 : 15}&output=embed`;

  const directionsUrl = hasExactCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(queryText)}`;

  const openMapsUrl = hasExactCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;

  return {
    label,
    addressLine,
    city,
    phone,
    whatsappDigits,
    latitude: lat,
    longitude: lng,
    hasExactCoords,
    embedUrl,
    directionsUrl,
    openMapsUrl,
    fullAddressText,
  };
}

function DirectionsArrowIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}

interface PharmacyLocationMapProps {
  sf: StorefrontPublicContext;
  displayName: string;
  scheduleText: string;
  branches?: Array<
    Partial<StorefrontBranchRecord> & {
      branch_name?: string;
      contact_phone?: string | null;
    }
  >;
  variant?: "landing" | "locations";
  onOpenLocationsPage?: () => void;
  onOpenContactPage?: () => void;
}

export function PharmacyLocationMap({
  sf,
  displayName,
  scheduleText,
  branches = [],
  variant = "landing",
  onOpenLocationsPage,
  onOpenContactPage,
}: PharmacyLocationMapProps) {
  const [selectedBranchIdx, setSelectedBranchIdx] = useState(0);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const activeBranch = branches.length > 0 ? branches[selectedBranchIdx] || branches[0] : undefined;

  const pin = useMemo(
    () =>
      resolvePharmacyLocationPin({
        sf,
        displayName,
        branch: activeBranch,
        branches,
      }),
    [sf, displayName, activeBranch, branches]
  );

  const handleCopyAddress = () => {
    try {
      void navigator.clipboard?.writeText(pin.fullAddressText);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-[0_2px_16px_-6px_rgba(15,23,42,0.08)]">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left Details & Direct Navigation Column */}
        <div className="lg:col-span-5 p-4 sm:p-6 flex flex-col justify-between gap-4 border-b lg:border-b-0 lg:border-r border-[#E5E7EB]">
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold sf-badge-brand">
                <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{pin.hasExactCoords ? "Exact GPS Location" : `${pin.city} Pharmacy`}</span>
              </span>
              {pin.hasExactCoords && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10.5px] font-bold text-emerald-700">
                  <CheckCircleIcon className="w-3 h-3" />
                  <span>Verified Pin</span>
                </span>
              )}
            </div>

            <div>
              <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827] leading-snug">
                {variant === "landing" ? `Visit ${displayName}` : pin.label}
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Walk-in dispensing, fast online order pickup &amp; direct counter assistance
              </p>
            </div>

            {/* Multi-branch switcher pills on Locations page */}
            {variant === "locations" && branches.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {branches.map((b, idx) => {
                  const name = String(b.branch_name || b.name || `Branch ${idx + 1}`);
                  const active = idx === selectedBranchIdx;
                  return (
                    <button
                      key={b.id || idx}
                      type="button"
                      onClick={() => setSelectedBranchIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        active
                          ? "bg-[#111827] text-white"
                          : "bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB]"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Structured Counter Address / Hours / Phone */}
            <div className="rounded-xl bg-[#F9FAFB] border border-[#EDF0F3] p-3.5 space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5">
                <MapPinIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Address
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="text-[11px] font-bold sf-text-brand hover:underline"
                    >
                      {copiedAddr ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <p className="font-semibold text-[#111827] leading-snug mt-0.5">
                    {pin.fullAddressText}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <ClockIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280] block">
                    Hours
                  </span>
                  <span className="font-medium text-[#111827]">{scheduleText}</span>
                </div>
              </div>

              {pin.phone && (
                <div className="flex items-start gap-2.5">
                  <PhoneIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280] block">
                      Counter Phone
                    </span>
                    <a
                      href={`tel:${pin.phone}`}
                      className="font-bold text-[#111827] hover:underline tabular-nums"
                    >
                      {pin.phone}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Primary Navigation Actions */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
              <a
                href={pin.directionsUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="pharmacy-map-directions-btn"
                className="min-h-[44px] px-3.5 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
              >
                <DirectionsArrowIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Get Directions</span>
              </a>

              <a
                href={pin.openMapsUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="pharmacy-map-open-google-btn"
                className="min-h-[44px] px-3.5 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
              >
                <span>Open Google Maps</span>
                <ExternalLinkIcon className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>

            {variant === "landing" && (onOpenLocationsPage || onOpenContactPage) && (
              <div className="grid grid-cols-2 gap-2">
                {onOpenLocationsPage && (
                  <button
                    type="button"
                    onClick={onOpenLocationsPage}
                    className="min-h-[38px] px-3 rounded-xl bg-[#F6F7F9] hover:bg-[#ECEFF3] border border-[#E5E7EB] text-[#111827] text-xs font-bold transition"
                  >
                    Branch &amp; Pickup Info
                  </button>
                )}
                {pin.whatsappDigits ? (
                  <a
                    href={`https://wa.me/${pin.whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[38px] px-3 rounded-xl bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] text-[#065F46] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp</span>
                  </a>
                ) : onOpenContactPage ? (
                  <button
                    type="button"
                    onClick={onOpenContactPage}
                    className="min-h-[38px] px-3 rounded-xl bg-[#F6F7F9] hover:bg-[#ECEFF3] border border-[#E5E7EB] text-[#111827] text-xs font-bold transition"
                  >
                    Contact Pharmacy
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Right Live Interactive Google Map Embed */}
        <div className="lg:col-span-7 relative min-h-[260px] sm:min-h-[320px] lg:min-h-[360px] bg-[#EEF2F6]">
          <iframe
            key={pin.embedUrl}
            title={`Location map of ${pin.label}`}
            src={pin.embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            data-testid="pharmacy-location-map-iframe"
            className="w-full h-full min-h-[260px] sm:min-h-[320px] lg:min-h-[360px] border-0 block"
          />

          {/* Subtle floating GPS badge overlay */}
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-24px)]">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F172A]/88 backdrop-blur-sm text-white text-[11px] font-semibold shadow-md">
              <MapPinIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{pin.label}</span>
              {pin.hasExactCoords && (
                <span className="hidden sm:inline font-mono text-[10px] text-emerald-300 shrink-0">
                  · {pin.latitude}, {pin.longitude}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
