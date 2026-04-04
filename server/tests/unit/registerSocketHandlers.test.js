jest.mock("../../src/auth/tokenService", () => ({
  verifyToken: jest.fn()
}));

jest.mock("../../games", () => ({
  registerGameHandlers: jest.fn()
}));

jest.mock("../../src/services/roomService", () => ({
  validateRoomAccess: jest.fn(),
  appendChatMessage: jest.fn()
}));

const { verifyToken } = require("../../src/auth/tokenService");
const { registerGameHandlers } = require("../../games");
const roomService = require("../../src/services/roomService");
const { registerSocketHandlers } = require("../../src/socket/registerSocketHandlers");

function createIo() {
  return {
    _middleware: null,
    _connectionHandler: null,
    use(fn) {
      this._middleware = fn;
    },
    on(event, handler) {
      if (event === "connection") {
        this._connectionHandler = handler;
      }
    },
    emit: jest.fn()
  };
}

function createSocket({ role = "parent", userId = "parent-1", socketId = "socket-1" } = {}) {
  const handlers = {};
  const broadcasts = [];

  const socket = {
    id: socketId,
    handshake: {
      headers: {},
      auth: {}
    },
    data: {
      auth: { role, userId }
    },
    rooms: new Set([socketId]),
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    join: jest.fn((roomId) => {
      socket.rooms.add(roomId);
    }),
    leave: jest.fn((roomId) => {
      socket.rooms.delete(roomId);
    }),
    to: jest.fn((roomId) => ({
      emit: (event, payload) => {
        broadcasts.push({ roomId, event, payload });
      }
    })),
    _handlers: handlers,
    _broadcasts: broadcasts
  };

  return socket;
}

describe("registerSocketHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("authenticates sockets from header or auth token", async () => {
    const io = createIo();
    registerSocketHandlers(io);

    verifyToken.mockResolvedValueOnce({ userId: "parent-1", role: "parent" });
    const socket = createSocket();
    socket.handshake.headers.authorization = "Bearer header-token";
    const next = jest.fn();

    await io._middleware(socket, next);

    expect(verifyToken).toHaveBeenCalledWith("header-token");
    expect(socket.data.auth).toEqual({ userId: "parent-1", role: "parent" });
    expect(next).toHaveBeenCalledWith();

    verifyToken.mockResolvedValueOnce({ userId: "child-1", role: "child" });
    const socketWithAuthToken = createSocket({ role: "child", userId: "child-1" });
    socketWithAuthToken.handshake.auth.token = "auth-token";
    const nextAuth = jest.fn();

    await io._middleware(socketWithAuthToken, nextAuth);

    expect(verifyToken).toHaveBeenCalledWith("auth-token");
    expect(nextAuth).toHaveBeenCalledWith();
  });

  it("rejects missing tokens and roleless identities", async () => {
    const io = createIo();
    registerSocketHandlers(io);

    const missingTokenSocket = createSocket();
    const nextMissing = jest.fn();
    await io._middleware(missingTokenSocket, nextMissing);
    expect(nextMissing.mock.calls[0][0].message).toBe("Missing authentication token");

    verifyToken.mockResolvedValueOnce({ userId: "u-1", role: null });
    const rolelessSocket = createSocket();
    rolelessSocket.handshake.auth.token = "roleless";
    const nextRoleless = jest.fn();
    await io._middleware(rolelessSocket, nextRoleless);
    expect(nextRoleless.mock.calls[0][0].message).toBe("Role is missing in token");
  });

  it("registers connection handlers and emits hello", () => {
    const io = createIo();
    registerSocketHandlers(io);
    const socket = createSocket();

    io._connectionHandler(socket);

    expect(socket.emit).toHaveBeenCalledWith("server:hello", {
      userId: "parent-1",
      role: "parent"
    });
    expect(registerGameHandlers).toHaveBeenCalledWith(io, socket);
    expect(typeof socket._handlers["join-room"]).toBe("function");
  });

  it("handles join-room validation errors and successful joins", async () => {
    const io = createIo();
    registerSocketHandlers(io);
    const socket = createSocket();
    io._connectionHandler(socket);

    await socket._handlers["join-room"]({});
    expect(socket.emit).toHaveBeenCalledWith("server:error", {
      event: "join-room",
      error: "Room id is required."
    });

    roomService.validateRoomAccess.mockResolvedValueOnce({
      ok: false,
      code: "BAD_PASSWORD",
      message: "Wrong password"
    });
    await socket._handlers["join-room"]({ roomId: "1234", password: "bad" });
    expect(socket.emit).toHaveBeenCalledWith("server:error", {
      event: "join-room",
      error: "Wrong password",
      code: "BAD_PASSWORD"
    });

    roomService.validateRoomAccess.mockResolvedValueOnce({
      ok: true,
      room: { roomId: "1234" }
    });
    await socket._handlers["join-room"]({ roomId: "1234", password: "good" });
    expect(socket.join).toHaveBeenCalledWith("1234");
    expect(socket.emit).toHaveBeenCalledWith("room-joined", "1234");
    expect(socket._broadcasts).toContainEqual({
      roomId: "1234",
      event: "user-connected",
      payload: "socket-1"
    });
  });

  it("handles leave-room, sync control, chat, and games access", async () => {
    const io = createIo();
    registerSocketHandlers(io);
    const socket = createSocket();
    io._connectionHandler(socket);
    socket.rooms.add("8888");

    socket._handlers["leave-room"]("8888");
    expect(socket.leave).toHaveBeenCalledWith("8888");
    expect(socket.emit).toHaveBeenCalledWith("room-left", "8888");
    expect(socket._broadcasts).toContainEqual({
      roomId: "8888",
      event: "user-left",
      payload: { id: "socket-1" }
    });

    socket._handlers["sync:control"]({ playing: true });
    expect(io.emit).toHaveBeenCalledWith("sync:state", {
      by: "parent-1",
      payload: { playing: true }
    });

    roomService.validateRoomAccess.mockResolvedValueOnce({
      ok: false,
      message: "No chat"
    });
    await socket._handlers["chat-message"]({ roomId: "8888", message: "hello" });
    expect(socket.emit).toHaveBeenCalledWith("server:error", {
      event: "chat-message",
      error: "No chat"
    });

    roomService.validateRoomAccess.mockResolvedValueOnce({ ok: true });
    roomService.appendChatMessage.mockResolvedValueOnce({});
    await socket._handlers["chat-message"]({
      roomId: "8888",
      nickname: "Dad",
      message: "hello"
    });
    expect(roomService.appendChatMessage).toHaveBeenCalledWith({
      roomId: "8888",
      senderId: "parent-1",
      senderRole: "parent",
      nickname: "Dad",
      text: "hello"
    });
    expect(socket._broadcasts).toContainEqual({
      roomId: "8888",
      event: "chat-message",
      payload: {
        roomId: "8888",
        nickname: "Dad",
        message: "hello"
      }
    });

    socket._handlers["games:open"]();
    expect(socket.emit).toHaveBeenCalledWith("games:status", {
      ok: true,
      message: "Games access granted."
    });
  });

  it("forwards parent video and shared rtc events", () => {
    const io = createIo();
    registerSocketHandlers(io);
    const socket = createSocket();
    io._connectionHandler(socket);

    socket._handlers["load-video"]({ roomId: "room-1", url: "video-1" });
    socket._handlers["play-video"]("room-1");
    socket._handlers["pause-video"]("room-1");
    socket._handlers["seek-video"]({ roomId: "room-1", time: 42 });
    socket._handlers["webrtc-offer"]({ roomId: "room-1", offer: "offer-sdp" });
    socket._handlers["webrtc-answer"]({ roomId: "room-1", answer: "answer-sdp" });
    socket._handlers["webrtc-ice-candidate"]({ roomId: "room-1", candidate: "ice" });

    expect(socket._broadcasts).toEqual(
      expect.arrayContaining([
        { roomId: "room-1", event: "video-loaded", payload: "video-1" },
        { roomId: "room-1", event: "video-played", payload: undefined },
        { roomId: "room-1", event: "video-paused", payload: undefined },
        { roomId: "room-1", event: "video-seeked", payload: 42 },
        { roomId: "room-1", event: "webrtc-offer", payload: "offer-sdp" },
        { roomId: "room-1", event: "webrtc-answer", payload: "answer-sdp" },
        { roomId: "room-1", event: "webrtc-ice-candidate", payload: "ice" }
      ])
    );
  });

  it("blocks forbidden events for child sockets and emits room departures on disconnecting", () => {
    const io = createIo();
    registerSocketHandlers(io);
    const socket = createSocket({ role: "child", userId: "child-1", socketId: "socket-2" });
    io._connectionHandler(socket);
    socket.rooms.add("room-a");
    socket.rooms.add("room-b");

    socket._handlers["sync:control"]({ playing: true });
    socket._handlers["load-video"]({ roomId: "room-a", url: "video-2" });

    expect(socket.emit).toHaveBeenCalledWith("server:error", {
      event: "sync:control",
      error: "Forbidden for current role",
      requiredRoles: ["parent"],
      currentRole: "child"
    });
    expect(socket.emit).toHaveBeenCalledWith("server:error", {
      event: "load-video",
      error: "Forbidden for current role",
      requiredRoles: ["parent"],
      currentRole: "child"
    });

    socket._handlers["disconnecting"]();
    expect(socket._broadcasts).toEqual(
      expect.arrayContaining([
        { roomId: "room-a", event: "user-left", payload: { id: "socket-2" } },
        { roomId: "room-b", event: "user-left", payload: { id: "socket-2" } }
      ])
    );
  });
});
