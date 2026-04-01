const crypto = require("crypto");
const bcrypt = require("bcrypt");
const repo = require("./roomRepository");

function generateRoomId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function createRoomForParent({ parentUserId, passwordPlain }) {
  const passwordHash =
    passwordPlain && String(passwordPlain).length > 0
      ? await bcrypt.hash(String(passwordPlain), 10)
      : null;

  for (let attempt = 0; attempt < 20; attempt++) {
    const roomId = generateRoomId();
    const room = {
      roomId,
      parentUserId,
      childUserId: null,
      status: "WAITING_CHILD",
      passwordHash,
      createdAt: Date.now()
    };
    try {
      await repo.putRoom(room);
      return { ok: true, roomId, room };
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") continue;
      throw e;
    }
  }
  return { ok: false, error: "Could not allocate a room id. Try again." };
}

async function validateRoomAccess({ roomId, userId, role, passwordPlain }) {
  const room = await repo.getRoom(roomId);
  if (!room) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Room not found" };
  }

  if (role === "parent") {
    if (room.parentUserId !== userId) {
      return {
        ok: false,
        status: 403,
        code: "NOT_ROOM_PARENT",
        message: "Only the parent who created this room may enter as parent."
      };
    }
    return { ok: true, room };
  }

  if (role === "child") {
    if (room.parentUserId === userId) {
      return { ok: false, status: 403, code: "BAD_ROLE", message: "Use parent account for this room." };
    }
    if (room.childUserId && room.childUserId === userId) {
      return { ok: true, room };
    }
    if (room.childUserId && room.childUserId !== userId) {
      return {
        ok: false,
        status: 403,
        code: "ROOM_FULL",
        message: "This room is bound to another child."
      };
    }
    if (room.passwordHash) {
      const match = await bcrypt.compare(String(passwordPlain || ""), room.passwordHash);
      if (!match) {
        return {
          ok: false,
          status: 401,
          code: "BAD_PASSWORD",
          message: "Invalid room password."
        };
      }
    }
    const bind = await repo.bindChildIfAllowed(roomId, userId);
    if (!bind.ok) {
      return {
        ok: false,
        status: 403,
        code: bind.code || "BIND_FAILED",
        message: "Could not join this room."
      };
    }
    const updated = await repo.getRoom(roomId);
    return { ok: true, room: updated };
  }

  return { ok: false, status: 400, code: "BAD_ROLE", message: "Unknown role" };
}

async function appendChatMessage({ roomId, senderId, senderRole, nickname, text }) {
  const createdAt = Date.now();
  const sortKey = `${createdAt.toString().padStart(15, "0")}#${crypto.randomBytes(6).toString("hex")}`;
  return repo.appendMessage({
    roomId,
    sortKey,
    senderId,
    senderRole,
    nickname: nickname || "",
    text: String(text || ""),
    createdAt
  });
}

async function getMessages(roomId, query) {
  return repo.listMessages(roomId, query);
}

async function getRoomMeta(roomId) {
  const room = await repo.getRoom(roomId);
  if (!room) {
    return { exists: false, requiresPassword: false, status: null };
  }
  return {
    exists: true,
    requiresPassword: !!room.passwordHash,
    status: room.status,
    hasChild: !!room.childUserId
  };
}

module.exports = {
  createRoomForParent,
  validateRoomAccess,
  appendChatMessage,
  getMessages,
  getRoomMeta
};
