import type { ReactNode } from "react";

import { Info } from "lucide-react";

import { cn } from "../utils";

type InfoTooltipProps = {
  children: ReactNode;
  label?: string;
  side?: "left" | "right";
};

/** A small, keyboard-friendly explanation popover that also works on touch devices. */
export function InfoTooltip({ children, label = "More information", side = "left" }: InfoTooltipProps) {
  return (
    <details className="group relative inline-flex shrink-0">
      <summary
        aria-label={label}
        className="inline-flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none [&::-webkit-details-marker]:hidden"
      >
        <Info size={14} strokeWidth={2} />
      </summary>
      <div
        className={cn(
          "absolute top-7 z-40 w-64 rounded-lg border border-hairline bg-canvas-raised p-3 text-xs leading-[1.45] text-ink-muted shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
          side === "left" ? "right-0" : "left-0",
        )}
        role="tooltip"
      >
        {children}
      </div>
    </details>
  );
}
