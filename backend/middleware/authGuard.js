import jwt from "jsonwebtoken";

const getJwtSecret = () => process.env.JWT_SECRET || "ai_doctor_secret_jwt_key_2026";

/**
 * Extracts and verifies JWT from Bearer Authorization header, query parameter, or cookie.
 */
export const verifyToken = (req, res, next) => {
  let token = null;

  // 1. Check Authorization: Bearer <token>
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  // 2. Fallback to query parameter (crucial for secure media links: <img src="/api/files/...?token=...">)
  if (!token && req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Access Denied. No authentication token provided.",
      code: "AUTH_TOKEN_MISSING"
    });
  }

  try {
    const verified = jwt.verify(token, getJwtSecret());
    req.user = {
      id: verified.id?.toString(),
      role: verified.role,
      email: verified.email,
      name: verified.name || ""
    };
    next();
  } catch (error) {
    const isExpired = error.name === "TokenExpiredError";
    return res.status(403).json({
      success: false,
      error: isExpired ? "Session expired. Please log in again." : "Invalid authentication token.",
      code: isExpired ? "AUTH_TOKEN_EXPIRED" : "AUTH_TOKEN_INVALID"
    });
  }
};

/**
 * Enforces role-based authorization (e.g. ['doctor'] or ['patient'])
 */
export const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access Denied. Role '${req.user?.role || "anonymous"}' is not authorized to access this resource.`,
        code: "ROLE_UNAUTHORIZED"
      });
    }
    next();
  };
};

/**
 * Socket.IO Handshake Authentication Middleware
 * Strictly validates JWT token during WebSocket connection. Rejects unauthorized connections.
 */
export const verifySocketAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || 
      socket.handshake.headers?.authorization?.replace("Bearer ", "") ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error("Authentication error: Missing JWT token in WebSocket handshake."));
    }

    const verified = jwt.verify(token, getJwtSecret());
    socket.userId = verified.id?.toString();
    socket.userRole = verified.role;
    socket.userEmail = verified.email;
    socket.userName = verified.name || socket.handshake.auth?.name || "User";

    next();
  } catch (err) {
    console.warn("[WebSocket Handshake Rejected]:", err.message);
    next(new Error(`Authentication error: ${err.message}`));
  }
};
