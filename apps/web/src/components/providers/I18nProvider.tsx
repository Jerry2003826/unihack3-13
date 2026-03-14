"use client";

import { useEffect, useMemo, useState } from "react";
import {
  I18nContext,
  LOCALE_STORAGE_KEY,
  type AppLocale,
  formatDateTime,
  normalizeLocale,
  translate,
} from "@/lib/i18n";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    setLocale(normalizeLocale(stored || navigator.language));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
      formatDateTime: (timestamp: number) => formatDateTime(locale, timestamp),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
