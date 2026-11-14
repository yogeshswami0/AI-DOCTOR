/**
 * Zero-dependency In-Memory Sliding Window Rate Limiter
 * Provides DDoS, brute-force, and API abuse protection with zero external npm dependencies.
 */

class MemoryStore {
  constructor(cleanupIntervalMs = 60000) {
    this.hits = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref(); // Avoid holding Node process open on shutdown
    }
  }

  increment(key, windowMs) {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now > entry.resetTime) {
      this.hits.set(key, { count: 1, resetTime: now + windowMs });
      return { count: 1, resetTime: now + windowMs, remaining: windowMs };
    }

    entry.count += 1;
    return {
      count: entry.count,
      resetTime: entry.resetTime,
      remaining: Math.max(0, entry.resetTime - now)
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.hits.entries()) {
      if (now > entry.resetTime) {
        this.hits.delete(key);
      }
    }
  }
}

const sharedStore = new MemoryStore();

export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute default
  const max = options.max || 100;
  const message = options.message || "Too many requests. Please try again later.";
  const statusCode = options.statusCode || 429;
  const keyGenerator = options.keyGenerator || ((req) => {
    return req.ip || 
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || 
      req.socket?.remoteAddress || 
      "unknown-client";
  });

  return (req, res, next) => {
    // In local test runner or disabled environments, pass through
    if (process.env.DISABLE_RATE_LIMITING === "true") {
      return next();
    }

    const key = `${options.prefix || "rl"}:${keyGenerator(req)}`;
    const { count, resetTime, remaining } = sharedStore.increment(key, windowMs);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000));

    if (count > max) {
      res.setHeader("Retry-After", Math.ceil(remaining / 1000));
      return res.status(statusCode).json({
        success: false,
        error: message,
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterSeconds: Math.ceil(remaining / 1000)
      });
    }

    next();
  };
}

// 1. Strict Auth Limiter: Max 10 attempts per 15 minutes (protects login/register against brute-force)
export const authRateLimiter = createRateLimiter({
  prefix: "auth",
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many authentication attempts. Please wait 15 minutes before trying again."
});

// 2. Strict OTP Limiter: Max 4 requests per 10 minutes (prevents email bombing and cost exhaustion)
export const otpRateLimiter = createRateLimiter({
  prefix: "otp",
  windowMs: 10 * 60 * 1000,
  max: 4,
  message: "Verification code request limit reached. Please wait 10 minutes before requesting a new OTP."
});

// 3. AI Inference Limiter: Max 25 queries per minute (prevents Gemini API quota depletion)
export const aiRateLimiter = createRateLimiter({
  prefix: "ai",
  windowMs: 60 * 1000,
  max: 25,
  message: "AI diagnostic request rate limit reached. Please wait a moment before sending another message."
});

// 4. General API Limiter: Max 300 requests per 5 minutes
export const apiGeneralLimiter = createRateLimiter({
  prefix: "api",
  windowMs: 5 * 60 * 1000,
  max: 400,
  message: "API request threshold exceeded. Please slow down your requests."
});
