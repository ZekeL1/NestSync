const { config } = require("../config");
const memory = require("./roomMemoryRepository");
const dynamo = require("./roomDynamoRepository");

function useDynamo() {
  if (config.roomStoreBackend === "memory") return false;
  if (config.roomStoreBackend === "dynamo") return true;
  return !!(config.dynamoRoomsTable && config.dynamoMessagesTable);
}

function pick() {
  return useDynamo() ? dynamo : memory;
}

async function putRoom(room) {
  return pick().putRoom(room);
}

async function getRoom(roomId) {
  return pick().getRoom(roomId);
}

async function bindChildIfAllowed(roomId, childUserId) {
  return pick().bindChildIfAllowed(roomId, childUserId);
}

async function appendMessage(payload) {
  return pick().appendMessage(payload);
}

async function listMessages(roomId, opts) {
  return pick().listMessages(roomId, opts);
}

function isPersistenceEnabled() {
  return useDynamo();
}

module.exports = {
  putRoom,
  getRoom,
  bindChildIfAllowed,
  appendMessage,
  listMessages,
  isPersistenceEnabled,
  useDynamo
};
