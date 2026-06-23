import { AppError } from "./errors.js";

export class RateLimitError extends AppError {
  constructor() {
    super("Too many requests.", {
      code: "RATE_LIMITED",
      status: 429,
      expose: true
    });
  }
}

export function createRateLimiter(config) {
  const buckets = new Map();
  return function rateLimit(req) {
    if (!config.rateLimitEnabled || config.nodeEnv === "test") return;
    const key = `${req.ip || req.socket?.remoteAddress || "unknown"}:${req.path}`;
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || now - current.startedAt > config.rateLimitWindowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return;
    }
    current.count += 1;
    if (current.count > config.rateLimitMaxRequests) throw new RateLimitError();
  };
}

