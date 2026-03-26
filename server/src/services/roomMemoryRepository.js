const rooms = new Map();
const messages = new Map();

function getMessageList(roomId) {
  if (!messages.has(roomId)) messages.set(roomId, []);
  return messages.get(roomId);
}

async function putRoom(room) {
  if (rooms.has(room.roomId)) {
    const err = new Error("Room exists");
    err.name = "ConditionalCheckFailedException";
    throw err;
  }
  rooms.set(room.roomId, { ...room });
}

async function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

async function bindChildIfAllowed(roomId, childUserId) {
  const cur = rooms.get(roomId);
  if (!cur) return { ok: false, code: "NOT_FOUND" };
  if (cur.childUserId && cur.childUserId !== childUserId) {
    return { ok: false, code: "CHILD_SLOT_TAKEN" };
  }
  if (!cur.childUserId) {
    cur.childUserId = childUserId;
    cur.status = "BOUND";
    rooms.set(roomId, { ...cur });
  }
  return { ok: true };
}

async function appendMessage({ roomId, sortKey, senderId, senderRole, nickname, text, createdAt }) {
  const item = { roomId, sortKey, senderId, senderRole, nickname, text, createdAt };
  getMessageList(roomId).push(item);
  return item;
}

async function listMessages(roomId, { limit = 50, startAfter } = {}) {
  let slice = [...getMessageList(roomId)].sort((a, b) => a.createdAt - b.createdAt);
  if (startAfter) {
    const idx = slice.findIndex((m) => m.sortKey === startAfter);
    if (idx >= 0) slice = slice.slice(idx + 1);
  }
  if (limit) slice = slice.slice(-limit);
  return { items: slice, lastKey: slice.length ? slice[slice.length - 1].sortKey : null };
}

function clearForTests() {
  rooms.clear();
  messages.clear();
}

module.exports = {
  putRoom,
  getRoom,
  bindChildIfAllowed,
  appendMessage,
  listMessages,
  clearForTests
};
