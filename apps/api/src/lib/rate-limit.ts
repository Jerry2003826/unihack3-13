interface RateLimitConfig {
  max: number;
  windowMs: number;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

interface RequestLike {
  headers: {
    get(name: string): string | null;
  };
}

const buckets = new Map<string, RateLimitState>();

function cleanupBuckets(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: RequestLike): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

export function checkRateLimit(args: {
  request: RequestLike;
  route: string;
  config: RateLimitConfig;
  sessionKey?: string;
}) {
  const now = Date.now();
  cleanupBuckets(now);

  const ip = getClientIp(args.request);
  const sessionKey = args.sessionKey ?? args.request.headers.get("x-inspection-id") ?? "anonymous";
  const bucketKey = `${args.route}:${ip}:${sessionKey}`;

  const existing = buckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + args.config.windowMs };
    buckets.set(bucketKey, next);
    return {
      allowed: true,
      limit: args.config.max,
      remaining: Math.max(args.config.max - next.count, 0),
      resetAt: next.resetAt,
    };
  }

  if (existing.count >= args.config.max) {
    return {
      allowed: false,
      limit: args.config.max,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);

  return {
    allowed: true,
    limit: args.config.max,
    remaining: Math.max(args.config.max - existing.count, 0),
    resetAt: existing.resetAt,
  };
}
