const { registerSocketHandlers } = require("../socket/registerSocketHandlers");

function registerLegacySocketBridge(io) {
  registerSocketHandlers(io);
}

module.exports = {
  registerLegacySocketBridge
};
