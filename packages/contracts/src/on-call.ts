import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";
import { OnCallLayerSchema, OnCallRotationTypeSchema } from "./enums";

export const OnCallRotationParticipantSchema = z.object({
  user_id: UuidSchema,
  position: z.number().int().min(0),
});

export const OnCallRotationSchema = z.object({
  id: UuidSchema,
  schedule_id: UuidSchema,
  layer: OnCallLayerSchema,
  rotation_type: OnCallRotationTypeSchema,
  rotation_interval: z.number().int().min(1),
  starts_at: DateTimeSchema,
  timezone: z.string(),
  participants: z.array(OnCallRotationParticipantSchema),
});

export const OnCallScheduleSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  name: z.string(),
  team_id: UuidSchema.nullable(),
  service_id: UuidSchema.nullable(),
  timezone: z.string(),
  rotations: z.array(OnCallRotationSchema),
  overrides: z.array(z.lazy(() => OnCallOverrideSchema)),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const OnCallOverrideSchema = z.object({
  id: UuidSchema,
  schedule_id: UuidSchema,
  user_id: UuidSchema,
  layer: OnCallLayerSchema,
  starts_at: DateTimeSchema,
  ends_at: DateTimeSchema,
  created_at: DateTimeSchema,
});

export const CurrentOnCallSchema = z.object({
  primary_user_id: UuidSchema.nullable(),
  secondary_user_id: UuidSchema.nullable(),
  resolved_at: DateTimeSchema,
});

export const OnCallPreviewEntrySchema = z.object({
  starts_at: DateTimeSchema,
  ends_at: DateTimeSchema,
  local_starts_at: z.string(),
  local_ends_at: z.string(),
  primary_user_id: UuidSchema.nullable(),
  secondary_user_id: UuidSchema.nullable(),
});

export const OnCallSchedulePreviewSchema = z.object({
  schedule_id: UuidSchema,
  timezone: z.string(),
  starts_at: DateTimeSchema,
  ends_at: DateTimeSchema,
  step_minutes: z.number().int().positive(),
  entries: z.array(OnCallPreviewEntrySchema),
});

export const CurrentOnCallQuerySchema = z.object({
  service_id: UuidSchema,
  at: DateTimeSchema.optional(),
});

export const OnCallSchedulePreviewQuerySchema = z.object({
  starts_at: DateTimeSchema.optional(),
  ends_at: DateTimeSchema.optional(),
  step_minutes: z.coerce.number().int().min(15).max(1440).default(1440),
});

export const UpsertOnCallRotationRequestSchema = z.object({
  id: UuidSchema.optional(),
  layer: OnCallLayerSchema,
  rotation_type: OnCallRotationTypeSchema,
  rotation_interval: z.number().int().min(1),
  starts_at: DateTimeSchema,
  timezone: z.string(),
  participants: z.array(UuidSchema).min(1),
});

function validateSharedRotationCadence(
  rotations: Array<z.infer<typeof UpsertOnCallRotationRequestSchema>> | undefined,
  ctx: z.RefinementCtx,
) {
  if (!rotations || rotations.length <= 1) {
    return;
  }

  const firstRotation = rotations[0];

  if (!firstRotation) {
    return;
  }

  const firstStartsAt = Date.parse(firstRotation.starts_at);

  rotations.forEach((rotation, index) => {
    if (
      rotation.rotation_type !== firstRotation.rotation_type
      || rotation.rotation_interval !== firstRotation.rotation_interval
      || Date.parse(rotation.starts_at) !== firstStartsAt
      || rotation.timezone !== firstRotation.timezone
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "All rotations in a schedule must share the same cadence",
        path: ["rotations", index],
      });
    }
  });
}

const OnCallScheduleRequestBaseSchema = z.object({
  name: z.string().min(1),
  workspace_id: UuidSchema,
  team_id: UuidSchema.nullable().optional(),
  service_id: UuidSchema.nullable().optional(),
  timezone: z.string().min(1),
  rotations: z.array(UpsertOnCallRotationRequestSchema).min(1),
});

export const CreateOnCallScheduleRequestSchema = OnCallScheduleRequestBaseSchema
  .superRefine((input, ctx) => validateSharedRotationCadence(input.rotations, ctx));

export const UpdateOnCallScheduleRequestSchema = OnCallScheduleRequestBaseSchema.omit({ workspace_id: true })
  .partial()
  .extend({
    rotations: z.array(UpsertOnCallRotationRequestSchema).optional(),
  })
  .superRefine((input, ctx) => validateSharedRotationCadence(input.rotations, ctx));

export const CreateOnCallOverrideRequestSchema = z.object({
  schedule_id: UuidSchema,
  user_id: UuidSchema,
  layer: OnCallLayerSchema,
  starts_at: DateTimeSchema,
  ends_at: DateTimeSchema,
});

export type OnCallRotationParticipant = z.infer<typeof OnCallRotationParticipantSchema>;
export type OnCallRotation = z.infer<typeof OnCallRotationSchema>;
export type OnCallSchedule = z.infer<typeof OnCallScheduleSchema>;
export type OnCallOverride = z.infer<typeof OnCallOverrideSchema>;
export type CurrentOnCall = z.infer<typeof CurrentOnCallSchema>;
export type OnCallPreviewEntry = z.infer<typeof OnCallPreviewEntrySchema>;
export type OnCallSchedulePreview = z.infer<typeof OnCallSchedulePreviewSchema>;
export type CurrentOnCallQuery = z.infer<typeof CurrentOnCallQuerySchema>;
export type OnCallSchedulePreviewQuery = z.infer<typeof OnCallSchedulePreviewQuerySchema>;
export type UpsertOnCallRotationRequest = z.infer<typeof UpsertOnCallRotationRequestSchema>;
export type CreateOnCallScheduleRequest = z.infer<typeof CreateOnCallScheduleRequestSchema>;
export type UpdateOnCallScheduleRequest = z.infer<typeof UpdateOnCallScheduleRequestSchema>;
export type CreateOnCallOverrideRequest = z.infer<typeof CreateOnCallOverrideRequestSchema>;
