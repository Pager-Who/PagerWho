import { Sparkles } from "lucide-react";

import { cn } from "../utils";

type CopilotMarkProps = {
  className?: string;
  iconSize?: number;
  size?: "sm" | "md";
  showStatusDot?: boolean;
};

const sizeClasses = {
  md: "h-9 w-9 rounded-xl shadow-[0_8px_24px_rgba(0,153,255,0.2)]",
  sm: "h-8 w-8 rounded-xl shadow-[0_5px_14px_rgba(0,153,255,0.18)]",
};

export function CopilotMark({ className, iconSize = 17, showStatusDot = false, size = "md" }: CopilotMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center bg-[linear-gradient(145deg,var(--color-ink),var(--color-accent))] text-canvas",
        sizeClasses[size],
        className,
      )}
    >
      <Sparkles size={iconSize} strokeWidth={2.2} />
      {showStatusDot ? <span className="copilot-pulse-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success" /> : null}
    </span>
  );
}
