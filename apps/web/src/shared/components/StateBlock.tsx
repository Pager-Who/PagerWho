import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTranslateNode } from "../i18n";
import { cn } from "../utils";
import { Button } from "./Button";

type StateBlockProps = {
  action?: ReactNode;
  message?: ReactNode;
  status?: "alert" | "loading";
  title: ReactNode;
  tone?: "default" | "danger";
};

type EmptyStateProps = Omit<StateBlockProps, "status" | "title"> & {
  title?: ReactNode;
};

type ErrorStateProps = {
  action?: ReactNode;
  error?: unknown;
  onRetry?: () => void | Promise<unknown>;
  title?: ReactNode;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The request could not be completed.";
}

export function StateBlock({ action, message, status, title, tone = "default" }: StateBlockProps) {
  const translateNode = useTranslateNode();

  return (
    <div
      aria-busy={status === "loading" || undefined}
      aria-live={status === "alert" ? "assertive" : status === "loading" ? "polite" : undefined}
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 bg-surface-1 border rounded-md p-4.5",
        tone === "danger" ? "border-danger/36" : "border-hairline",
      )}
      role={status === "alert" ? "alert" : status === "loading" ? "status" : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {status === "loading" ? <Loader2 aria-hidden="true" className="animate-spin text-ink-subtle shrink-0" size={16} /> : null}
          {status === "alert" ? <AlertCircle aria-hidden="true" className="text-danger shrink-0" size={16} /> : null}
          <h2 className="text-ink text-[15px] leading-tight m-0">{translateNode(title)}</h2>
        </div>
        {message ? <p className="text-ink-muted text-[13px] leading-[1.45] m-0">{translateNode(message)}</p> : null}
        {status === "loading" ? (
          <div aria-hidden="true" className="grid gap-1.5 mt-3 max-w-70 animate-pulse">
            <span className="block bg-surface-2 rounded-full h-2 w-full" />
            <span className="block bg-surface-2 rounded-full h-2 w-2/3" />
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ message }: { message?: ReactNode }) {
  const { t } = useTranslation();

  return (
    <StateBlock
      message={message ?? t("state.loadingData")}
      status="loading"
      title={t("state.loading")}
    />
  );
}

export function EmptyState({ action, message, title }: EmptyStateProps) {
  const { t } = useTranslation();

  return <StateBlock action={action} message={message} title={title ?? t("state.noData")} />;
}

export function ErrorState({ action, error, onRetry, title }: ErrorStateProps) {
  const { t } = useTranslation();
  const retryAction = action ?? (onRetry ? <Button onClick={() => void onRetry()} size="sm" variant="ghost">{t("state.retry")}</Button> : undefined);

  return (
    <StateBlock
      action={retryAction}
      message={getErrorMessage(error) || t("state.fallbackError")}
      status="alert"
      title={title ?? t("state.somethingWrong")}
      tone="danger"
    />
  );
}
