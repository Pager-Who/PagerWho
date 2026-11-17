import type { CopilotLocale } from "@im/contracts";

export function normalizeCopilotLocale(value: string | null | undefined): CopilotLocale {
  const normalized = value?.trim().replace("_", "-").toLowerCase();

  if (normalized === "en" || normalized?.startsWith("en-")) {
    return "en";
  }

  if (normalized === "zh-cn" || normalized === "zh-hans" || normalized?.startsWith("zh-cn")) {
    return "zh-CN";
  }

  return "ko";
}
