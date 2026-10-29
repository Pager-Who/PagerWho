import type { ReactNode } from "react";

import { useTranslateNode } from "../i18n";

export function DescriptionList({ items }: { items: Array<[string, ReactNode]> }) {
  const translateNode = useTranslateNode();

  return (
    <dl className="grid gap-0 m-0">
      {items.map(([label, value], i) => (
        <div
          key={label}
          className={`grid gap-3 grid-cols-[150px_minmax(0,1fr)] py-2.75 border-b border-hairline-soft last:border-b-0 last:pb-0 ${i === 0 ? "pt-0" : ""}`}
        >
          <dt className="text-ink-subtle text-xs font-bold leading-[1.35] uppercase">{translateNode(label)}</dt>
          <dd className="text-ink text-[13px] leading-[1.45] m-0 min-w-0 overflow-wrap-anywhere">{translateNode(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
