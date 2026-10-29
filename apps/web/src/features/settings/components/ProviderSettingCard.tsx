import type { WorkspaceNotificationProviderSetting } from "@im/contracts";
import type { ReactNode } from "react";

import { Badge, Button, Panel } from "../../../shared/components";
import { cn } from "../../../shared/utils";

type ProviderSettingCardProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  footerAction?: ReactNode;
  isSaving: boolean;
  onSave: () => void;
  saveLabel?: ReactNode;
  setting: WorkspaceNotificationProviderSetting | undefined;
  title: string;
};

export function ProviderSettingCard({
  children,
  className,
  disabled = false,
  footerAction,
  isSaving,
  onSave,
  saveLabel,
  setting,
  title,
}: ProviderSettingCardProps) {
  const statusItems = providerSettingDescriptionItems(setting);
  const isConfigured = Boolean(setting?.configured);

  return (
    <Panel className={cn("rounded-xl grid gap-4 grid-rows-[auto_auto_1fr_auto] h-full", className)} tone="secondary">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="grid gap-1 min-w-0">
          <span className="text-accent-blue text-[11px] font-[750] leading-none uppercase">Provider</span>
          <h3 className="text-ink text-[18px] font-[650] leading-[1.2] m-0">{title}</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge tone={setting?.enabled ? "green" : "neutral"}>{setting?.enabled ? "enabled" : "disabled"}</Badge>
          <Badge tone={isConfigured ? "blue" : "yellow"}>{isConfigured ? "configured" : "missing"}</Badge>
        </div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] m-0">
        {statusItems.map(([label, value]) => (
          <div className="bg-surface-1/65 border border-hairline-soft rounded-lg grid gap-1 min-w-0 px-3 py-2.5" key={label}>
            <dt className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">{label}</dt>
            <dd className="text-ink text-[13px] leading-[1.35] m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="content-start grid gap-3.5 min-w-0 pt-0.5">
        {children}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-hairline-soft pt-3.5">
        {footerAction ? <div className="flex w-full flex-wrap justify-end gap-2.5 sm:w-auto">{footerAction}</div> : null}
        <Button className="w-full sm:w-auto sm:min-w-36" disabled={disabled} isLoading={isSaving} onClick={onSave} variant="primary">
          {saveLabel ?? `Save ${title}`}
        </Button>
      </div>
    </Panel>
  );
}

function providerSettingDescriptionItems(
  setting: WorkspaceNotificationProviderSetting | undefined,
): Array<[string, string | number]> {
  if (!setting) return [["Credentials", "not configured"]];

  if (setting.provider === "slack") {
    return [
      ["Webhook URL", setting.details.has_slack_webhook_url ? "stored" : "-"],
    ];
  }

  if (setting.provider === "email") {
    return [
      ["SMTP server", setting.details.smtp_host && setting.details.smtp_port ? `${setting.details.smtp_host}:${setting.details.smtp_port}` : "-"],
      ["Security", setting.details.smtp_security?.toUpperCase() ?? "-"],
      ["Credentials", setting.details.has_smtp_password ? "stored" : "-"],
      ["From email", setting.details.from_email ?? "-"],
    ];
  }

  return [
    ["Account SID", setting.details.account_sid_masked ?? "-"],
    ["Auth token", setting.details.has_auth_token ? "stored" : "-"],
    ["From phone", setting.details.from_phone_number_masked ?? "-"],
  ];
}
