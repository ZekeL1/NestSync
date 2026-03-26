const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const bodyParser = require('body-parser');
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
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../client')));
app.use(bodyParser.json());
mountApi(app);
app.use('/api/rooms', roomRoutes);

// --- API 接口: 注册与登录 ---
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

const PORT = Number(process.env.LEGACY_SERVER_PORT || 3000);
httpServer.listen(PORT, () => console.log(`🚀 NestSync Server running on http://localhost:${PORT}`));