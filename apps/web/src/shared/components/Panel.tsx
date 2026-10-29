import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "../utils";

type PanelPadding = "none" | "sm" | "md" | "lg";
type PanelTone = "primary" | "secondary" | "subtle";

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
  padding?: PanelPadding;
  tone?: PanelTone;
};

const toneClasses: Record<PanelTone, string> = {
  primary: "bg-surface-1 border-hairline",
  secondary: "bg-surface-2 border-hairline",
  subtle: "bg-surface-2/45 border-hairline-soft",
};

const paddingClasses: Record<PanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-4.5",
};

export function Panel({
  as: Component = "section",
  children,
  className,
  padding = "md",
  tone = "primary",
  ...props
}: PanelProps) {
  return (
    <Component
      className={cn("border rounded-3.5 min-w-0", toneClasses[tone], paddingClasses[padding], className)}
      {...props}
    >
      {children}
    </Component>
  );
}
