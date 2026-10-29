import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";

const UserConfigurableNotificationChannelSchema = z.enum(["email", "sms", "phone"]);

export const UserSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string(),
  notification_settings: z.object({
    contacts: z.object({
      has_email_delivery_webhook_url: z.boolean(),
      has_phone_number: z.boolean(),
      phone_number_verified: z.boolean(),
      phone_number_masked: z.string().nullable(),
      has_sms_phone_number: z.boolean(),
      sms_phone_number: z.string().nullable(),
      sms_phone_number_masked: z.string().nullable(),
      sms_verified: z.boolean(),
      has_voice_phone_number: z.boolean(),
      voice_phone_number: z.string().nullable(),
      voice_phone_number_masked: z.string().nullable(),
      voice_verified: z.boolean(),
    }),
    preferences: z.array(z.object({
      channel: UserConfigurableNotificationChannelSchema,
      enabled: z.boolean(),
      delay_seconds: z.number().int().min(0),
    })),
  }),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const UserNotificationChannelPreferenceSchema = z.object({
  channel: UserConfigurableNotificationChannelSchema,
  enabled: z.boolean(),
  delay_seconds: z.number().int().min(0),
});

export const UserNotificationPreferencesSchema = z.object({
  user_id: UuidSchema,
  contacts: z.object({
    has_email_delivery_webhook_url: z.boolean(),
    has_phone_number: z.boolean(),
    phone_number_verified: z.boolean(),
    phone_number_masked: z.string().nullable(),
    has_sms_phone_number: z.boolean(),
    sms_phone_number: z.string().nullable(),
    sms_phone_number_masked: z.string().nullable(),
    sms_verified: z.boolean(),
    has_voice_phone_number: z.boolean(),
    voice_phone_number: z.string().nullable(),
    voice_phone_number_masked: z.string().nullable(),
    voice_verified: z.boolean(),
  }),
  preferences: z.array(UserNotificationChannelPreferenceSchema),
  updated_at: DateTimeSchema,
});

export const UserPhoneVerificationStatusSchema = z.object({
  user_id: UuidSchema,
  has_phone_number: z.boolean(),
  phone_number_masked: z.string().nullable(),
  phone_number_verified: z.boolean(),
  has_sms_phone_number: z.boolean(),
  sms_phone_number: z.string().nullable(),
  sms_phone_number_masked: z.string().nullable(),
  sms_verified: z.boolean(),
  has_voice_phone_number: z.boolean(),
  voice_phone_number: z.string().nullable(),
  voice_phone_number_masked: z.string().nullable(),
  voice_verified: z.boolean(),
  verification_sent_at: DateTimeSchema.nullable(),
  sms_verification_sent_at: DateTimeSchema.nullable(),
  voice_verification_sent_at: DateTimeSchema.nullable(),
  updated_at: DateTimeSchema,
});

export const UserListQuerySchema = z.object({
  workspace_id: UuidSchema.optional(),
});

export const StartUserPhoneVerificationRequestSchema = z.object({
  channel: z.enum(["sms", "call"]).default("sms"),
  workspace_id: UuidSchema.optional(),
});

export const CheckUserPhoneVerificationRequestSchema = z.object({
  channel: z.enum(["sms", "call"]).default("sms"),
  code: z.string().min(3).max(16),
  workspace_id: UuidSchema.optional(),
});

export const UpdateUserNotificationPreferencesRequestSchema = z.object({
  email_delivery_webhook_url: z.string().url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Expected an HTTP delivery webhook URL")
    .nullable()
    .optional(),
  phone_number: z.string()
    .regex(/^\+[1-9]\d{7,14}$/, "Expected an E.164 phone number")
    .nullable()
    .optional(),
  sms_phone_number: z.string()
    .regex(/^\+[1-9]\d{7,14}$/, "Expected an E.164 phone number")
    .nullable()
    .optional(),
  sms_verified: z.literal(false).optional(),
  voice_phone_number: z.string()
    .regex(/^\+[1-9]\d{7,14}$/, "Expected an E.164 phone number")
    .nullable()
    .optional(),
  voice_verified: z.literal(false).optional(),
  preferences: z.array(UserNotificationChannelPreferenceSchema).optional(),
}).refine((value) => {
  if (!value.preferences) {
    return true;
  }

  return new Set(value.preferences.map((preference) => preference.channel)).size === value.preferences.length;
}, "Notification preference channels must be unique");

export type User = z.infer<typeof UserSchema>;
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
export type UserNotificationChannelPreference = z.infer<typeof UserNotificationChannelPreferenceSchema>;
export type UserNotificationPreferences = z.infer<typeof UserNotificationPreferencesSchema>;
export type UserPhoneVerificationStatus = z.infer<typeof UserPhoneVerificationStatusSchema>;
export type StartUserPhoneVerificationRequest = z.infer<typeof StartUserPhoneVerificationRequestSchema>;
export type CheckUserPhoneVerificationRequest = z.infer<typeof CheckUserPhoneVerificationRequestSchema>;
export type UpdateUserNotificationPreferencesRequest = z.infer<typeof UpdateUserNotificationPreferencesRequestSchema>;
