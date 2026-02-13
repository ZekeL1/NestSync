const express = require('express'); 
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express(); 
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../client')));

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  // --- Room Management ---
  socket.on('create-room', () => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    socket.join(roomId);
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.emit('room-joined', roomId);
    // 通知房间内的其他人有新成员加入 (Notify for WebRTC initiation)
    socket.to(roomId).emit('user-connected', socket.id);
  });

  // --- YouTube Media Sync ---
  socket.on('load-video', (data) => socket.to(data.roomId).emit('video-loaded', data.url));
  socket.on('play-video', (roomId) => socket.to(roomId).emit('video-played'));
  socket.on('pause-video', (roomId) => socket.to(roomId).emit('video-paused'));
  socket.on('seek-video', (data) => socket.to(data.roomId).emit('video-seeked', data.time));

  // --- 🌟 WebRTC Signaling (信令交换) ---
  socket.on('webrtc-offer', (data) => {
    // data: { roomId, offer }
    socket.to(data.roomId).emit('webrtc-offer', data.offer);
  });

  socket.on('webrtc-answer', (data) => {
    // data: { roomId, answer }
    socket.to(data.roomId).emit('webrtc-answer', data.answer);
  });

  socket.on('webrtc-ice-candidate', (data) => {
    // data: { roomId, candidate }
    socket.to(data.roomId).emit('webrtc-ice-candidate', data.candidate);
  });

  socket.on('disconnect', () => console.log('User Disconnected:', socket.id));
});

const PORT = 3000;
httpServer.listen(PORT, () => console.log(`NestSync Server running on http://localhost:${PORT}`));