import { io } from "socket.io-client";

let socket = null;

/**
 * Initializes and connects the Socket.io client.
 * Connects directly to window.location.origin (proxied via Vite) or falls back to backend URL.
 */
export function initSocket(user, token) {
  if (socket && socket.connected) {
    return socket;
  }

  // In development, window.location.origin is typically http://localhost:5173,
  // which proxies /socket.io to http://localhost:5000.
  // Can also fall back to http://localhost:5000 if needed.
  const socketUrl = window.location.origin;

  socket = io(socketUrl, {
    auth: {
      token: token || "",
      userId: user?.id || user?._id || "",
      name: user?.name || "",
      role: user?.role || ""
    },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 20000
  });

  socket.on("connect", () => {
    console.log("[WebSocket] Connected successfully with ID:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.warn("[WebSocket] Connection warning:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[WebSocket] Disconnected:", reason);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Join a specific consultation room
 */
export function joinConsultationRoom(chatId) {
  if (socket && chatId) {
    socket.emit("consultation:join", { chatId });
  }
}

/**
 * Leave a specific consultation room
 */
export function leaveConsultationRoom(chatId) {
  if (socket && chatId) {
    socket.emit("consultation:leave", { chatId });
  }
}

/**
 * Send real-time consultation message (with optional media/document attachment)
 */
export function emitConsultationMessage(payload, callback) {
  if (socket) {
    socket.emit("consultation:message", payload, callback);
  }
}

/**
 * Send consultation request
 */
export function emitConsultationRequest(payload, callback) {
  if (socket) {
    socket.emit("consultation:request", payload, callback);
  }
}

/**
 * Accept consultation request
 */
export function emitAcceptConsultation(chatId, callback) {
  if (socket) {
    socket.emit("consultation:accept", { chatId }, callback);
  }
}

/**
 * Send typing indicator
 */
export function emitTypingIndicator(chatId, userId, userName, isTyping) {
  if (socket && chatId) {
    socket.emit("consultation:typing", { chatId, userId, userName, isTyping });
  }
}

/**
 * Request currently online user IDs
 */
export function requestOnlineUsers(callback) {
  if (socket) {
    socket.emit("users:get_online", callback);
  }
}
