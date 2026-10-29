import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";
import { IncidentPrioritySchema, IncidentSeveritySchema } from "./enums";
import { IncidentSchema } from "./incidents";

export const WebhookIncidentLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

export const WebhookIncidentPayloadSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  details: z.unknown().optional(),
  severity: IncidentSeveritySchema.optional(),
  priority: IncidentPrioritySchema.optional(),
  source: z.string().min(1).optional(),
  event_key: z.string().min(1).optional(),
  eventKey: z.string().min(1).optional(),
  fingerprint: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  links: z.array(WebhookIncidentLinkSchema).optional(),
}).passthrough();

export const NormalizedWebhookEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  severity: IncidentSeveritySchema,
  priority: IncidentPrioritySchema,
  source: z.string(),
  event_key: z.string(),
  fingerprint: z.string(),
  status: z.enum(["triggered", "resolved"]),
  raw_payload: z.unknown(),
});

export const WebhookEndpointSchema = z.object({
  id: UuidSchema,
  service_id: UuidSchema,
  name: z.string(),
  url: z.string().url(),
  has_secret: z.boolean(),
  created_at: DateTimeSchema,
  disabled_at: DateTimeSchema.nullable(),
});

export const WebhookEndpointWithSecretSchema = WebhookEndpointSchema.extend({
  secret: z.string(),
  url_with_secret: z.string().url(),
});

export const CreateWebhookEndpointRequestSchema = z.object({});

export const WebhookIngestionResultSchema = z.object({
  event_id: UuidSchema,
  incident: IncidentSchema,
  normalized_event: NormalizedWebhookEventSchema,
  action: z.enum(["created", "merged", "resolved", "duplicate"]),
});

export type NormalizedWebhookEvent = z.infer<typeof NormalizedWebhookEventSchema>;
export type WebhookIncidentLink = z.infer<typeof WebhookIncidentLinkSchema>;
export type WebhookIncidentPayload = z.infer<typeof WebhookIncidentPayloadSchema>;
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;
export type WebhookEndpointWithSecret = z.infer<typeof WebhookEndpointWithSecretSchema>;
export type CreateWebhookEndpointRequest = z.infer<typeof CreateWebhookEndpointRequestSchema>;
export type WebhookIngestionResult = z.infer<typeof WebhookIngestionResultSchema>;
