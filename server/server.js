const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../client')));
app.use(bodyParser.json());

// --- API 接口: 注册与登录 ---
app.post('/api/register', async (req, res) => {
    const { username, password, role, nickname, email } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    try {
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ success: false, message: 'Username already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        let familyId = (role === 'parent') ? uuidv4() : null;
        const sql = `INSERT INTO users (username, password_hash, role, nickname, email, family_id, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        await db.query(sql, [username, hashedPassword, role, nickname || username, email || null, familyId, 'default.png']);
        res.status(201).json({ success: true, message: 'User registered successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        res.json({ success: true, user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role, family_id: user.family_id, avatar: user.avatar } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Socket.io 实时通信逻辑 ---
io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  // 🌟 新增：处理断开连接通知 (Handle Disconnect Notification)
  socket.on('disconnecting', () => {
    // 获取当前用户所在的房间 (Rooms)
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        // 通知房间内其他人：有人离开了 (User Left)
        socket.to(room).emit('user-left', { id: socket.id });
      }
    }
  });

  socket.on('create-room', () => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    socket.join(roomId);
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.emit('room-joined', roomId);
    socket.to(roomId).emit('user-connected', socket.id);
  });

  socket.on('chat-message', (data) => socket.to(data.roomId).emit('chat-message', data));
  socket.on('load-video', (data) => socket.to(data.roomId).emit('video-loaded', data.url));
  socket.on('play-video', (roomId) => socket.to(roomId).emit('video-played'));
  socket.on('pause-video', (roomId) => socket.to(roomId).emit('video-paused'));
  socket.on('seek-video', (data) => socket.to(data.roomId).emit('video-seeked', data.time));

  socket.on('webrtc-offer', (data) => socket.to(data.roomId).emit('webrtc-offer', data.offer));
  socket.on('webrtc-answer', (data) => socket.to(data.roomId).emit('webrtc-answer', data.answer));
  socket.on('webrtc-ice-candidate', (data) => socket.to(data.roomId).emit('webrtc-ice-candidate', data.candidate));

  socket.on('disconnect', () => console.log('User Disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 NestSync Server running on http://localhost:${PORT}`));