const { registerPictionaryHandlers } = require('./pictionary');
const { registerSudokuHandlers } = require('./sudoku');

function registerGameHandlers(io, socket) {
  registerPictionaryHandlers(io, socket);
  registerSudokuHandlers(io, socket);
}

module.exports = {
  registerGameHandlers,
};
