const { registerPictionaryHandlers } = require('./pictionary');
const { registerSudokuHandlers } = require('./sudoku');
const { registerLinkMatchHandlers } = require('./linkmatch');

function registerGameHandlers(io, socket) {
  registerPictionaryHandlers(io, socket);
  registerSudokuHandlers(io, socket);
  registerLinkMatchHandlers(io, socket);
}

module.exports = {
  registerGameHandlers,
};
