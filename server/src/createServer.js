const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const { config } = require("./config");
const { loginWithAuth } = require("./services/loginService");
const { registerWithAuth } = require("./services/registerService");
const {
  requestPasswordReset,
  confirmPasswordReset
} = require("./services/passwordService");
const { mountApi } = require("./legacy/mountApi");
const { registerLegacySocketBridge } = require("./legacy/registerLegacySocketBridge");
const roomRoutes = require("./routes/roomRoutes");

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080"
];

function getAllowedOrigins() {
  return config.corsOrigins.length > 0 ? config.corsOrigins : DEFAULT_CORS_ORIGINS;
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

function mountStaticAssets(app) {
  const staticDirCandidates = [
    process.env.CLIENT_STATIC_DIR,
    path.join(__dirname, "../../client"),
    path.join(__dirname, "../client")
  ].filter(Boolean);

  const resolvedStaticDir = staticDirCandidates.find((dir) => fs.existsSync(dir));
  if (resolvedStaticDir) {
    app.use(express.static(resolvedStaticDir));
  }
}

function registerCors(app, allowedOrigins) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin, allowedOrigins)) {
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return next();
  });
}

function registerHttpRoutes(app) {
  mountApi(app);
  app.use("/api/rooms", roomRoutes);

  app.get("/healthz", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/api/register", async (req, res) => {
    const result = await registerWithAuth(req.body || {});
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.status(result.status).json({
      success: true,
      message: result.data.message,
      user: result.data.user
    });
  });

  app.post("/api/login", async (req, res) => {
    const { username, email, password } = req.body || {};
    const principal = username || email;
    const result = await loginWithAuth(principal, password);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const user = result.data.user || {};
    return res.json({
      success: true,
      accessToken: result.data.accessToken || null,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.displayName || user.username,
        role: user.role,
        family_id: user.familyId || null,
        avatar: user.avatar || null,
        email: user.email || null
      }
    });
  });

  app.post("/api/password/forgot", async (req, res) => {
    const result = await requestPasswordReset(req.body || {});
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.status(result.status).json({ success: true, message: result.data.message });
  });

  app.post("/api/password/reset", async (req, res) => {
    const result = await confirmPasswordReset(req.body || {});
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.status(result.status).json({ success: true, message: result.data.message });
  });
}

function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  mountStaticAssets(app);
  registerCors(app, allowedOrigins);
  app.use(bodyParser.json());
  registerHttpRoutes(app);

  return app;
}

function createHttpServer(app = createApp()) {
  const allowedOrigins = getAllowedOrigins();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin not allowed: ${origin || "unknown"}`));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    }
  });

  registerLegacySocketBridge(io);

  return { app, httpServer, io };
}

async function startServer(options = {}) {
  const port = Number(options.port || process.env.PORT || process.env.LEGACY_SERVER_PORT || 3000);
  const { app, httpServer, io } = createHttpServer();

  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    httpServer.once("error", onError);
    httpServer.listen(port, () => {
      httpServer.off("error", onError);
      resolve({
        app,
        httpServer,
        io,
        port: httpServer.address().port
      });
    });
  });
}

module.exports = {
  createApp,
  createHttpServer,
  startServer
};
