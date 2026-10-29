import { readAuthSecret } from "./auth-secret";

export type OidcProviderConfig = {
  clientAuthMethod: "client_secret_basic" | "client_secret_post";
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  label: string;
  postLoginRedirectUrl: string;
  providerId: string;
  redirectUri: string;
  requireVerifiedEmail: boolean;
  scopes: string[];
};

const defaultScopes = ["openid", "email", "profile"];

export function getOidcProviderConfig(): OidcProviderConfig | null {
  const issuerUrl = readEnv("OIDC_ISSUER_URL");
  const clientId = readEnv("OIDC_CLIENT_ID");
  const clientSecret = readEnv("OIDC_CLIENT_SECRET");
  const redirectUri = readEnv("OIDC_REDIRECT_URI");

  if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    clientAuthMethod: readClientAuthMethod(),
    clientId,
    clientSecret,
    issuerUrl: normalizeIssuerUrl(issuerUrl),
    label: readEnv("OIDC_PROVIDER_LABEL") ?? "SSO",
    postLoginRedirectUrl: readEnv("OIDC_POST_LOGIN_REDIRECT_URL")
      ?? readEnv("WEB_APP_URL")
      ?? "http://127.0.0.1:5173",
    providerId: readEnv("OIDC_PROVIDER_ID") ?? "oidc",
    redirectUri,
    requireVerifiedEmail: process.env.OIDC_REQUIRE_VERIFIED_EMAIL !== "false",
    scopes: readScopes(),
  };
}

export function getAuthStateSecret() {
  return readAuthSecret("AUTH_STATE_SECRET");
}

function readScopes() {
  const scopes = (readEnv("OIDC_SCOPES") ?? defaultScopes.join(" "))
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return scopes.includes("openid") ? scopes : ["openid", ...scopes];
}

function readClientAuthMethod(): OidcProviderConfig["clientAuthMethod"] {
  return process.env.OIDC_CLIENT_AUTH_METHOD === "client_secret_basic"
    ? "client_secret_basic"
    : "client_secret_post";
}

function normalizeIssuerUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}
