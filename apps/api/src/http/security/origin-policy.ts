const localDevOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

export type OriginPolicy = {
  allowAll: boolean;
  allowedOrigins: Set<string>;
};

export function buildOriginPolicy(env: NodeJS.ProcessEnv = process.env): OriginPolicy {
  const rawEntries = [
    ...readOriginEntries(env.CORS_ORIGIN),
    ...readOriginEntries(env.WEB_APP_URL),
  ];
  const allowedOrigins = new Set<string>();
  const allowAll = rawEntries.includes("*");

  for (const entry of rawEntries) {
    if (entry === "*") {
      continue;
    }

    addOriginWithLocalAlias(allowedOrigins, entry);
  }

  if (env.NODE_ENV !== "production") {
    for (const origin of localDevOrigins) {
      addOriginWithLocalAlias(allowedOrigins, origin);
    }
  }

  return {
    allowAll,
    allowedOrigins,
  };
}

export function isOriginAllowed(origin: string | undefined, policy = buildOriginPolicy()) {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);

  if (!normalized) {
    return false;
  }

  return policy.allowAll || policy.allowedOrigins.has(normalized);
}

export function normalizeOrigin(value: string) {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return "";
  }
}

function readOriginEntries(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function addOriginWithLocalAlias(origins: Set<string>, value: string) {
  const normalized = normalizeOrigin(value);

  if (!normalized) {
    return;
  }

  origins.add(normalized);

  const parsed = new URL(normalized);

  if (parsed.hostname === "localhost") {
    parsed.hostname = "127.0.0.1";
    origins.add(parsed.origin);
  } else if (parsed.hostname === "127.0.0.1") {
    parsed.hostname = "localhost";
    origins.add(parsed.origin);
  }
}
