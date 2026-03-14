"use client";

import { SelectHTMLAttributes } from "react";
import { APP_LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex items-center gap-2 rounded-full border border-white/12 bg-[#090B12]/80 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">
      <span className="whitespace-nowrap text-white/70">{t("Language")}</span>
      <select
        {...props}
        value={locale}
        onChange={(event) => setLocale(event.target.value as (typeof APP_LOCALES)[number])}
        className={`rounded bg-transparent text-white outline-none ${props.className ?? ""}`}
      >
        {APP_LOCALES.map((value) => (
          <option key={value} value={value} className="bg-[#090B12] text-white">
            {LOCALE_LABELS[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
