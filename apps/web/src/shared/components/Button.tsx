import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { useTranslateNode } from "../i18n";
import { cn } from "../utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  isLoading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

const base = "relative inline-flex items-center justify-center rounded-full cursor-pointer font-semibold text-sm leading-none no-underline whitespace-nowrap transition duration-120 ease focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 hover:enabled:-translate-y-px";

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8.5 px-3",
  md: "min-h-10 px-3.75",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-canvas",
  secondary: "bg-surface-2 text-ink",
  ghost: "bg-transparent shadow-[inset_0_0_0_1px_var(--color-hairline)] text-ink-muted",
  danger: "bg-danger/14 text-[#ff8ba3]",
};

export function Button({
  children,
  className,
  disabled,
  isLoading = false,
  size = "md",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  const translateNode = useTranslateNode();

  return (
    <button
      {...props}
      aria-busy={isLoading || undefined}
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={disabled || isLoading}
      type={type}
    >
      {isLoading ? <Loader2 aria-hidden="true" className="absolute right-3 animate-spin shrink-0" size={14} /> : null}
      {translateNode(children)}
    </button>
  );
}
