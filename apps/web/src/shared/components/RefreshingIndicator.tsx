import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function RefreshingIndicator({ label }: { label?: string }) {
  const { t } = useTranslation();

  return (
    <span aria-live="polite" className="inline-flex items-center gap-1.5 text-ink-muted text-xs" role="status">
      <Loader2 aria-hidden="true" className="animate-spin shrink-0" size={13} />
      {label ?? t("state.refreshing")}
    </span>
  );
}
