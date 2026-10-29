import type {
  EscalationStateStatus,
  IncidentPriority,
  IncidentSeverity,
  IncidentStatus,
  NotificationStatus,
  ServiceStatus,
} from "@im/contracts";
import type { ReactNode } from "react";

import { useTranslateNode } from "../i18n";
import { cn } from "../utils";

type BadgeTone = "neutral" | "blue" | "green" | "yellow" | "orange" | "red";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
};

const tones: Record<BadgeTone, string> = {
  neutral: "bg-white/8 text-ink-muted",
  blue: "bg-accent/14 text-[#72c7ff]",
  green: "bg-success/14 text-[#72e09c]",
  yellow: "bg-warning/14 text-warning",
  orange: "bg-orange/16 text-[#ffad7d]",
  red: "bg-danger/16 text-[#ff98ad]",
};

const serviceStatusTone: Record<ServiceStatus, BadgeTone> = {
  normal: "green",
  degraded: "yellow",
  major: "orange",
  critical: "red",
};

const incidentSeverityTone: Record<IncidentSeverity, BadgeTone> = {
  critical: "red",
  high: "orange",
  medium: "yellow",
  low: "green",
};

const incidentPriorityTone: Record<IncidentPriority, BadgeTone> = {
  P1: "red",
  P2: "orange",
  P3: "yellow",
  P4: "blue",
  P5: "neutral",
};

const incidentStatusTone: Record<IncidentStatus, BadgeTone> = {
  triggered: "red",
  acknowledged: "blue",
  resolved: "green",
};

const escalationStateTone: Record<EscalationStateStatus, BadgeTone> = {
  active: "blue",
  paused: "yellow",
  stopped: "neutral",
  completed: "green",
};

const notificationStatusTone: Record<NotificationStatus, BadgeTone> = {
  pending: "neutral",
  sending: "blue",
  sent: "green",
  sent_after_ack: "green",
  failed: "red",
  retrying: "orange",
  skipped: "neutral",
};

const badgeBase = "inline-flex items-center rounded-full text-xs font-[650] leading-none min-h-6 px-2.25 capitalize whitespace-nowrap";

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  const translateNode = useTranslateNode();

  return <span className={cn(badgeBase, tones[tone])}>{translateNode(children)}</span>;
}

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return <Badge tone={serviceStatusTone[status]}>{status}</Badge>;
}

export function IncidentSeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return <Badge tone={incidentSeverityTone[severity]}>{severity}</Badge>;
}

export function IncidentPriorityBadge({ priority }: { priority: IncidentPriority }) {
  return <Badge tone={incidentPriorityTone[priority]}>{priority}</Badge>;
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge tone={incidentStatusTone[status]}>{status}</Badge>;
}

export function EscalationStateBadge({ status }: { status: EscalationStateStatus }) {
  return <Badge tone={escalationStateTone[status]}>{status}</Badge>;
}

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return <Badge tone={notificationStatusTone[status]}>{status}</Badge>;
}
