import { z } from "zod";

import { DateTimeSchema, paginatedResponseSchema, PaginationQuerySchema, UuidSchema } from "./common";
import { ServiceStatusSchema } from "./enums";
import { WebhookEndpointWithSecretSchema } from "./webhooks";

export const ServiceSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  team_id: UuidSchema.nullable(),
  escalation_policy_id: UuidSchema.nullable(),
  status: ServiceStatusSchema,
  open_incident_count: z.number().int().nonnegative(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const CreateServiceRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  workspace_id: UuidSchema.optional(),
  team_id: UuidSchema.nullable().optional(),
  escalation_policy_id: UuidSchema.nullable().optional(),
});

export const UpdateServiceRequestSchema = CreateServiceRequestSchema.omit({ workspace_id: true }).partial();

export const ServiceFilterSchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  workspace_id: UuidSchema.optional(),
  health: z.enum(["impacted", "normal"]).optional(),
});

export const PaginatedServicesSchema = paginatedResponseSchema(ServiceSchema);

export const CreateServiceResponseSchema = z.object({
  service: ServiceSchema,
  default_webhook_endpoint: WebhookEndpointWithSecretSchema,
});

export type Service = z.infer<typeof ServiceSchema>;
export type CreateServiceRequest = z.infer<typeof CreateServiceRequestSchema>;
export type CreateServiceResponse = z.infer<typeof CreateServiceResponseSchema>;
export type UpdateServiceRequest = z.infer<typeof UpdateServiceRequestSchema>;
export type ServiceFilter = z.infer<typeof ServiceFilterSchema>;
export type PaginatedServices = z.infer<typeof PaginatedServicesSchema>;
