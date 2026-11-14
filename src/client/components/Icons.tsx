import React from "react";
import { resolveProductStudioVisual } from "../design/editorialAssets";
import { cleanProductText } from "../design/theme";

interface IconProps {
  className?: string;
}

export function PharmacyCrossIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.5 4h5a1 1 0 0 1 1 1v4.5H20a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-4.5V19a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-4.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h4.5V5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7.5" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

export function ShoppingBagIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 7h12l1 12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5L6 7Z" />
      <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
    </svg>
  );
}

export function PhoneIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

export function WhatsAppIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      <path d="M9.5 9.5c.3 1.8 1.7 3.2 3.5 3.5l1.2-.8a.8.8 0 0 1 .9 0l1.4.9" />
    </svg>
  );
}

export function MapPinIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 5.5-8 12-8 12S4 15.5 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.8" />
    </svg>
  );
}

export function ClockIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  );
}

export function TruckIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6h12v10H2z" />
      <path d="M14 9h4l4 4v3h-8z" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
    </svg>
  );
}

export function StoreIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9.5 4.8 4h14.4L21 9.5" />
      <path d="M4 9.5v10.5h16V9.5" />
      <path d="M9.5 20v-6h5v6" />
      <path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  );
}

export function PackageTrackIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m12 12 8-4.5M12 12v9M12 12 4 7.5" />
    </svg>
  );
}

export function ShieldCheckIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function PrescriptionIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4h5a3.5 3.5 0 0 1 0 7H7V4Z" />
      <path d="M7 11v9" />
      <path d="m11 11 7 9" />
      <path d="m18 13-6 7" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "w-4 h-4" }: IconProps) {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ArrowLeftIcon({ className = "w-4 h-4" }: IconProps) {
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
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "w-4 h-4" }: IconProps) {
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
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function MenuIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function TrashIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function CheckCircleIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5" />
    </svg>
  );
}

export function AlertCircleIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5M12 16h.01" />
    </svg>
  );
}

export function TagIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1.2" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "w-3.5 h-3.5" }: IconProps) {
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

export function MailIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function CategorySvgIcon({
  name,
  className = "w-6 h-6",
}: {
  name: string;
  className?: string;
}) {
  const key = name.toLowerCase();
  if (key.includes("prescription") || key.includes("rx")) {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="6" y="4" width="20" height="24" rx="4" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11 10h4.2a2.6 2.6 0 0 1 0 5.2H11V10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M11 15.2V21M14.2 15.2 20 22M19.8 17l-4.8 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("device") || key.includes("first aid") || key.includes("surgical")) {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="4.5" y="9.5" width="23" height="17" rx="3.5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11.5 9.5V7a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 14.2v7.6M12.2 18h7.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("vitamin") || key.includes("supplement") || key.includes("wellness")) {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="10.5" y="4.5" width="11" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
        <rect x="8.5" y="8.5" width="15" height="18.5" rx="3.5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16" cy="17.8" r="4.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M16 15.6v4.4M13.8 17.8h4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("mother") || key.includes("baby") || key.includes("child") || key.includes("pediatric")) {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M16 26s-9.5-5.7-9.5-12.8A5.5 5.5 0 0 1 16 9a5.5 5.5 0 0 1 9.5 4.2C25.5 20.3 16 26 16 26Z"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M16 14v5M13.5 16.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("pain") || key.includes("otc") || key.includes("medicine")) {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <g transform="rotate(38 16 16)">
          <rect x="10.5" y="5" width="11" height="22" rx="5.5" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.5 16h11" stroke="currentColor" strokeWidth="1.8" />
        </g>
      </svg>
    );
  }
  // General Healthcare / Daily Care Blister & Bottle
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="7" y="5" width="18" height="22" rx="4" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12.5" cy="11.5" r="2" fill="currentColor" />
      <circle cx="19.5" cy="11.5" r="2" fill="currentColor" />
      <circle cx="12.5" cy="17.5" r="2" fill="currentColor" fillOpacity="0.55" />
      <circle cx="19.5" cy="17.5" r="2" fill="currentColor" fillOpacity="0.55" />
      <path d="M11 22.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Distinct, retail-grade neutral pharmaceutical & healthcare product illustrations
 * for items without an owner-uploaded photo. Differentiates:
 * - Tablets & Blister Packs
 * - Bottles & Syrups
 * - Capsules & Sachets
 * - Medical Equipment (Nebulizers, Monitors, Machines)
 * - Surgical Supplies (Blades, Dressings, Sterile Packs)
 * - Personal / Pediatric / Dental Healthcare Products
 */
export function MedicinePlaceholderIllustration({
  name,
  dosageForm,
  categoryName,
  brandName,
  packingLabel,
  requiresPrescription,
  availabilityStatus,
  showSpecBadge = true,
  className = "w-full h-full",
}: {
  name?: string | null;
  dosageForm?: string | null;
  categoryName?: string | null;
  brandName?: string | null;
  packingLabel?: string | null;
  requiresPrescription?: boolean | number | null;
  availabilityStatus?: string | null;
  showSpecBadge?: boolean;
  className?: string;
}) {
  const [studioImgError, setStudioImgError] = React.useState(false);

  const studioSpec = resolveProductStudioVisual({
    name,
    dosageForm,
    categoryName: categoryName || brandName,
    packingLabel,
    requiresPrescription,
    availabilityStatus,
  });

  if (!studioImgError) {
    return (
      <div
        className={`${className} relative overflow-hidden flex items-center justify-center select-none`}
        style={{ backgroundColor: studioSpec.stageBg }}
      >
        <img
          src={studioSpec.imageUrl}
          alt={name ? `${name} illustration` : "Pharmacy supply illustration"}
          loading="lazy"
          decoding="async"
          onError={() => setStudioImgError(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        {showSpecBadge && (
          <span
            className={`absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold tracking-wide shadow-2xs backdrop-blur-xs border ${
              studioSpec.specBadgeTone === "warm"
                ? "bg-[#FDF2DF]/95 text-[#7D4E14] border-[#ECD0A4]"
                : studioSpec.specBadgeTone === "teal"
                  ? "bg-[#E2F3F0]/95 text-[#0E5146] border-[#B2DDD5]"
                  : "bg-white/92 text-[#165A4C] border-[#C5E2D9]"
            }`}
          >
            {studioSpec.specBadge}
          </span>
        )}
      </div>
    );
  }

  const nameLower = String(name || "").toLowerCase();
  const packLower = String(packingLabel || "").toLowerCase();
  const combined = [name, dosageForm, categoryName, brandName, packingLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const cleanForm = cleanProductText(dosageForm);
  const cleanCat = cleanProductText(categoryName);
  const cleanPack = cleanProductText(packingLabel);

  // Classify into distinct visual archetypes (check specific item cues first so brandName="Surgical Items" doesn't flatten everything)
  const isEquipment =
    combined.includes("nubilizer") ||
    combined.includes("nebulizer") ||
    combined.includes("machine") ||
    combined.includes("monitor") ||
    combined.includes("thermometer") ||
    combined.includes("glucometer") ||
    combined.includes("inhaler") ||
    packLower.includes("machine");

  const isSurgicalSupply =
    !isEquipment &&
    (nameLower.includes("blade") ||
      nameLower.includes("scalpel") ||
      nameLower.includes("syringe") ||
      nameLower.includes("cannula") ||
      nameLower.includes("bandage") ||
      nameLower.includes("gauze") ||
      nameLower.includes("suture") ||
      nameLower.includes("glove") ||
      packLower.includes("blade"));

  const isPersonalOrBabyCare =
    !isEquipment &&
    !isSurgicalSupply &&
    (nameLower.includes("teether") ||
      nameLower.includes("baby") ||
      nameLower.includes("floss") ||
      nameLower.includes("dental") ||
      nameLower.includes("brush") ||
      nameLower.includes("feeder") ||
      nameLower.includes("wipes") ||
      combined.includes("mother"));

  const isLiquid =
    combined.includes("syrup") ||
    combined.includes("suspension") ||
    combined.includes("liquid") ||
    combined.includes("drop") ||
    combined.includes("solution") ||
    combined.includes("elixir");

  const isInjectable =
    combined.includes("inject") ||
    combined.includes("vial") ||
    combined.includes("ampoule") ||
    combined.includes("insulin") ||
    combined.includes("infusion");

  const isCapsule =
    combined.includes("capsule") ||
    combined.includes("cap ") ||
    combined.includes("softgel") ||
    combined.includes("sachet");

  const isTopical =
    combined.includes("cream") ||
    combined.includes("ointment") ||
    combined.includes("gel") ||
    combined.includes("lotion");

  const surfaceStyle: React.CSSProperties = isEquipment
    ? { background: "linear-gradient(145deg, #E8F3F3 0%, #F4F9F9 58%, #FFFFFF 100%)" }
    : isSurgicalSupply
      ? { background: "linear-gradient(145deg, #EDF4F2 0%, #F7FAF9 58%, #FFFFFF 100%)" }
      : isPersonalOrBabyCare
        ? { background: "linear-gradient(145deg, #FFF6E8 0%, #FCF9F2 58%, #FFFFFF 100%)" }
        : isLiquid
          ? { background: "linear-gradient(145deg, #FBF1E3 0%, #FDF9F3 58%, #FFFFFF 100%)" }
          : { background: "linear-gradient(145deg, #E9F5F1 0%, #F5FAF8 58%, #FFFFFF 100%)" };

  const kindLabel = isEquipment
    ? "Medical Equipment"
    : isSurgicalSupply
      ? "Sterile Surgical"
      : isPersonalOrBabyCare
        ? "Healthcare & Care"
        : isLiquid
          ? "Oral Solution"
          : isInjectable
            ? "Sterile Vial"
            : isCapsule
              ? "Capsules"
              : isTopical
                ? "Topical Care"
                : cleanForm || cleanPack || cleanCat || "Tablets & Pack";

  return (
    <div
      className={`${className} flex flex-col items-center justify-center select-none relative overflow-hidden p-4`}
      style={surfaceStyle}
    >
      {/* Subtle architectural corner ring */}
      <div
        className="absolute -right-8 -bottom-8 w-28 h-28 rounded-full pointer-events-none opacity-45"
        style={{ border: "1px solid rgba(14, 81, 70, 0.10)" }}
      />

      {isEquipment ? (
        /* Medical Respiratory / Clinical Device Illustration */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <rect x="20" y="22" width="44" height="44" rx="10" fill="#FFFFFF" stroke="#087E78" strokeWidth="2" />
          <rect x="26" y="29" width="32" height="14" rx="4" fill="#E8F4F3" stroke="#087E78" strokeWidth="1.4" />
          <circle cx="34" cy="54" r="4.5" fill="#0E5146" fillOpacity="0.16" stroke="#0E5146" strokeWidth="1.6" />
          <circle cx="50" cy="54" r="3" fill="#E6A65B" />
          <path d="M64 38c9 0 12 6 12 13s-5 11-9 11" stroke="#087E78" strokeWidth="2" strokeLinecap="round" />
          <path d="M70 18h10l-2 15h-6l-2-15Z" fill="#FFFFFF" stroke="#0E5146" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M75 11v4M71 13l2 2M79 13l-2 2" stroke="#087E78" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : isSurgicalSupply ? (
        /* Sterile Surgical Foil Pack & Precision Instrument */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <rect x="18" y="14" width="42" height="52" rx="6" fill="#FFFFFF" stroke="#0E5146" strokeWidth="2" />
          <path d="M18 24h42" stroke="#0E5146" strokeWidth="1.4" strokeDasharray="3 2.5" strokeOpacity="0.45" />
          <rect x="25" y="31" width="28" height="26" rx="4" fill="#E9F5F1" />
          <path d="M39 38v12M33 44h12" stroke="#0E5146" strokeWidth="2" strokeLinecap="round" />
          <g transform="rotate(-24 66 44)">
            <path d="M60 22h8v26a4 4 0 0 1-8 0V22Z" fill="#FFFFFF" stroke="#087E78" strokeWidth="1.9" />
            <path d="M62 12l6 10h-6V12Z" fill="#087E78" fillOpacity="0.25" stroke="#087E78" strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        </svg>
      ) : isPersonalOrBabyCare ? (
        /* Gentle Healthcare / Pediatric Care Ring & Shield */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <circle cx="48" cy="43" r="20" fill="#FFFFFF" stroke="#0E5146" strokeWidth="2" />
          <circle cx="48" cy="43" r="11" fill="#FFF8ED" stroke="#E6A65B" strokeWidth="2.2" />
          <circle cx="48" cy="21" r="6" fill="#E6A65B" fillOpacity="0.35" stroke="#0E5146" strokeWidth="1.8" />
          <circle cx="32" cy="31" r="3.2" fill="#087E78" fillOpacity="0.35" />
          <circle cx="64" cy="31" r="3.2" fill="#087E78" fillOpacity="0.35" />
        </svg>
      ) : isLiquid ? (
        /* Apothecary Amber Bottle & Measuring Cap */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <rect x="34" y="11" width="18" height="7" rx="2" fill="#FFFFFF" stroke="#0E5146" strokeWidth="1.9" />
          <path
            d="M28 26a6 6 0 0 1 6-6h18a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V26Z"
            fill="#E6A65B"
            fillOpacity="0.22"
            stroke="#0E5146"
            strokeWidth="2"
          />
          <rect x="32" y="34" width="22" height="20" rx="3" fill="#FFFFFF" stroke="#0E5146" strokeWidth="1.5" />
          <path d="M43 40v8M39 44h8" stroke="#0E5146" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M63 48h12l-1.5 18h-9L63 48Z" fill="#FFFFFF" stroke="#087E78" strokeWidth="1.7" />
        </svg>
      ) : isInjectable ? (
        /* Sterile Glass Vial */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <rect x="36" y="13" width="24" height="6" rx="2" fill="#087E78" fillOpacity="0.22" stroke="#0E5146" strokeWidth="1.8" />
          <rect x="39" y="19" width="18" height="5" fill="#FFFFFF" stroke="#0E5146" strokeWidth="1.8" />
          <rect x="31" y="24" width="34" height="42" rx="6" fill="#FFFFFF" stroke="#0E5146" strokeWidth="2" />
          <rect x="35" y="36" width="26" height="20" rx="3" fill="#E9F5F1" />
          <path d="M48 42v8M44 46h8" stroke="#0E5146" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ) : isCapsule ? (
        /* Paired Two-Tone Capsules */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <g transform="rotate(-28 38 40)">
            <rect x="29" y="16" width="18" height="44" rx="9" fill="#FFFFFF" stroke="#0E5146" strokeWidth="2" />
            <path d="M29 25a9 9 0 0 1 18 0v13H29V25Z" fill="#0E5146" fillOpacity="0.82" />
          </g>
          <g transform="rotate(24 60 44)">
            <rect x="51" y="22" width="17" height="40" rx="8.5" fill="#FFFFFF" stroke="#087E78" strokeWidth="1.9" />
            <path d="M51 30.5a8.5 8.5 0 0 1 17 0V42H51V30.5Z" fill="#E6A65B" fillOpacity="0.7" />
          </g>
        </svg>
      ) : isTopical ? (
        /* Clinical Ointment Tube */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <path d="M31 16h34l-4.5 40h-25L31 16Z" fill="#FFFFFF" stroke="#0E5146" strokeWidth="2" strokeLinejoin="round" />
          <path d="M28 16h40" stroke="#0E5146" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="37" y="26" width="22" height="18" rx="3" fill="#E9F5F1" />
          <rect x="41" y="56" width="14" height="9" rx="2" fill="#087E78" fillOpacity="0.2" stroke="#0E5146" strokeWidth="1.8" />
        </svg>
      ) : (
        /* Medicine Carton + Silver Tablet Blister Strip */
        <svg className="w-24 h-20" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <rect x="16" y="20" width="42" height="42" rx="6" fill="#FFFFFF" stroke="#0E5146" strokeWidth="2" />
          <rect x="16" y="20" width="42" height="11" rx="5" fill="#0E5146" fillOpacity="0.88" />
          <path d="M24 41h20M24 47h13" stroke="#0E5146" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" />
          <rect x="46" y="26" width="32" height="40" rx="6" fill="#F8FBFA" stroke="#087E78" strokeWidth="1.9" />
          <line x1="62" y1="31" x2="62" y2="61" stroke="#087E78" strokeWidth="1.2" strokeDasharray="2 2" strokeOpacity="0.45" />
          <circle cx="54" cy="35" r="3.3" fill="#0E5146" fillOpacity="0.2" stroke="#0E5146" strokeWidth="1.4" />
          <circle cx="70" cy="35" r="3.3" fill="#0E5146" fillOpacity="0.2" stroke="#0E5146" strokeWidth="1.4" />
          <circle cx="54" cy="46" r="3.3" fill="#0E5146" fillOpacity="0.2" stroke="#0E5146" strokeWidth="1.4" />
          <circle cx="70" cy="46" r="3.3" fill="#0E5146" fillOpacity="0.2" stroke="#0E5146" strokeWidth="1.4" />
          <circle cx="54" cy="57" r="3.3" fill="#0E5146" fillOpacity="0.2" stroke="#0E5146" strokeWidth="1.4" />
          <circle cx="70" cy="57" r="3.3" fill="#0E5146" fillOpacity="0.2" stroke="#0E5146" strokeWidth="1.4" />
        </svg>
      )}

      <span className="mt-2 px-2.5 py-0.5 rounded-full bg-white/85 border border-black/5 text-[10.5px] font-semibold text-[#526571] tracking-wide truncate max-w-[90%]">
        {kindLabel}
      </span>
    </div>
  );
}

export function ReceiptDownloadIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 3h16v18l-2.7-1.8L14.6 21 12 19.2 9.4 21l-2.7-1.8L4 21V3Z" />
      <path d="M8 8h8M8 11.5h5" />
      <path d="M12 13v4.5m0 0-2-2m2 2 2-2" />
    </svg>
  );
}
