import React, { useMemo, useState } from "react";
import type {
  StorefrontCustomServiceRecord,
  StorefrontDoctorRecord,
  StorefrontPublicContext,
} from "../../shared/types";
import type { StorefrontView } from "../types-ui";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  SearchIcon,
  ShieldCheckIcon,
  WhatsAppIcon,
} from "../components/Icons";

interface DoctorsViewProps {
  sf: StorefrontPublicContext;
  displayName: string;
  doctors: StorefrontDoctorRecord[];
  onSelectView: (view: StorefrontView) => void;
}

export function DoctorsView({ sf, displayName, doctors, onSelectView }: DoctorsViewProps) {
  const defaultWhatsapp = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");

  return (
    <main className="flex-1 bg-[#F6F7F9] sf-fade-up">
      <section className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-2">
          <nav className="flex items-center gap-1.5 text-xs text-[#64748B]">
            <button type="button" onClick={() => onSelectView("home")} className="hover:text-[#0F172A]">
              Home
            </button>
            <ChevronRightIcon className="w-3.5 h-3.5" />
            <span className="font-semibold text-[#0F172A]">Clinic &amp; Doctors</span>
          </nav>
          <h1 className="sf-heading text-2xl sm:text-3xl font-extrabold text-[#0F172A]">
            Available Doctors at {displayName}
          </h1>
          <p className="text-sm text-[#475569] max-w-2xl">
            Check consultation timings, fees, and book your appointment directly with our clinic counter in {sf.city}.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {doctors.length === 0 ? (
          <div className="sf-card rounded-2xl p-10 text-center space-y-3 max-w-lg mx-auto">
            <p className="sf-heading text-base font-bold text-[#0F172A]">No Doctors Listed Currently</p>
            <button
              type="button"
              onClick={() => onSelectView("shop")}
              className="h-10 px-5 rounded-xl sf-btn-primary text-xs font-bold"
            >
              Browse Medicines Catalog
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {doctors.map((doc) => {
              const phoneDigits = (doc.booking_phone || defaultWhatsapp).replace(/[^0-9]/g, "");
              const fee = Number(doc.consultation_fee_pkr || 0);
              const waText = encodeURIComponent(
                `Assalam-o-Alaikum ${displayName}, I would like to book a consultation appointment with ${doc.name}${
                  doc.timings ? ` (${doc.timings})` : ""
                }.`
              );

              return (
                <article
                  key={doc.id}
                  className="sf-card rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start gap-4">
                      {doc.photo_url ? (
                        <img
                          src={doc.photo_url}
                          alt={doc.name}
                          loading="lazy"
                          decoding="async"
                          className="w-20 h-20 rounded-2xl object-cover border border-[#E2E8F0] shrink-0 bg-[#F8FAFC]"
                        />
                      ) : (
                        <div
                          className="w-20 h-20 rounded-2xl text-white font-extrabold text-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "var(--sf-primary)" }}
                        >
                          {doc.name
                            .replace(/^dr\.?\s*/i, "")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        {doc.specialization && (
                          <span className="inline-block px-2 py-0.5 rounded-md sf-badge-brand text-[10.5px] font-bold">
                            {doc.specialization}
                          </span>
                        )}
                        <h2 className="sf-heading text-base sm:text-lg font-extrabold text-[#0F172A] leading-snug">
                          {doc.name}
                        </h2>
                        {doc.qualification && (
                          <p className="text-xs font-semibold text-[#475569]">{doc.qualification}</p>
                        )}
                        {doc.experience_years && doc.experience_years > 0 && (
                          <p className="text-[11px] text-[#64748B]">
                            {doc.experience_years}+ years experience
                          </p>
                        )}
                      </div>
                    </div>

                    {doc.bio && (
                      <p className="text-xs sm:text-[13px] text-[#475569] leading-relaxed">
                        {doc.bio}
                      </p>
                    )}

                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#64748B] font-semibold">Consultation Fee</span>
                        <span className="sf-heading font-extrabold text-sm text-[#0F172A] tabular-nums">
                          {fee > 0 ? `Rs. ${fee.toLocaleString()}` : "Free / Confirm at Desk"}
                        </span>
                      </div>
                      {doc.timings && (
                        <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-[#E2E8F0]">
                          <span className="text-[#64748B] font-semibold inline-flex items-center gap-1 shrink-0">
                            <ClockIcon className="w-3.5 h-3.5 sf-text-brand" />
                            <span>Timings</span>
                          </span>
                          <span className="font-bold text-[#0F172A] text-right">{doc.timings}</span>
                        </div>
                      )}
                      {doc.days_available && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[#64748B] font-semibold">Days</span>
                          <span className="font-semibold text-[#334155] text-right">
                            {doc.days_available}
                          </span>
                        </div>
                      )}
                      {doc.room_or_clinic_note && (
                        <div className="flex items-start gap-1.5 pt-1 text-[11px] text-[#475569]">
                          <MapPinIcon className="w-3.5 h-3.5 sf-text-brand shrink-0 mt-0.5" />
                          <span>{doc.room_or_clinic_note}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-5 pb-5 flex items-center gap-2">
                    {phoneDigits && (
                      <a
                        href={`https://wa.me/${phoneDigits}?text=${waText}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 h-10 px-3 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1.5"
                      >
                        <WhatsAppIcon className="w-4 h-4" />
                        <span>Book Appointment</span>
                      </a>
                    )}
                    {(doc.booking_phone || sf.contact_phone) && (
                      <a
                        href={`tel:${doc.booking_phone || sf.contact_phone}`}
                        className="h-10 px-3.5 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
                        <span>Call</span>
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

interface CustomServicesViewProps {
  sf: StorefrontPublicContext;
  displayName: string;
  services: StorefrontCustomServiceRecord[];
  onSelectView: (view: StorefrontView) => void;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  lab_tests: "Diagnostic Lab & Tests",
  home_care: "Home Nursing & Care",
  clinic: "Clinic Procedure",
  vaccination: "Vaccination",
  custom: "Pharmacy Service",
};

export function CustomServicesView({
  sf,
  displayName,
  services,
  onSelectView,
}: CustomServicesViewProps) {
  const [testSearch, setTestSearch] = useState("");
  const defaultWhatsapp = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");

  const filteredServices = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    if (!q) return services;
    return services
      .map((svc) => {
        const titleMatch =
          svc.title.toLowerCase().includes(q) ||
          (svc.subtitle || "").toLowerCase().includes(q) ||
          (svc.description || "").toLowerCase().includes(q);
        const matchingItems = (svc.items || []).filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.sample_type || "").toLowerCase().includes(q) ||
            (it.note || "").toLowerCase().includes(q)
        );
        if (titleMatch) return svc;
        if (matchingItems.length > 0) return { ...svc, items: matchingItems };
        return null;
      })
      .filter(Boolean) as StorefrontCustomServiceRecord[];
  }, [services, testSearch]);

  return (
    <main className="flex-1 bg-[#F6F7F9] sf-fade-up">
      <section className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <nav className="flex items-center gap-1.5 text-xs text-[#64748B]">
              <button type="button" onClick={() => onSelectView("home")} className="hover:text-[#0F172A]">
                Home
              </button>
              <ChevronRightIcon className="w-3.5 h-3.5" />
              <span className="font-semibold text-[#0F172A]">Lab Tests &amp; Services</span>
            </nav>
            <h1 className="sf-heading text-2xl sm:text-3xl font-extrabold text-[#0F172A]">
              Lab Tests &amp; Healthcare Services — {displayName}
            </h1>
            <p className="text-sm text-[#475569] max-w-2xl">
              View transparent test rates, reporting times, home sample collection availability, and book directly with {displayName}.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <SearchIcon className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
              placeholder="Search lab test (e.g. CBC, HbA1c, Sugar)…"
              className="w-full h-11 pl-10 pr-4 rounded-xl sf-input text-sm"
            />
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {filteredServices.length === 0 ? (
          <div className="sf-card rounded-2xl p-10 text-center space-y-3 max-w-lg mx-auto">
            <p className="sf-heading text-base font-bold text-[#0F172A]">
              {testSearch ? `No tests or services matching "${testSearch}"` : "No Custom Services Listed"}
            </p>
            {testSearch && (
              <button
                type="button"
                onClick={() => setTestSearch("")}
                className="h-9 px-4 rounded-xl sf-btn-primary text-xs font-bold"
              >
                Show All Services
              </button>
            )}
          </div>
        ) : (
          filteredServices.map((svc) => {
            const phoneDigits = (svc.booking_phone || defaultWhatsapp).replace(/[^0-9]/g, "");
            const items = svc.items || [];
            const genericWa = encodeURIComponent(
              `Assalam-o-Alaikum ${displayName}, I would like to book "${svc.title}". Please share details.`
            );

            return (
              <section key={svc.id} className="sf-card rounded-2xl overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 border-b border-[#E2E8F0]">
                  {svc.image_url && (
                    <div className="lg:col-span-4 bg-[#F8FAFC] border-b lg:border-b-0 lg:border-r border-[#E2E8F0]">
                      <img
                        src={svc.image_url}
                        alt={svc.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full min-h-[200px] max-h-[260px] object-cover"
                      />
                    </div>
                  )}

                  <div
                    className={`${svc.image_url ? "lg:col-span-8" : "lg:col-span-12"} p-5 sm:p-6 flex flex-col justify-between gap-4`}
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md sf-badge-brand text-[11px] font-bold">
                          {SERVICE_TYPE_LABELS[svc.service_type] || svc.service_type}
                        </span>
                        {Boolean(svc.home_service_available) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            <span>Home Collection / Visit Available</span>
                          </span>
                        )}
                        {svc.timings && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#475569]">
                            <ClockIcon className="w-3.5 h-3.5 sf-text-brand" />
                            <span>{svc.timings}</span>
                          </span>
                        )}
                      </div>

                      <h2 className="sf-heading text-xl sm:text-2xl font-extrabold text-[#0F172A]">
                        {svc.title}
                      </h2>
                      {svc.subtitle && (
                        <p className="text-sm font-semibold text-[#334155]">{svc.subtitle}</p>
                      )}
                      {svc.description && (
                        <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                          {svc.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
                      <div className="text-xs text-[#64748B]">
                        {svc.starting_price_pkr !== null && svc.starting_price_pkr !== undefined && (
                          <span>
                            Starting from{" "}
                            <strong className="text-sm font-extrabold text-[#0F172A] tabular-nums">
                              Rs. {Number(svc.starting_price_pkr).toLocaleString()}
                            </strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {phoneDigits && (
                          <a
                            href={`https://wa.me/${phoneDigits}?text=${genericWa}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 px-4 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5" />
                            <span>Book on WhatsApp</span>
                          </a>
                        )}
                        {(svc.booking_phone || sf.contact_phone) && (
                          <a
                            href={`tel:${svc.booking_phone || sf.contact_phone}`}
                            className="h-9 px-3.5 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
                            <span>Call Desk</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Structured Tests / Price List Table */}
                {items.length > 0 && (
                  <div className="p-5 sm:p-6 bg-[#FAFBFD] space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
                        <ShieldCheckIcon className="w-4 h-4 sf-text-brand" />
                        <span>Available Tests, Packages &amp; Charges ({items.length})</span>
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {items.map((item, idx) => {
                        const itemWa = encodeURIComponent(
                          `Assalam-o-Alaikum ${displayName}, I want to book "${item.name}" under ${svc.title} (Rs. ${Number(
                            item.price_pkr || 0
                          ).toLocaleString()}).`
                        );
                        return (
                          <div
                            key={`${item.name}-${idx}`}
                            className="rounded-xl bg-white border border-[#E2E8F0] px-4 py-3 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[#0F172A]">{item.name}</p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[#64748B] mt-0.5">
                                {item.sample_type && <span>Sample: {item.sample_type}</span>}
                                {item.report_time && <span>• Report: {item.report_time}</span>}
                                {item.note && <span>• {item.note}</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="sf-heading text-sm font-extrabold text-[#0F172A] tabular-nums">
                                {Number(item.price_pkr || 0) > 0
                                  ? `Rs. ${Number(item.price_pkr).toLocaleString()}`
                                  : "Free"}
                              </span>
                              {phoneDigits && (
                                <a
                                  href={`https://wa.me/${phoneDigits}?text=${itemWa}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="h-8 px-2.5 rounded-lg sf-btn-soft text-[11px] font-bold inline-flex items-center gap-1"
                                >
                                  <span>Book</span>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
