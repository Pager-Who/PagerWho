import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";
import { PlatformRoleSchema } from "./enums";

export const AuthSourceSchema = z.enum(["session"]);

export const PasswordSchema = z.string().min(8).max(128);

export const AuthenticatedUserSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string(),
});

export const AuthMeSchema = z.object({
  user: AuthenticatedUserSchema,
  auth_source: AuthSourceSchema,
  is_platform_admin: z.boolean(),
  platform_roles: z.array(PlatformRoleSchema),
});

export const AuthProviderSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean(),
  login_url: z.string(),
});

export const AuthProviderListSchema = z.object({
  active_provider: AuthProviderSchema.nullable(),
  email_password_enabled: z.boolean(),
});

export const RegisterRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  password: PasswordSchema,
  password_confirmation: PasswordSchema,
}).refine((value) => value.password === value.password_confirmation, {
  message: "Password confirmation must match password",
  path: ["password_confirmation"],
});

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const ResendEmailVerificationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const ConfirmEmailVerificationRequestSchema = z.object({
  token: z.string().min(32),
});

export const StartPasswordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const CompletePasswordResetRequestSchema = z.object({
  token: z.string().min(32),
  password: PasswordSchema,
});

export const AuthSessionSchema = z.object({
  id: UuidSchema,
  expires_at: DateTimeSchema,
});

export const AuthSessionResponseSchema = z.object({
  user: AuthenticatedUserSchema,
  session: AuthSessionSchema,
});

export const RegisterResponseSchema = z.object({
  user: AuthenticatedUserSchema,
  email_verification_required: z.boolean(),
});

export const ResendEmailVerificationResponseSchema = z.object({
  accepted: z.boolean(),
});

export const ConfirmEmailVerificationResponseSchema = z.object({
  user: AuthenticatedUserSchema,
});

export const StartPasswordResetResponseSchema = z.object({
  accepted: z.boolean(),
});

export const CompletePasswordResetResponseSchema = z.object({
  success: z.boolean(),
});

export const LogoutResponseSchema = z.object({
  revoked: z.boolean(),
});

export type AuthSource = z.infer<typeof AuthSourceSchema>;
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type AuthMe = z.infer<typeof AuthMeSchema>;
export type AuthProvider = z.infer<typeof AuthProviderSchema>;
export type AuthProviderList = z.infer<typeof AuthProviderListSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ResendEmailVerificationRequest = z.infer<typeof ResendEmailVerificationRequestSchema>;
export type ConfirmEmailVerificationRequest = z.infer<typeof ConfirmEmailVerificationRequestSchema>;
export type StartPasswordResetRequest = z.infer<typeof StartPasswordResetRequestSchema>;
export type CompletePasswordResetRequest = z.infer<typeof CompletePasswordResetRequestSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;
export type ResendEmailVerificationResponse = z.infer<typeof ResendEmailVerificationResponseSchema>;
export type ConfirmEmailVerificationResponse = z.infer<typeof ConfirmEmailVerificationResponseSchema>;
export type StartPasswordResetResponse = z.infer<typeof StartPasswordResetResponseSchema>;
export type CompletePasswordResetResponse = z.infer<typeof CompletePasswordResetResponseSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
