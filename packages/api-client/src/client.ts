import type { ApiError, ApiSuccess } from "@im/contracts";

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
};

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");

    const accessToken = this.options.getAccessToken?.();
    if (accessToken) {
      headers.set("authorization", `Bearer ${accessToken}`);
    }

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      credentials: init.credentials ?? "include",
      headers,
    });

    const payload = await parseResponsePayload<T>(response);

    if (!response.ok) {
      throw createApiClientError(response, payload);
    }

    if (!isApiSuccess<T>(payload)) {
      throw new ApiClientError({
        code: "invalid_api_response",
        message: "Invalid API response",
        status: response.status,
      });
    }

    return payload.data;
  }
}

type ApiResponsePayload<T> = ApiSuccess<T> | ApiError;

type ApiClientErrorOptions = {
  code: string;
  details?: unknown;
  message: string;
  requestId?: string;
  status: number;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: unknown | undefined;
  readonly requestId: string | undefined;
  readonly status: number;

  constructor(options: ApiClientErrorOptions) {
    super(options.message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.status = options.status;
  }
}

async function parseResponsePayload<T>(response: Response): Promise<ApiResponsePayload<T>> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();

    return {
      error: {
        code: "non_json_response",
        message: response.ok ? "Expected JSON response from API" : `Request failed with status ${response.status}`,
        details: text.slice(0, 500),
        request_id: response.headers.get("x-request-id") ?? "",
      },
    };
  }

  try {
    return (await response.json()) as ApiResponsePayload<T>;
  } catch (error) {
    return {
      error: {
        code: "invalid_json_response",
        message: "Invalid JSON response from API",
        details: error instanceof Error ? error.message : String(error),
        request_id: response.headers.get("x-request-id") ?? "",
      },
    };
  }
}

function createApiClientError<T>(response: Response, payload: ApiResponsePayload<T>) {
  if (isApiError(payload)) {
    return new ApiClientError({
      code: payload.error.code,
      details: payload.error.details,
      message: payload.error.message,
      requestId: payload.error.request_id,
      status: response.status,
    });
  }

  return new ApiClientError({
    code: "request_failed",
    message: `Request failed with status ${response.status}`,
    status: response.status,
  });
}

function isApiSuccess<T>(payload: ApiResponsePayload<T>): payload is ApiSuccess<T> {
  return typeof payload === "object" && payload !== null && "data" in payload;
}

function isApiError(payload: unknown): payload is ApiError {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return false;
  }

  const error = (payload as { error?: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}
