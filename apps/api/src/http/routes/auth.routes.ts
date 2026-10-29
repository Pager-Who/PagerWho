import { Router } from "express";

import { authRateLimit } from "../middleware/auth-rate-limit.middleware";
import {
  completePasswordResetHandler,
  confirmEmailVerificationHandler,
  completeOidcLoginHandler,
  getAuthMeHandler,
  listAuthProvidersHandler,
  loginHandler,
  logoutHandler,
  registerHandler,
  resendEmailVerificationHandler,
  startOidcLoginHandler,
  startPasswordResetHandler,
} from "../handlers/auth.handler";

export const authRoutes = Router();

authRoutes.get("/providers", listAuthProvidersHandler);
authRoutes.get("/me", getAuthMeHandler);
authRoutes.post("/register", authRateLimit("register"), registerHandler);
authRoutes.post("/login", authRateLimit("login"), loginHandler);
authRoutes.post("/email-verification/resend", authRateLimit("email_verification"), resendEmailVerificationHandler);
authRoutes.post("/email-verification/confirm", confirmEmailVerificationHandler);
authRoutes.post("/password-reset/start", authRateLimit("password_reset"), startPasswordResetHandler);
authRoutes.post("/password-reset/complete", completePasswordResetHandler);
authRoutes.get("/oidc/start", authRateLimit("oidc"), startOidcLoginHandler);
authRoutes.get("/oidc/callback", completeOidcLoginHandler);
authRoutes.post("/logout", logoutHandler);
