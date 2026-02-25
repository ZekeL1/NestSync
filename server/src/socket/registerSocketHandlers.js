const { extractBearerToken } = require("../auth/middleware");
const { verifyAccessToken } = require("../auth/tokenService");

function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const headerAuth = socket.handshake.headers.authorization;
      const queryToken = socket.handshake.auth && socket.handshake.auth.token;
      const bearerToken = extractBearerToken(headerAuth);
      const token = bearerToken || queryToken;

      if (!token) {
        return next(new Error("Missing authentication token"));
      }

      const identity = await verifyAccessToken(token);
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
    const { role, email } = socket.data.auth;
    socket.emit("server:hello", { role, email });

    socket.on("sync:control", (payload) => {
      if (role !== "parent") {
        socket.emit("server:error", {
          event: "sync:control",
          error: "Only parent role can control synchronized playback."
        });
        return;
      }
      io.emit("sync:state", {
        by: email,
        role,
        payload: payload || {}
      });
    });

    socket.on("games:open", () => {
      io.to(socket.id).emit("games:status", {
        ok: true,
        role,
        message: "Mini-games are available for this role."
      });
    });
  });
}

module.exports = {
  registerSocketHandlers
};
