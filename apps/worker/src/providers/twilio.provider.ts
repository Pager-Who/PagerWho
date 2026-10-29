import type {
  NotificationProvider,
  NotificationProviderMessage,
  NotificationProviderResult,
} from "./notification-provider";
import twilio from "twilio";
import {
  assertProviderConfigured,
  createLoggedProviderResult,
  NotificationProviderError,
  shouldUseLogDelivery,
} from "./notification-provider";

type TwilioDeliveryClient = {
  messages: {
    create(input: { to: string; from: string; body: string }): Promise<{ sid?: string | null }>;
  };
  calls: {
    create(input: { to: string; from: string; twiml: string }): Promise<{ sid?: string | null }>;
  };
};

type TwilioClientFactory = (accountSid: string, authToken: string, options: { timeout: number }) => TwilioDeliveryClient;

export class TwilioSmsProvider implements NotificationProvider {
  constructor(private readonly createClient: TwilioClientFactory = createTwilioClient) {}

  async send(message: NotificationProviderMessage): Promise<NotificationProviderResult> {
    const config = resolveTwilioConfig(message);
    const isConfigured = Boolean(config) && isE164PhoneNumber(message.targetAddress);

    assertProviderConfigured("twilio sms", isConfigured);

    if (!config || !isConfigured || shouldUseLogDelivery(isConfigured)) {
      return createLoggedProviderResult("twilio-sms", message);
    }

    const client = this.createClient(config.accountSid, config.authToken, { timeout: config.timeoutMs });
    const response = await sendWithTwilioError("Twilio Messages", () => client.messages.create({
      to: message.targetAddress,
      from: config.fromPhoneNumber,
      body: buildSmsBody(message),
    }));

    return {
      providerMessageId: typeof response.sid === "string" ? response.sid : `twilio-sms-${Date.now()}`,
    };
  }
}

export class TwilioPhoneProvider implements NotificationProvider {
  constructor(private readonly createClient: TwilioClientFactory = createTwilioClient) {}

  async send(message: NotificationProviderMessage): Promise<NotificationProviderResult> {
    const config = resolveTwilioConfig(message);
    const isConfigured = Boolean(config) && isE164PhoneNumber(message.targetAddress);

    assertProviderConfigured("twilio phone", isConfigured);

    if (!config || !isConfigured || shouldUseLogDelivery(isConfigured)) {
      return createLoggedProviderResult("twilio-phone", message);
    }

    const client = this.createClient(config.accountSid, config.authToken, { timeout: config.timeoutMs });
    const response = await sendWithTwilioError("Twilio Calls", () => client.calls.create({
      to: message.targetAddress,
      from: config.fromPhoneNumber,
      twiml: buildVoiceTwiml(message),
    }));

    return {
      providerMessageId: typeof response.sid === "string" ? response.sid : `twilio-call-${Date.now()}`,
    };
  }
}

function resolveTwilioConfig(message: NotificationProviderMessage) {
  const accountSid = message.providerSettings?.twilio?.accountSid;
  const authToken = message.providerSettings?.twilio?.authToken;
  const fromPhoneNumber = message.providerSettings?.twilio?.fromPhoneNumber;
  const timeoutMs = Number(process.env.NOTIFICATION_HTTP_TIMEOUT_MS ?? 10_000);

  if (!accountSid || !authToken || !fromPhoneNumber) {
    return null;
  }

  return {
    accountSid,
    authToken,
    fromPhoneNumber,
    timeoutMs,
  };
}

function createTwilioClient(accountSid: string, authToken: string, options: { timeout: number }): TwilioDeliveryClient {
  return twilio(accountSid, authToken, {
    timeout: options.timeout,
  });
}

async function sendWithTwilioError<T>(context: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toTwilioProviderError(context, error);
  }
}

function toTwilioProviderError(context: string, error: unknown): NotificationProviderError {
  if (error instanceof NotificationProviderError) {
    return error;
  }

  if (error instanceof Error) {
    const twilioError = error as Error & { status?: number; code?: number; moreInfo?: string };
    const status = twilioError.status ? ` with ${twilioError.status}` : "";
    const code = twilioError.code ? ` code ${twilioError.code}` : "";
    const moreInfo = twilioError.moreInfo ? ` (${twilioError.moreInfo})` : "";

    return new NotificationProviderError(`${context} failed${status}${code}: ${error.message}${moreInfo}`);
  }

  return new NotificationProviderError(`${context} failed`);
}

function buildSmsBody(message: NotificationProviderMessage): string {
  const lines = [
    message.subject,
    `Status: ${message.incident.status}`,
    message.incident.url ? `Open: ${message.incident.url}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n").slice(0, 480);
}

function buildVoiceTwiml(message: NotificationProviderMessage): string {
  const lifecycleMessage = message.notification.eventAction === "incident.resolved"
    ? "The incident has been resolved."
    : message.notification.eventAction === "incident.acknowledged"
      ? "The incident has been acknowledged."
      : message.notification.eventAction === "incident.priority_updated"
        ? `The incident priority changed to ${message.incident.priority}.`
        : "Please acknowledge or resolve the incident.";
  const spoken = [
    "Incident alert.",
    `${message.incident.priority} ${message.incident.severity} severity incident on ${message.incident.service.name}.`,
    message.incident.title,
    lifecycleMessage,
  ].join(" ");

  return `<Response><Say>${escapeXml(spoken)}</Say></Response>`;
}

function isE164PhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
