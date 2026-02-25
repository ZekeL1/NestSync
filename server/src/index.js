const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { config, assertSupportedAuthMode } = require("./config");
const authRoutes = require("./routes/authRoutes");
const protectedRoutes = require("./routes/protectedRoutes");
const { registerSocketHandlers } = require("./socket/registerSocketHandlers");

assertSupportedAuthMode();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    authMode: config.authMode
  });
});

app.use("/auth", authRoutes);
app.use("/", protectedRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

registerSocketHandlers(io);

server.listen(config.port, () => {
  // Keep startup log minimal and explicit for teammates.
  console.log(`NestSync server is running on port ${config.port}`);
  console.log(`Auth mode: ${config.authMode}`);
});
