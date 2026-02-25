const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const bodyParser = require('body-parser');
const { loginWithAuthV2 } = require('./v2/src/services/loginService');
const { registerWithAuthV2 } = require('./v2/src/services/registerService');
const { mountV2Api } = require('./v2/src/legacy/mountV2Api');
const { registerLegacySocketBridge } = require('./v2/src/legacy/registerLegacySocketBridge');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../client')));
app.use(bodyParser.json());
mountV2Api(app);

// --- API 接口: 注册与登录 ---
app.post('/api/register', async (req, res) => {
    const result = await registerWithAuthV2(req.body || {});
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
    const result = await loginWithAuthV2(principal, password);
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

registerLegacySocketBridge(io);

const PORT = Number(process.env.LEGACY_SERVER_PORT || 3000);
httpServer.listen(PORT, () => console.log(`🚀 NestSync Server running on http://localhost:${PORT}`));