const { registerPictionaryHandlers } = require('./pictionary');
const { registerSudokuHandlers } = require('./sudoku');
const { registerLinkMatchHandlers } = require('./linkmatch');
const { registerQuickBoatHandlers } = require('./quickboat');
const { registerLoveLetterHandlers } = require('./loveletter');

function registerGameHandlers(io, socket) {
  registerPictionaryHandlers(io, socket);
  registerSudokuHandlers(io, socket);
  registerLinkMatchHandlers(io, socket);
  registerQuickBoatHandlers(io, socket);
  registerLoveLetterHandlers(io, socket);
}

module.exports = {
  registerGameHandlers,
};
