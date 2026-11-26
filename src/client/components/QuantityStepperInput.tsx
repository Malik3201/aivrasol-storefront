import React, { useEffect, useState } from "react";

export interface QuantityStepperInputProps {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: "sm" | "md" | "touch";
  onChange: (nextQty: number) => void;
  onCapReached?: (cap: number) => void;
}

export function QuantityStepperInput({
  value,
  min = 1,
  max,
  disabled = false,
  size = "sm",
  onChange,
  onCapReached,
}: QuantityStepperInputProps) {
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const effectiveMax = max !== undefined && max > 0 ? Math.max(min, max) : undefined;

  const commitValue = (rawNum: number) => {
    if (!Number.isFinite(rawNum) || rawNum < min) {
      setDraft(String(min));
      if (value !== min) onChange(min);
      return;
    }
    const floored = Math.floor(rawNum);
    const clamped = effectiveMax !== undefined ? Math.min(effectiveMax, floored) : floored;
    if (effectiveMax !== undefined && floored > effectiveMax && onCapReached) {
      onCapReached(effectiveMax);
    }
    setDraft(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  const isMd = size === "md";
  const isTouch = size === "touch";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center rounded-xl sf-glass-stepper ${
        disabled ? "opacity-50 pointer-events-none" : ""
      } ${
        isTouch
          ? "p-1 gap-1 h-[46px]"
          : isMd
            ? "p-1 gap-1 h-[44px]"
            : "p-0.5 gap-0.5 h-[40px] sm:h-[36px]"
      }`}
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => commitValue(value - 1)}
        aria-label="Decrease quantity"
        className={`${
          isTouch
            ? "w-10 h-10 text-lg"
            : isMd
              ? "w-9 h-9 sm:w-8 sm:h-8 text-base"
              : "w-8 h-8 sm:w-7 sm:h-7 text-sm"
        } rounded-lg font-bold text-[#142B35] hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent transition active:scale-95 flex items-center justify-center select-none`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={draft}
        aria-label="Quantity"
        data-testid="qty-stepper-input"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, "");
          if (raw === "") {
            setDraft("");
            return;
          }
          const parsed = parseInt(raw, 10);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            setDraft(raw);
            return;
          }
          const clamped = effectiveMax !== undefined ? Math.min(effectiveMax, parsed) : parsed;
          if (effectiveMax !== undefined && parsed > effectiveMax && onCapReached) {
            onCapReached(effectiveMax);
          }
          setDraft(String(clamped));
          if (clamped !== value) {
            onChange(clamped);
          }
        }}
        onBlur={() => {
          const parsed = parseInt(draft, 10);
          if (!Number.isFinite(parsed) || parsed < min) {
            const fallback = Math.max(min, value >= min ? value : min);
            setDraft(String(fallback));
            if (fallback !== value) onChange(fallback);
          } else {
            commitValue(parsed);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commitValue(value + 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            commitValue(Math.max(min, value - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={`qty-stepper-input sf-num ${
          isTouch
            ? "w-11 h-10 text-base sm:text-sm"
            : isMd
              ? "w-12 h-9 sm:h-8 text-base sm:text-sm"
              : "w-10 h-8 sm:h-7 text-base sm:text-xs"
        } rounded-lg bg-white border border-[#DCE6E1] text-center font-bold text-[#0F232C] focus:outline-none focus:border-[var(--sf-primary)] focus:ring-2 focus:ring-[var(--sf-primary-soft)]`}
      />
      <button
        type="button"
        disabled={disabled || (effectiveMax !== undefined && value >= effectiveMax)}
        onClick={() => commitValue(value + 1)}
        aria-label="Increase quantity"
        className={`${
          isTouch
            ? "w-10 h-10 text-lg"
            : isMd
              ? "w-9 h-9 sm:w-8 sm:h-8 text-base"
              : "w-8 h-8 sm:w-7 sm:h-7 text-sm"
        } rounded-lg font-bold text-[#142B35] hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent transition active:scale-95 flex items-center justify-center select-none`}
      >
        +
      </button>
    </div>
  );
}
