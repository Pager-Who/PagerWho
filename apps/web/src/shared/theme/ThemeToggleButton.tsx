import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../utils";
import { useTheme } from "./ThemeContext";

type ThemeToggleButtonProps = {
  className?: string;
  variant?: "icon" | "menu";
};

export function ThemeToggleButton({ className, variant = "icon" }: ThemeToggleButtonProps) {
  const { t } = useTranslation();
  const { isLightMode, toggleTheme } = useTheme();
  const Icon = isLightMode ? Moon : Sun;
  const label = isLightMode ? t("theme.dark") : t("theme.light");
  const switchLabel = t("theme.switchTo", { mode: label.toLowerCase() });

  if (variant === "menu") {
    return (
      <button
        className={cn(
          "flex items-center gap-2.5 rounded-md bg-transparent border-0 text-[13px] font-[650] leading-none min-h-9.5 px-2.5 text-ink-muted cursor-pointer text-left transition-colors duration-120 ease hover:bg-surface-2 hover:text-ink",
          className,
        )}
        onClick={toggleTheme}
        role="menuitem"
        type="button"
      >
        <Icon size={14} strokeWidth={2} />
        {label}
      </button>
    );
  }

  return (
    <button
      aria-label={switchLabel}
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink-muted h-8.5 w-8.5 cursor-pointer transition-colors duration-120 ease hover:bg-surface-2 hover:text-ink",
        className,
      )}
      onClick={toggleTheme}
      title={switchLabel}
      type="button"
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}
