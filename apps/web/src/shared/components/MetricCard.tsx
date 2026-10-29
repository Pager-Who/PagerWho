import type { ReactNode } from "react";

import { useTranslateNode } from "../i18n";

type MetricCardTone = "neutral" | "blue" | "green" | "yellow" | "red";

type MetricCardProps = {
  caption?: ReactNode;
  label: ReactNode;
  tone?: MetricCardTone;
  value: ReactNode;
};

export function MetricCard({ caption, label, value }: MetricCardProps) {
  const translateNode = useTranslateNode();

  return (
    <article className="grid gap-2 min-h-28 p-4 rounded-2xl border border-hairline bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.014)),var(--color-surface-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
      <span className="text-ink-muted text-xs font-bold leading-none uppercase">{translateNode(label)}</span>
      <strong className="text-ink text-4xl font-[650] leading-[0.95]">{translateNode(value)}</strong>
      {caption ? <p className="text-ink-subtle text-xs leading-[1.35] m-0">{translateNode(caption)}</p> : null}
    </article>
  );
}
