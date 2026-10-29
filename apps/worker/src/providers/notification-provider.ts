import { createLogger } from "@im/logger";

const providerLogger = createLogger({
  service: "worker",
  bindings: {
    component: "notification_provider",
  },
});

export type NotificationDeliveryMode = "auto" | "live" | "log";

export type NotificationIncidentContext = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  priority: string;
  status: string;
  source: string;
  fingerprint: string;
  createdAt: string;
  service: {
    id: string;
    name: string;
  };
  url?: string;
};

export type NotificationLogContext = {
  id: string;
  channel: string;
  targetType: string;
  targetId: string | null;
  repeatIteration: number;
  attempt: number;
  eventAction?: string;
};

export type NotificationProviderMessage = {
  targetAddress: string;
  subject: string;
  body: string;
  incident: NotificationIncidentContext;
  notification: NotificationLogContext;
  providerSettings?: NotificationProviderSettings;
};

export type NotificationProviderSettings = {
  email?: {
    smtpHost?: string;
    smtpPort?: number;
    smtpSecurity?: "starttls" | "tls";
    smtpUsername?: string;
    smtpPassword?: string;
    fromName?: string;
    fromEmail?: string;
  };
  slack?: {
    webhookUrl?: string;
  };
  twilio?: {
    accountSid?: string;
    authToken?: string;
    fromPhoneNumber?: string;
  };
};

export type NotificationProviderResult = {
  providerMessageId?: string;
};

export class NotificationProviderError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "NotificationProviderError";
  }
}

export interface NotificationProvider {
  send(message: NotificationProviderMessage): Promise<NotificationProviderResult>;
}

export function resolveNotificationDeliveryMode(): NotificationDeliveryMode {
  const rawMode = process.env.NOTIFICATION_DELIVERY_MODE;

  if (rawMode === "live" || rawMode === "log" || rawMode === "auto") {
    return rawMode;
  }

  return "auto";
}

export function shouldUseLogDelivery(isConfigured: boolean): boolean {
  const mode = resolveNotificationDeliveryMode();
  return mode === "log" || (mode === "auto" && !isConfigured);
}

export function assertProviderConfigured(providerName: string, isConfigured: boolean): void {
  if (resolveNotificationDeliveryMode() === "live" && !isConfigured) {
    throw new Error(`${providerName} provider is not configured`);
  }
}

export function createLoggedProviderResult(providerName: string, message: NotificationProviderMessage) {
  providerLogger.info("Notification delivery logged", {
    provider: providerName,
    target_address: maskProviderTargetAddress(message.targetAddress),
    subject: message.subject,
    incident_id: message.incident.id,
    notification_id: message.notification.id,
  });

  return {
    providerMessageId: `log-${providerName}-${Date.now()}`,
  };
}

export function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function buildProviderHttpError(context: string, response: Response, body?: string): NotificationProviderError {
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
  const detail = body ? `: ${body}` : "";

  return new NotificationProviderError(
    `${context} failed with ${response.status}${detail}`,
    retryAfterSeconds,
  );
}

export async function fetchWithProviderTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const timeoutMs = Number(process.env.NOTIFICATION_HTTP_TIMEOUT_MS ?? 10_000);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Notification HTTP request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const retryAt = Date.parse(value);

  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

function maskProviderTargetAddress(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}/***`;
  } catch {
    // Ignore non-URL target identifiers.
  }

  const [localPart, domain] = value.split("@");

  if (localPart && domain) {
    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  return value ? "***" : "";
}
