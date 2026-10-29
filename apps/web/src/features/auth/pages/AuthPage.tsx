import { ApiClientError } from "@im/api-client";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiBaseUrl, authApi } from "../../../shared/api/client";
import { queryKeys } from "../../../shared/api/queryKeys";
import { useAuth } from "../../../shared/auth";
import { BrandMark, Button, ErrorState, Field, TextInput } from "../../../shared/components";
import { LocalizedText } from "../../../shared/i18n";
import { ThemeToggleButton } from "../../../shared/theme";
import { cn } from "../../../shared/utils";

type AuthMode = "login" | "register" | "forgot" | "reset";
type AuthErrorSource = "submit" | "resend";

const postLoginProjectsPath = "/projects?post_login=1";
const authLinkClassName = "inline-flex min-h-8.5 cursor-pointer items-center rounded-md px-1.5 text-xs font-[650] text-accent transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isCheckingAuth, login } = useAuth();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialMode = getInitialMode(queryParams);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [errorSource, setErrorSource] = useState<AuthErrorSource>("submit");
  const [notice, setNotice] = useState<string | null>(null);
  const [showVerificationFollowUp, setShowVerificationFollowUp] = useState(false);
  const [isSsoRedirecting, setIsSsoRedirecting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const providersQuery = useQuery({
    queryKey: queryKeys.auth.providers(),
    queryFn: () => authApi.listProviders(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const activeProvider = providersQuery.data?.active_provider ?? null;
  const shouldShowSsoButton = mode === "login" && Boolean(activeProvider);
  const returnTo = useMemo(() => getReturnTo(location.state), [location.state]);
  const authError = queryParams.get("auth_error");
  const isVerificationMode = queryParams.get("mode") === "verify-email";
  const verificationToken = isVerificationMode ? queryParams.get("token") : null;
  const isVerificationTokenMissing = isVerificationMode && !verificationToken;
  const resetToken = queryParams.get("mode") === "reset-password" ? queryParams.get("token") : null;
  const isResetTokenMissing = mode === "reset" && !resetToken;
  const isSettingNewPassword = mode === "register" || mode === "reset";
  const passwordTooShort = isSettingNewPassword
    && password.length > 0
    && password.length < 8;
  const passwordConfirmationMismatch = isSettingNewPassword
    && passwordConfirmation.length > 0
    && password !== passwordConfirmation;

  useEffect(() => {
    if (!isCheckingAuth && isAuthenticated) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, isCheckingAuth, navigate, returnTo]);

  useEffect(() => {
    if (!verificationToken) {
      return;
    }

    let cancelled = false;
    setIsSubmitting(true);
    setError(null);
    authApi.confirmEmailVerification({ token: verificationToken })
      .then(() => {
        if (cancelled) {
          return;
        }
        setNotice("Email verified. You can sign in now.");
        setMode("login");
        navigate("/login", { replace: true, state: location.state });
      })
      .catch((verificationError) => {
        if (!cancelled) {
          setError(verificationError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSubmitting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.state, navigate, verificationToken]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setErrorSource("submit");
    setIsResendingVerification(false);
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        if (password !== passwordConfirmation) {
          throw new Error("Password confirmation does not match.");
        }

        await authApi.register({
          email: email.trim(),
          name: name.trim(),
          password,
          password_confirmation: passwordConfirmation,
        });
        setPassword("");
        setPasswordConfirmation("");
        setMode("login");
        setShowVerificationFollowUp(true);
        setNotice("Account created. We sent a verification email. Verify your email before signing in.");
        return;
      }

      if (mode === "forgot") {
        await authApi.startPasswordReset({
          email: email.trim(),
        });
        setMode("login");
        setNotice("If the account exists, a password reset email has been sent.");
        return;
      }

      if (mode === "reset") {
        if (!resetToken) {
          throw new Error("Password reset token is missing.");
        }
        if (password !== passwordConfirmation) {
          throw new Error("Password confirmation does not match.");
        }

        await authApi.completePasswordReset({
          password,
          token: resetToken,
        });
        setPassword("");
        setPasswordConfirmation("");
        setMode("login");
        navigate("/login", { replace: true, state: location.state });
        setNotice("Password reset complete. Sign in with your new password.");
        return;
      }

      const session = await authApi.login({
        email: email.trim(),
        password,
      });
      setShowVerificationFollowUp(false);
      login(session.user.id);
      navigate(returnTo, { replace: true });
    } catch (submitError) {
      if (mode === "login" && submitError instanceof ApiClientError && submitError.code === "email_verification_required") {
        setShowVerificationFollowUp(true);
      }
      setError(submitError);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    setError(null);
    setNotice(null);
    setErrorSource("resend");
    setIsResendingVerification(true);

    try {
      await authApi.resendEmailVerification({ email: email.trim() });
      setNotice("If the account exists and still needs verification, a verification email has been sent.");
    } catch (resendError) {
      setError(resendError);
    } finally {
      setIsResendingVerification(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setErrorSource("submit");
    setShowVerificationFollowUp(false);
    setPassword("");
    setPasswordConfirmation("");
  }

  function handleSsoLogin() {
    if (!activeProvider) {
      return;
    }

    setIsSsoRedirecting(true);
    window.location.assign(buildProviderLoginUrl(activeProvider.login_url, returnTo));
  }

  return (
    <LocalizedText>
      <main className="flex min-h-[100dvh] items-start overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0)_280px),var(--color-canvas)] px-4 py-6 sm:px-7.5 sm:py-10">
        <section className="mx-auto grid w-full max-w-[30rem] gap-6">
          <div className="flex items-center justify-between gap-2.5 text-[15px] font-bold text-ink">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span>Pager Who</span>
            </div>
            <ThemeToggleButton />
          </div>

          <section className="grid gap-6 rounded-2xl border border-hairline bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.016)),var(--color-surface-1)] p-5.5 sm:p-7">
            <div className="grid gap-3">
              <h1 className="m-0 text-[32px] font-[650] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[34px]">{getTitle(mode)}</h1>
              <p className="m-0 max-w-[36ch] text-sm leading-[1.5] text-ink-muted">
                {getDescription(mode, Boolean(activeProvider))}
              </p>
            </div>

            {authError ? (
              <div role="alert">
                <ErrorState error={formatAuthError(authError)} title="Could not complete sign in" />
              </div>
            ) : null}
            {notice ? (
              <div aria-live="polite" className="rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm font-[650] leading-[1.45] text-ink" role="status">
                {notice}
              </div>
            ) : null}

            {mode === "login" && !verificationToken && (providersQuery.isLoading || providersQuery.error || shouldShowSsoButton) ? (
              <div className="grid gap-3">
                {providersQuery.error ? (
                  <div role="alert">
                    <ErrorState
                      onRetry={() => providersQuery.refetch()}
                      error="Single sign-on is unavailable right now. You can still sign in with your email account."
                      title="Could not load sign-in providers"
                    />
                  </div>
                ) : null}

                <div className="grid min-h-13 content-center">
                  {providersQuery.isLoading ? (
                    <p aria-live="polite" className="m-0 flex min-h-13 items-center justify-center text-xs font-[650] text-ink-muted" role="status">
                      Checking for additional sign-in options…
                    </p>
                  ) : null}

                  {shouldShowSsoButton && activeProvider ? (
                    <button
                      aria-busy={isSsoRedirecting || undefined}
                      className={cn(
                        "group flex min-h-13 cursor-pointer items-center justify-between gap-3 rounded-xl border border-hairline bg-ink px-4 text-left text-canvas transition duration-120 ease hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
                        isSsoRedirecting ? "opacity-70" : "",
                      )}
                      disabled={isSsoRedirecting}
                      onClick={handleSsoLogin}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-2.5 text-sm font-[750]">
                        {isSsoRedirecting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} strokeWidth={2.2} /> : <KeyRound size={16} strokeWidth={2.2} />}
                        {isSsoRedirecting ? "Opening sign-in…" : `Continue with ${activeProvider.label}`}
                      </span>
                      {!isSsoRedirecting ? <ArrowRight className="transition-transform duration-120 ease group-hover:translate-x-0.5" size={16} strokeWidth={2.2} /> : null}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {isVerificationTokenMissing ? (
              <div role="alert">
                <ErrorState
                  error="This email verification link is missing or incomplete. Request a new verification email to continue."
                  title="Verification link is invalid"
                />
              </div>
            ) : null}

            {shouldShowSsoButton && activeProvider && !verificationToken && !providersQuery.isLoading ? (
              <div className="flex items-center gap-3 text-xs font-[650] text-ink-subtle" role="separator">
                <span aria-hidden="true" className="h-px flex-1 bg-hairline-soft" />
                <span>Or continue with email</span>
                <span aria-hidden="true" className="h-px flex-1 bg-hairline-soft" />
              </div>
            ) : null}

            {mode !== "reset" && (!verificationToken || !isSubmitting) ? (
              <div className="grid grid-cols-2 gap-1 rounded-full border border-hairline bg-white/4 p-1" role="tablist">
                {(["login", "register"] as const).map((item) => (
                  <button
                    aria-selected={mode === item}
                    aria-controls={item === "login" ? "auth-panel-login" : "auth-panel-register"}
                    className={cn(
                      "min-h-9.5 cursor-pointer rounded-full border-0 bg-transparent text-sm font-[650]",
                      mode === item ? "bg-surface-2 text-ink" : "text-ink-muted",
                    )}
                    id={item === "login" ? "auth-tab-login" : "auth-tab-register"}
                    key={item}
                    onClick={() => switchMode(item)}
                    role="tab"
                    type="button"
                  >
                    {item === "login" ? "Login" : "Create account"}
                  </button>
                ))}
              </div>
            ) : null}

            {verificationToken && isSubmitting ? (
              <div aria-live="polite" className="flex min-h-13 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm font-[650] text-ink" role="status">
                <Loader2 aria-hidden="true" className="animate-spin text-ink-muted" size={16} />
                <span>Verifying your email…</span>
              </div>
            ) : null}

            {!verificationToken || !isSubmitting ? (
              <form
                aria-labelledby={mode === "login" ? "auth-tab-login" : mode === "register" ? "auth-tab-register" : undefined}
                className="grid gap-5 border-t border-hairline-soft pt-5"
                id={mode === "login" ? "auth-panel-login" : mode === "register" ? "auth-panel-register" : undefined}
                onSubmit={handleSubmit}
                role={mode === "login" || mode === "register" ? "tabpanel" : undefined}
              >
              {isResetTokenMissing ? (
                <ErrorState
                  action={<Button onClick={() => switchMode("login")} size="sm" variant="ghost">Back to sign in</Button>}
                  error="This password reset link is missing or incomplete. Request a new reset email to continue."
                  title="Password reset link is invalid"
                />
              ) : null}

              {!isResetTokenMissing ? <div className="grid gap-3.5">
                {mode === "register" ? (
                  <Field label="Name" required>
                    <TextInput
                      autoComplete="name"
                      disabled={isSubmitting || isResendingVerification}
                      onChange={(event) => setName(event.target.value)}
                      required
                      value={name}
                    />
                  </Field>
                ) : null}

                {mode !== "reset" ? (
                  <Field label="Email" required>
                    <TextInput
                      autoFocus={mode === "register" || mode === "login" || mode === "forgot"}
                      autoComplete="email"
                      disabled={isSubmitting || isResendingVerification}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </Field>
                ) : null}

                {mode !== "forgot" ? (
                  <Field label={mode === "reset" ? "New password" : "Password"} required>
                    <TextInput
                      aria-describedby={isSettingNewPassword ? `${mode}-password-requirements` : undefined}
                      aria-invalid={passwordTooShort || undefined}
                      autoFocus={mode === "reset"}
                      autoComplete={mode === "register" ? "new-password" : mode === "reset" ? "new-password" : "current-password"}
                      disabled={isSubmitting || isResendingVerification}
                      minLength={8}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                    {isSettingNewPassword ? (
                      <p
                        className={cn(
                          "m-0 text-xs font-[650]",
                          passwordTooShort ? "text-red-400" : "text-ink-muted",
                        )}
                        id={`${mode}-password-requirements`}
                      >
                        Password must be at least 8 characters.
                      </p>
                    ) : null}
                  </Field>
                ) : null}

                {isSettingNewPassword ? (
                  <Field label="Confirm password" required>
                    <TextInput
                      aria-describedby={passwordConfirmationMismatch ? `${mode}-password-mismatch` : undefined}
                      aria-invalid={passwordConfirmationMismatch || undefined}
                      autoComplete="new-password"
                      disabled={isSubmitting || isResendingVerification}
                      minLength={8}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      required
                      type="password"
                      value={passwordConfirmation}
                    />
                    {passwordConfirmationMismatch ? (
                      <p className="m-0 text-xs font-[650] text-red-400" id={`${mode}-password-mismatch`}>
                        Passwords do not match.
                      </p>
                    ) : null}
                  </Field>
                ) : null}
              </div> : null}

              {error && !isResetTokenMissing ? (
                <div role="alert">
                  <ErrorState
                    error={formatAuthSubmitError(error, Boolean(verificationToken), errorSource === "resend")}
                    title={getErrorTitle(mode, Boolean(verificationToken), errorSource === "resend")}
                  />
                </div>
              ) : null}

              {!isResetTokenMissing ? (
                <Button
                  disabled={!canSubmit(mode, { email, name, password, passwordConfirmation, resetToken }) || isResendingVerification}
                  isLoading={isSubmitting}
                  type="submit"
                  variant="secondary"
                >
                  {getSubmitLabel(mode)}
                </Button>
              ) : null}

              {!isResetTokenMissing ? <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                {mode === "login" ? (
                  <button className={authLinkClassName} onClick={() => switchMode("forgot")} type="button">
                    Forgot password?
                  </button>
                ) : null}
                {mode === "forgot" || mode === "reset" ? (
                  <button className={authLinkClassName} onClick={() => switchMode("login")} type="button">
                    Back to sign in
                  </button>
                ) : null}
                {mode === "login" && email.trim() && showVerificationFollowUp ? (
                  <button aria-busy={isResendingVerification || undefined} className={cn(authLinkClassName, "gap-1.5")} disabled={isResendingVerification || isSubmitting} onClick={handleResendVerification} type="button">
                    {isResendingVerification ? <Loader2 aria-hidden="true" className="animate-spin" size={13} /> : null}
                    {isResendingVerification ? "Sending…" : "Resend verification email"}
                  </button>
                ) : null}
              </div> : null}
              </form>
            ) : null}
          </section>
        </section>
      </main>
    </LocalizedText>
  );
}

function buildProviderLoginUrl(loginUrl: string, returnTo: string) {
  const baseUrl = new URL(apiBaseUrl);
  const url = loginUrl.startsWith("/")
    ? new URL(loginUrl, baseUrl.origin)
    : new URL(`${baseUrl.pathname.replace(/\/+$/, "")}/${loginUrl}`, baseUrl.origin);

  url.searchParams.set("return_to", returnTo);

  return url.toString();
}

function getInitialMode(params: URLSearchParams): AuthMode {
  if (params.get("mode") === "reset-password") {
    return "reset";
  }

  return "login";
}

function getReturnTo(state: unknown) {
  const rawReturnTo = typeof state === "object" && state && "returnTo" in state
    ? (state as { returnTo?: unknown }).returnTo
    : undefined;

  if (typeof rawReturnTo !== "string" || !rawReturnTo.startsWith("/") || rawReturnTo.startsWith("//")) {
    return postLoginProjectsPath;
  }

  return rawReturnTo.startsWith("/login") ? postLoginProjectsPath : rawReturnTo;
}

function getTitle(mode: AuthMode) {
  if (mode === "register") {
    return "Create account";
  }

  if (mode === "forgot") {
    return "Reset password";
  }

  if (mode === "reset") {
    return "Choose a new password";
  }

  return "Sign in";
}

function getSubmitLabel(mode: AuthMode) {
  if (mode === "register") {
    return "Create account";
  }

  if (mode === "forgot") {
    return "Send reset email";
  }

  if (mode === "reset") {
    return "Update password";
  }

  return "Sign in";
}

function getErrorTitle(mode: AuthMode, isVerifyingEmail = false, isResendingVerification = false) {
  if (isResendingVerification) {
    return "Could not resend verification email";
  }

  if (isVerifyingEmail) {
    return "Could not verify email";
  }

  if (mode === "register") {
    return "Could not create account";
  }

  if (mode === "forgot" || mode === "reset") {
    return "Could not reset password";
  }

  return "Could not sign in";
}

function canSubmit(
  mode: AuthMode,
  input: { email: string; name: string; password: string; passwordConfirmation: string; resetToken: string | null },
) {
  if (mode === "forgot") {
    return Boolean(input.email.trim());
  }

  if (mode === "reset") {
    return Boolean(
      input.resetToken
      && input.password.length >= 8
      && input.password === input.passwordConfirmation,
    );
  }

  if (mode === "register") {
    return Boolean(
      input.email.trim()
      && input.name.trim()
      && input.password.length >= 8
      && input.password === input.passwordConfirmation,
    );
  }

  return Boolean(input.email.trim() && input.password.length >= 8);
}

function formatAuthError(code: string) {
  return code.replaceAll("_", " ");
}

function getDescription(mode: AuthMode, hasSsoProvider: boolean) {
  if (mode === "register") {
    return "Create an account to manage incidents, services, and on-call response.";
  }

  if (mode === "forgot") {
    return "Enter your email and we will send instructions to reset your password.";
  }

  if (mode === "reset") {
    return "Choose a new password for your Pager Who account.";
  }

  return hasSsoProvider
    ? "Sign in with SSO or your email account to manage incidents, services, and on-call response."
    : "Sign in with your email account to manage incidents, services, and on-call response.";
}

function formatAuthSubmitError(error: unknown, isVerifyingEmail = false, isResendingVerification = false) {
  if (isResendingVerification && error instanceof ApiClientError && error.code === "invalid_email_verification_request") {
    return "Enter a valid email address before resending the verification email.";
  }

  if (isResendingVerification) {
    return "We could not resend the verification email. Check your connection and try again.";
  }

  if (isVerifyingEmail && error instanceof ApiClientError && error.code === "email_verification_token_invalid") {
    return "This verification link is invalid or expired. Request a new verification email and try again.";
  }

  if (isVerifyingEmail) {
    return "We could not verify this email address. Request a new verification email and try again.";
  }

  if (error instanceof ApiClientError && error.code === "email_verification_required") {
    return "Verify your email before signing in. You can resend the verification email below.";
  }

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return "The API could not be reached. Make sure the backend is running and try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The request could not be completed. Try again.";
}
