import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

import { Field, Select } from "../components";
import { getCurrentLocale, setAppLanguage } from "./i18n";
import { languageOptions, type AppLocale } from "./resources";

type LanguageSelectProps = {
  variant?: "field" | "floating" | "menu";
};

export function LanguageSelect({ variant = "field" }: LanguageSelectProps) {
  const { t } = useTranslation();
  const currentLocale = getCurrentLocale();
  const select = (
    <Select
      aria-label={t("language.fieldLabel")}
      className={variant === "menu" || variant === "floating" ? "min-h-8.5 rounded-md px-2.5 py-1.5 text-[13px]" : undefined}
      onChange={(event) => void setAppLanguage(event.target.value as AppLocale)}
      value={currentLocale}
    >
      {languageOptions.map((option) => (
        <option key={option.locale} value={option.locale}>
          {option.nativeLabel}
        </option>
      ))}
    </Select>
  );

  if (variant === "menu") {
    return (
      <div className="grid gap-1.5 border-t border-hairline-soft mt-1 pt-2">
        <span className="text-ink-muted text-[13px] font-[650] leading-none">{t("language.fieldLabel")}</span>
        {select}
      </div>
    );
  }

  if (variant === "floating") {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-hairline bg-canvas-raised/96 px-2.5 py-2 shadow-[0_18px_48px_rgba(0,0,0,0.36)] backdrop-blur">
        <Languages aria-hidden="true" className="text-ink-muted shrink-0" size={16} strokeWidth={2} />
        <span className="sr-only">{t("language.fieldLabel")}</span>
        <div className="pointer-events-auto">{select}</div>
      </div>
    );
  }

  return (
    <Field hint={t("language.saved")} label={t("language.fieldLabel")}>
      {select}
    </Field>
  );
}
