export type WebhookIngestionErrorCode =
  | "webhook_endpoint_disabled"
  | "webhook_endpoint_not_found"
  | "webhook_payload_invalid"
  | "webhook_secret_invalid";

export class WebhookIngestionError extends Error {
  constructor(
    public readonly code: WebhookIngestionErrorCode,
    message: string,
  ) {
    super(message);
  }
}
