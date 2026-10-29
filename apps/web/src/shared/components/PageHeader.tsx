import type { ReactNode } from "react";

import { useTranslateNode } from "../i18n";
import { InfoTooltip } from "./InfoTooltip";

type PageHeaderProps = {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  help?: ReactNode;
  title: ReactNode;
};

export function PageHeader({ action, description, eyebrow, help, title }: PageHeaderProps) {
  const translateNode = useTranslateNode();

  return (
    <header className="flex items-start justify-between gap-4 border-b border-hairline-soft pb-3.5">
      <div className="grid gap-2 min-w-0">
        {eyebrow ? <span className="text-accent text-xs font-bold leading-none uppercase">{translateNode(eyebrow)}</span> : null}
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-ink text-[clamp(26px,3vw,34px)] font-[650] leading-[1.08] m-0">{translateNode(title)}</h1>
          {help ? <InfoTooltip>{translateNode(help)}</InfoTooltip> : null}
        </div>
        {description ? <p className="text-ink-muted text-sm leading-normal m-0 max-w-190">{translateNode(description)}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2 shrink-0">{action}</div> : null}
    </header>
  );
}
