import type express from "express";

// ---- Admin API Key Authentication ----
// Protects destructive/expensive endpoints. Set ADMIN_API_KEY in env.
// If unset, admin routes are disabled entirely in production.
export function createAdminMiddleware(): express.RequestHandler {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  return (req, res, next) => {
    if (!adminApiKey) {
      if (isProduction) {
        res.status(403).json({ error: "Admin endpoints are disabled. Set ADMIN_API_KEY to enable." });
        return;
      }
      // In dev, allow without key
      next();
      return;
    }
    const provided =
      req.headers["x-admin-key"] as string | undefined;
    if (provided !== adminApiKey) {
      res.status(401).json({ error: "Unauthorized. Provide X-Admin-Key header." });
      return;
    }
    next();
  };
}

// ---- Rate Limiting ----
// Simple in-memory rate limiter to prevent API abuse.
export function createRateLimiter(): express.RequestHandler {
  const rateLimitWindow = parseInt(process.env.RATE_LIMIT_WINDOW ?? "60000", 10); // 1 minute
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX ?? "120", 10); // 120 req/min per IP
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

  // Clean up stale rate limit entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitStore) {
      if (now > entry.resetAt) rateLimitStore.delete(ip);
    }
  }, 300_000);

  return (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const now = Date.now();
    const entry = rateLimitStore.get(ip);

    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(ip, { count: 1, resetAt: now + rateLimitWindow });
      next();
      return;
    }

    entry.count++;
    if (entry.count > rateLimitMax) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }
    next();
  };
}

// ---- CORS ----
export function createCorsMiddleware(): express.RequestHandler {
  const allowedOrigin = process.env.CORS_ORIGIN ?? "*";
  return (_req, res, next) => {
    res.header("Access-Control-Allow-Origin", allowedOrigin);
    res.header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  };
}
