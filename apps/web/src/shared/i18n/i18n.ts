import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import {
  defaultLocale,
  localeStorageKey,
  resources,
  staticTextByLocale,
  supportedLocales,
  type AppLocale,
} from "./resources";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    detection: {
      caches: ["localStorage"],
      lookupLocalStorage: localeStorageKey,
      // English is the product default. A user's browser language should not
      // silently change the UI; an explicit language selection is persisted
      // in localStorage and takes precedence.
      order: ["localStorage"],
    },
    fallbackLng: defaultLocale,
    interpolation: {
      escapeValue: false,
    },
    resources,
    returnEmptyString: false,
    supportedLngs: supportedLocales,
  })
  .then(() => applyDocumentLanguage(getCurrentLocale()));

i18n.on("languageChanged", (language) => {
  applyDocumentLanguage(normalizeLocale(language));
});

export function normalizeLocale(value: string | null | undefined): AppLocale {
  const normalized = value?.trim().replace("_", "-").toLowerCase();

  if (normalized === "ko" || normalized?.startsWith("ko-")) {
    return "ko";
  }

  if (normalized === "zh-cn" || normalized === "zh-hans" || normalized?.startsWith("zh-cn")) {
    return "zh-CN";
  }

  return "en";
}

export function getCurrentLocale(): AppLocale {
  return normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
}

export function translateStaticText(value: string, locale = getCurrentLocale()) {
  return staticTextByLocale[locale][value] ?? value;
}

export async function setAppLanguage(locale: AppLocale) {
  await i18n.changeLanguage(locale);
  localStorage.setItem(localeStorageKey, locale);
  applyDocumentLanguage(locale);
}

export { i18n };

function applyDocumentLanguage(locale: AppLocale) {
  if (typeof document === "undefined") return;

  document.documentElement.lang = locale;
}
