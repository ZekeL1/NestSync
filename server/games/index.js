const { registerPictionaryHandlers } = require('./pictionary');

function registerGameHandlers(io, socket) {
  registerPictionaryHandlers(io, socket);
}

module.exports = {
  registerGameHandlers,
};
