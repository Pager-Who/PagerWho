import { useStaticText } from "../i18n";
import { cn } from "../utils";

export function TabButton({
  active,
  count,
  id,
  label,
  onClick,
  panelId,
}: {
  active: boolean;
  count?: number;
  id?: string;
  label: string;
  onClick: () => void;
  panelId?: string;
}) {
  const t = useStaticText();

  return (
    <button
      aria-selected={active}
      aria-controls={panelId}
      className={cn(
        "inline-flex items-center justify-center gap-2 min-h-8.5 px-3 rounded-md border-0 cursor-pointer whitespace-nowrap",
        active
          ? "bg-surface-2 text-ink"
          : "bg-transparent text-ink-muted hover:bg-surface-1 hover:text-ink",
      )}
      id={id}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <strong className="text-[13px] font-[650] leading-none">{t(label)}</strong>
      {typeof count === "number" ? (
        <span className="text-ink-subtle text-xs font-bold leading-none">{count}</span>
      ) : null}
    </button>
  );
}
