/**
 * Security Headers & CORS Middleware
 * Zero-dependency native implementation providing Helmet-grade HTTP security headers
 * and strict CORS validation aligned with production requirements.
 */

export function securityHeaders(options = {}) {
  const isProduction = process.env.NODE_ENV === "production";

  return (req, res, next) => {
    // 1. Prevent MIME-type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // 2. Prevent Clickjacking
    res.setHeader("X-Frame-Options", "DENY");

    // 3. Disable legacy X-XSS-Protection (modern best practice to avoid XS-Leaks)
    res.setHeader("X-XSS-Protection", "0");

    // 4. Strict Referrer Policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // 5. Enforce HTTPS via HSTS in production
    if (isProduction || req.secure || req.headers["x-forwarded-proto"] === "https") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }

    // 6. Content Security Policy (permits local assets, WebSockets, in-memory blobs for audio/video)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: blob: https:; " +
      "media-src 'self' data: blob:; " +
      "connect-src 'self' ws: wss: http: https:; " +
      "object-src 'none'; " +
      "frame-ancestors 'none';"
    );

    // 7. Prevent caching on sensitive API responses
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }

    next();
  };
}

/**
 * Production-ready CORS validator middleware
 */
export function corsConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  const rawOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173,http://localhost:5000";
  const allowedOrigins = rawOrigins
    .split(",")
    .map(s => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return (req, res, next) => {
    const origin = req.headers.origin;

    if (!origin) {
      // Direct server-to-server, health checks, or curl requests with no Origin header
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else {
      const normalizedOrigin = origin.replace(/\/$/, "");
      const isAllowed = allowedOrigins.includes(normalizedOrigin) || 
        (!isProduction && (normalizedOrigin.includes("localhost") || normalizedOrigin.includes("127.0.0.1")));

      if (isAllowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      } else if (isProduction) {
        // Reject disallowed cross-origin requests in production
        return res.status(403).json({
          success: false,
          error: "CORS policy violation: Origin not allowed",
          code: "CORS_FORBIDDEN"
        });
      } else {
        // Development fallback with warning
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, x-gemini-key, Accept"
    );

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  };
}
