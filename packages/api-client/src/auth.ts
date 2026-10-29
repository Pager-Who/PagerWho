import type {
  AuthMe,
  AuthProviderList,
  AuthSessionResponse,
  CompletePasswordResetRequest,
  CompletePasswordResetResponse,
  ConfirmEmailVerificationRequest,
  ConfirmEmailVerificationResponse,
  LoginRequest,
  LogoutResponse,
  RegisterRequest,
  RegisterResponse,
  ResendEmailVerificationRequest,
  ResendEmailVerificationResponse,
  StartPasswordResetRequest,
  StartPasswordResetResponse,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createAuthApi(client: ApiClient) {
  return {
    listProviders() {
      return client.request<AuthProviderList>("/auth/providers");
    },
    getMe() {
      return client.request<AuthMe>("/auth/me");
    },
    register(input: RegisterRequest) {
      return client.request<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    login(input: LoginRequest) {
      return client.request<AuthSessionResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    resendEmailVerification(input: ResendEmailVerificationRequest) {
      return client.request<ResendEmailVerificationResponse>("/auth/email-verification/resend", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    confirmEmailVerification(input: ConfirmEmailVerificationRequest) {
      return client.request<ConfirmEmailVerificationResponse>("/auth/email-verification/confirm", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    startPasswordReset(input: StartPasswordResetRequest) {
      return client.request<StartPasswordResetResponse>("/auth/password-reset/start", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    completePasswordReset(input: CompletePasswordResetRequest) {
      return client.request<CompletePasswordResetResponse>("/auth/password-reset/complete", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    logout() {
      return client.request<LogoutResponse>("/auth/logout", {
        method: "POST",
      });
    },
  };
}
