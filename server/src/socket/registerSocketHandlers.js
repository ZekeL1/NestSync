const { extractBearerToken } = require("../auth/middleware");
const { verifyToken } = require("../auth/tokenService");
const { registerGameHandlers } = require("../../games");

function isRoleAllowed(role, allowedRoles) {
  return allowedRoles.includes(role);
}

function requireRole(socket, allowedRoles, eventName) {
  const role = socket.data.auth && socket.data.auth.role;
  if (isRoleAllowed(role, allowedRoles)) {
    return true;
  }

  socket.emit("server:error", {
    event: eventName,
    error: "Forbidden for current role",
    requiredRoles: allowedRoles,
    currentRole: role || null
  });
  return false;
}

function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const headerToken = extractBearerToken(socket.handshake.headers.authorization);
      const authToken = socket.handshake.auth && socket.handshake.auth.token;
      const token = headerToken || authToken;

      if (!token) {
        return next(new Error("Missing authentication token"));
      }

      const identity = await verifyToken(token);
      if (!identity.role) {
        return next(new Error("Role is missing in token"));
      }

      socket.data.auth = identity;
      return next();
    } catch (error) {
      return next(new Error(`Socket authentication failed: ${error.message}`));
    }
  });

  io.on("connection", (socket) => {
    socket.emit("server:hello", {
      userId: socket.data.auth.userId,
      role: socket.data.auth.role
    });

    socket.on("create-room", () => {
      if (!requireRole(socket, ["parent"], "create-room")) {
        return;
      }
      const roomId = Math.floor(1000 + Math.random() * 9000).toString();
      socket.join(roomId);
      socket.emit("room-created", roomId);
    });

    socket.on("join-room", (roomId) => {
      if (!requireRole(socket, ["parent", "child"], "join-room")) {
        return;
      }
      socket.join(roomId);
      socket.emit("room-joined", roomId);
      socket.to(roomId).emit("user-connected", socket.id);
    });

    socket.on("sync:control", (payload) => {
      if (!requireRole(socket, ["parent"], "sync:control")) {
        return;
      }
      io.emit("sync:state", {
        by: socket.data.auth.userId,
        payload: payload || {}
      });
    });

    socket.on("chat-message", (data) => {
      if (!requireRole(socket, ["parent", "child"], "chat-message")) {
        return;
      }
      if (!data || !data.roomId) {
        return;
      }
      socket.to(data.roomId).emit("chat-message", data);
    });

    socket.on("load-video", (data) => {
      if (!requireRole(socket, ["parent"], "load-video")) {
        return;
      }
      socket.to(data.roomId).emit("video-loaded", data.url);
    });

    socket.on("play-video", (roomId) => {
      if (!requireRole(socket, ["parent"], "play-video")) {
        return;
      }
      socket.to(roomId).emit("video-played");
    });

    socket.on("pause-video", (roomId) => {
      if (!requireRole(socket, ["parent"], "pause-video")) {
        return;
      }
      socket.to(roomId).emit("video-paused");
    });

    socket.on("seek-video", (data) => {
      if (!requireRole(socket, ["parent"], "seek-video")) {
        return;
      }
      socket.to(data.roomId).emit("video-seeked", data.time);
    });

    socket.on("games:open", () => {
      if (!requireRole(socket, ["parent", "child"], "games:open")) {
        return;
      }
      socket.emit("games:status", {
        ok: true,
        message: "Games access granted."
      });
    });

    socket.on("webrtc-offer", (data) => {
      if (!requireRole(socket, ["parent", "child"], "webrtc-offer")) {
        return;
      }
      socket.to(data.roomId).emit("webrtc-offer", data.offer);
    });

    socket.on("webrtc-answer", (data) => {
      if (!requireRole(socket, ["parent", "child"], "webrtc-answer")) {
        return;
      }
      socket.to(data.roomId).emit("webrtc-answer", data.answer);
    });

    socket.on("webrtc-ice-candidate", (data) => {
      if (!requireRole(socket, ["parent", "child"], "webrtc-ice-candidate")) {
        return;
      }
      socket.to(data.roomId).emit("webrtc-ice-candidate", data.candidate);
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket.to(room).emit("user-left", { id: socket.id });
        }
      }
    });

    registerGameHandlers(io, socket);
  });
}

module.exports = {
  registerSocketHandlers
};
