import { appEnv, isFrontendOnlyDeploy } from "@/lib/env";

interface ResponseOptions {
  headers?: HeadersInit;
  origin?: string | null;
  requestId: string;
  status?: number;
}

function appendCorsHeaders(headers: Headers, origin?: string | null) {
  if (!origin) {
    return;
  }

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "OPTIONS, POST");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Inspection-Id, X-Request-Id");
  headers.set("Access-Control-Max-Age", "7200");
  headers.set("Vary", "Origin");
}

export function getRequestId(request: Request): string {
  return request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

export function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  if (appEnv.corsAllowedOrigins.has(origin)) {
    return origin;
  }

  return null;
}

export function createJsonResponse(payload: unknown, options: ResponseOptions): Response {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Request-Id", options.requestId);
  appendCorsHeaders(headers, options.origin);

  return new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers,
  });
}

export function createErrorResponse(args: {
  code: string;
  message: string;
  requestId: string;
  origin?: string | null;
  status: number;
  details?: unknown;
  headers?: HeadersInit;
}) {
  return createJsonResponse(
    {
      error: {
        code: args.code,
        message: args.message,
        details: args.details,
      },
      requestId: args.requestId,
    },
    {
      requestId: args.requestId,
      origin: args.origin,
      status: args.status,
      headers: args.headers,
    }
  );
}

export function createOptionsResponse(request: Request): Response {
  const requestId = getRequestId(request);
  const origin = getAllowedOrigin(request);

  if (request.headers.get("origin") && !origin) {
    return createErrorResponse({
      code: "cors_origin_not_allowed",
      message: "Origin is not allowed.",
      origin: null,
      requestId,
      status: 403,
    });
  }

  const headers = new Headers();
  headers.set("X-Request-Id", requestId);
  headers.set("Cache-Control", "private, no-store");
  appendCorsHeaders(headers, origin);

  return new Response(null, {
    status: 204,
    headers,
  });
}

export function ensureCrossOriginAllowed(request: Request, requestId: string) {
  const origin = getAllowedOrigin(request);
  if (request.headers.get("origin") && !origin) {
    return {
      origin: null,
      response: createErrorResponse({
        code: "cors_origin_not_allowed",
        message: "Origin is not allowed.",
        requestId,
        status: 403,
      }),
    };
  }

  return { origin };
}

export function createFrontendDisabledResponse(request: Request): Response | null {
  if (!isFrontendOnlyDeploy()) {
    return null;
  }

  const requestId = getRequestId(request);
  return createErrorResponse({
    code: "route_unavailable",
    message: "This deployment does not expose API routes.",
    requestId,
    status: 404,
  });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function withTimeout<T>(factory: () => Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    factory()
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 10_000, ...requestInit } = init;
  return withTimeout(async () => {
    const response = await fetch(input, requestInit);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${String(input)}`);
    }
    return (await response.json()) as T;
  }, timeoutMs);
}

export function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

export function createRateLimitHeaders(rateLimit: {
  limit: number;
  remaining: number;
  resetAt: number;
}) {
  return {
    "X-RateLimit-Limit": String(rateLimit.limit),
    "X-RateLimit-Remaining": String(Math.max(rateLimit.remaining, 0)),
    "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
  };
}
