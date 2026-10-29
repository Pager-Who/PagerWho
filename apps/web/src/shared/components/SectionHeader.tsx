import type { ReactNode } from "react";

import { useTranslateNode } from "../i18n";

type SectionHeaderProps = {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
};

export function SectionHeader({ action, description, eyebrow, title }: SectionHeaderProps) {
  const translateNode = useTranslateNode();

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <span className="inline-flex text-accent text-xs font-bold leading-none uppercase mb-2">{translateNode(eyebrow)}</span>
        ) : null}
        <h2 className="text-ink text-xl font-[650] leading-[1.2] m-0 mb-1.75">{translateNode(title)}</h2>
        {description ? (
          <p className="text-ink-muted text-[13px] leading-[1.45] m-0 max-w-155">{translateNode(description)}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
