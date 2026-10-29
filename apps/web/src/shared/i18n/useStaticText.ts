import type { ReactElement, ReactNode } from "react";
import { Children, cloneElement, isValidElement, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { normalizeLocale, translateStaticText } from "./i18n";

export function useStaticText() {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);

  return useCallback((value: string) => translateStaticText(value, locale), [locale]);
}

export function useTranslateNode() {
  const translateText = useStaticText();

  return useCallback(
    (value: ReactNode): ReactNode => translateReactNode(value, translateText),
    [translateText],
  );
}

export function LocalizedText({ children }: { children: ReactNode }) {
  const translateNode = useTranslateNode();

  return translateNode(children);
}

function translateReactNode(
  value: ReactNode,
  translateText: (value: string) => string,
): ReactNode {
  if (typeof value === "string") {
    return translateStringFragment(value, translateText);
  }

  if (Array.isArray(value)) {
    return value.map((child) => translateReactNode(child, translateText));
  }

  if (!isValidElement<{ children?: ReactNode; value?: string | number | readonly string[] }>(value) || !("children" in value.props)) {
    return value;
  }

  if (value.type === "option" && !shouldTranslateOption(value)) {
    return value;
  }

  return cloneElement(
    value,
    undefined,
    Children.map(value.props.children, (child) => translateReactNode(child, translateText)),
  );
}

function shouldTranslateOption(
  value: ReactElement<{ children?: ReactNode; value?: string | number | readonly string[] }>,
) {
  const optionValue = value.props.value;
  const optionLabel = value.props.children;

  return typeof optionLabel === "string"
    && (optionValue === undefined || optionValue === "" || optionValue === optionLabel);
}

function translateStringFragment(value: string, translateText: (value: string) => string) {
  const trimmed = value.trim();

  if (!trimmed) return value;

  const translated = translateText(trimmed);

  if (translated === trimmed) return value;

  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";

  return `${leading}${translated}${trailing}`;
}
