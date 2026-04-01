const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require("fs");
const path = require('path');
const bodyParser = require('body-parser');
const { config } = require("./src/config");
const { loginWithAuth } = require('./src/services/loginService');
const { registerWithAuth } = require('./src/services/registerService');
const {
  requestPasswordReset,
  confirmPasswordReset
} = require('./src/services/passwordService');
const { mountApi } = require('./src/legacy/mountApi');
const { registerLegacySocketBridge } = require('./src/legacy/registerLegacySocketBridge');
const roomRoutes = require('./src/routes/roomRoutes');

const app = express();
const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080"
];
const allowedOrigins = config.corsOrigins.length > 0 ? config.corsOrigins : defaultCorsOrigins;
const allowAllCors = allowedOrigins.includes("*");
function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowAllCors || allowedOrigins.includes(origin);
}

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed: ${origin || "unknown"}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

const staticDirCandidates = [
  process.env.CLIENT_STATIC_DIR,
  path.join(__dirname, "../client"),
  path.join(__dirname, "client")
].filter(Boolean);
const resolvedStaticDir = staticDirCandidates.find((dir) => fs.existsSync(dir));
if (resolvedStaticDir) {
  app.use(express.static(resolvedStaticDir));
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});
app.use(bodyParser.json());
mountApi(app);
app.use('/api/rooms', roomRoutes);
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post('/api/register', async (req, res) => {
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

app.post('/api/login', async (req, res) => {
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

app.post('/api/password/forgot', async (req, res) => {
    const result = await requestPasswordReset(req.body || {});
    if (!result.ok) {
        return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.status(result.status).json({ success: true, message: result.data.message });
});

app.post('/api/password/reset', async (req, res) => {
    const result = await confirmPasswordReset(req.body || {});
    if (!result.ok) {
        return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.status(result.status).json({ success: true, message: result.data.message });
});

registerLegacySocketBridge(io);

const PORT = Number(process.env.PORT || process.env.LEGACY_SERVER_PORT || 3000);
httpServer.listen(PORT, () => console.log(`🚀 NestSync Server running on http://localhost:${PORT}`));