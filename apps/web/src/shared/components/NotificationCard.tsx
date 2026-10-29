import type { NotificationLog } from "@im/contracts";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatDateTime, formatRelativeTime } from "../utils";
import { NotificationStatusBadge } from "./Badge";

type NotificationCardProps = {
  action?: ReactNode;
  notification: NotificationLog;
  onSelect?: () => void;
};

export function NotificationCard({ action, notification, onSelect }: NotificationCardProps) {
  return (
    <article className="grid gap-3 rounded-lg border border-hairline-soft bg-surface-1 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{formatNotificationLabel(notification.channel)}</strong>
          <span className="text-ink-subtle text-xs">{formatNotificationLabel(notification.target_type)}</span>
        </div>
        <NotificationStatusBadge status={notification.status} />
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <div className="grid min-w-0 gap-1">
          <dt className="text-ink-subtle text-[10px] font-[750] uppercase">Target</dt>
          <dd className="m-0 break-all font-mono text-ink-muted">{notification.target_address}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-ink-subtle text-[10px] font-[750] uppercase">Updated</dt>
          <dd className="m-0 text-ink-muted" title={formatDateTime(notification.updated_at)}>{formatRelativeTime(notification.updated_at)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-ink-subtle text-[10px] font-[750] uppercase">Attempts</dt>
          <dd className="m-0 text-ink-muted">{notification.attempt}</dd>
        </div>
        {notification.next_retry_at ? (
          <div className="grid gap-1">
            <dt className="text-ink-subtle text-[10px] font-[750] uppercase">Next retry</dt>
            <dd className="m-0 text-ink-muted">{formatDateTime(notification.next_retry_at)}</dd>
          </div>
        ) : null}
      </dl>

      {notification.error_message ? (
        <p className="m-0 break-words rounded-md border border-danger/25 bg-danger/10 px-2.5 py-2 text-xs leading-[1.45] text-[#ff98ad]">
          {notification.error_message}
        </p>
      ) : null}

      {action ?? (onSelect ? (
        <button
          className="min-h-9 rounded-md border border-hairline bg-surface-2 px-3 text-left text-xs font-[650] text-ink-muted transition-colors hover:text-ink"
          onClick={onSelect}
          type="button"
        >
          View delivery attempts
        </button>
      ) : null)}
    </article>
  );
}

function formatNotificationLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function NotificationCardAction({ to }: { to: string }) {
  return (
    <Link className="inline-flex min-h-9 items-center rounded-md border border-hairline bg-surface-2 px-3 text-xs font-[650] text-ink-muted no-underline transition-colors hover:text-ink" to={to}>
      View delivery attempts
    </Link>
  );
}
