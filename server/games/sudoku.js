const SUDOKU_PREFIX = 'sudoku:';
const EMPTY_BOARD = Array(81).fill(0);
const EMPTY_FIXED = Array(81).fill(false);
const ROOM_STATES = new Map();

function sanitizeWord(value, maxLen = 40) {
  return (value || '').toString().trim().slice(0, maxLen);
}

function displayName(name) {
  const cleaned = sanitizeWord(name, 24);
  return cleaned || 'Guest';
}

function sanitizeDigit(value, allowZero = true) {
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  if (allowZero && number === 0) return 0;
  if (number >= 1 && number <= 9) return number;
  return null;
}

function sanitizeBoard(board, allowZero = true) {
  if (!Array.isArray(board) || board.length !== 81) return null;
  const nextBoard = [];

  for (const item of board) {
    const digit = sanitizeDigit(item, allowZero);
    if (digit === null) {
      return null;
    }
    nextBoard.push(digit);
  }

  return nextBoard;
}

function getRoomChannel(roomId) {
  return `${SUDOKU_PREFIX}${roomId}`;
}

function createRoomState() {
  return {
    started: false,
    difficulty: null,
    puzzle: EMPTY_BOARD.slice(),
    solution: EMPTY_BOARD.slice(),
    values: EMPTY_BOARD.slice(),
    fixed: EMPTY_FIXED.slice(),
    errors: [],
    completed: false,
    startedAt: null,
    roundNumber: 0,
    playerNames: {},
    scores: {},
  };
}

function getState(roomId) {
  if (!ROOM_STATES.has(roomId)) {
    ROOM_STATES.set(roomId, createRoomState());
  }

  return ROOM_STATES.get(roomId);
}

function getSocketRoomId(socket) {
  return socket.data?.sudokuRoomId || null;
}

function getMembersOfSudokuRoom(io, roomId) {
  const room = io.sockets.adapter.rooms.get(getRoomChannel(roomId));
  return room ? Array.from(room) : [];
}

function cleanupRoomStateIfEmpty(io, roomId) {
  const members = io.sockets.adapter.rooms.get(getRoomChannel(roomId));
  if (!members || members.size === 0) {
    ROOM_STATES.delete(roomId);
  }
}

function buildLeaderboard(io, roomId, state) {
  const members = getMembersOfSudokuRoom(io, roomId);
  return members
    .map((id) => ({
      id,
      name: displayName(state.playerNames[id]),
      score: state.scores[id] || 0,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.name.localeCompare(right.name);
    });
}

function buildPublicState(io, roomId, state) {
  return {
    roomId,
    started: !!state.started,
    difficulty: state.difficulty || null,
    puzzle: state.puzzle.slice(),
    values: state.values.slice(),
    fixed: state.fixed.slice(),
    errors: Array.isArray(state.errors) ? state.errors.slice() : [],
    completed: !!state.completed,
    roundNumber: state.roundNumber || 0,
    startedAt: state.startedAt || null,
    leaderboard: buildLeaderboard(io, roomId, state),
  };
}

function emitStateToRoom(io, roomId, state) {
  io.to(getRoomChannel(roomId)).emit('sudoku-state', buildPublicState(io, roomId, state));
}

function emitStateToSocket(io, socket, roomId, state) {
  socket.emit('sudoku-state', buildPublicState(io, roomId, state));
}

function resetGameState(state, difficulty = null) {
  state.started = false;
  state.difficulty = difficulty;
  state.puzzle = EMPTY_BOARD.slice();
  state.solution = EMPTY_BOARD.slice();
  state.values = EMPTY_BOARD.slice();
  state.fixed = EMPTY_FIXED.slice();
  state.errors = [];
  state.completed = false;
  state.startedAt = null;
}

function joinSudokuRoom(io, socket, roomId, nickname) {
  const nextName = sanitizeWord(nickname, 24);
  if (!nextName) return null;

  const previousRoomId = getSocketRoomId(socket);
  if (previousRoomId && previousRoomId !== roomId) {
    leaveSudokuRoom(io, socket);
  }

  const state = getState(roomId);
  socket.data.sudokuRoomId = roomId;
  socket.join(getRoomChannel(roomId));
  state.playerNames[socket.id] = nextName;
  if (typeof state.scores[socket.id] !== 'number') {
    state.scores[socket.id] = 0;
  }
  return state;
}

function leaveSudokuRoom(io, socket) {
  const roomId = getSocketRoomId(socket);
  if (!roomId) return;

  const state = getState(roomId);
  socket.leave(getRoomChannel(roomId));
  delete state.playerNames[socket.id];
  delete state.scores[socket.id];
  socket.data.sudokuRoomId = null;
  cleanupRoomStateIfEmpty(io, roomId);
}

function validatePuzzlePayload(payload) {
  const difficulty = sanitizeWord(payload?.difficulty, 16);
  const puzzle = sanitizeBoard(payload?.puzzle, true);
  const solution = sanitizeBoard(payload?.solution, false);

  if (!difficulty || !puzzle || !solution) {
    return { ok: false, error: 'Invalid puzzle payload' };
  }

  for (let index = 0; index < 81; index++) {
    if (puzzle[index] !== 0 && puzzle[index] !== solution[index]) {
      return { ok: false, error: 'Puzzle clues must match the solution' };
    }
  }

  return { ok: true, data: { difficulty, puzzle, solution } };
}

function recalculateErrors(state) {
  const nextErrors = [];

  state.values.forEach((value, index) => {
    if (value && value !== state.solution[index]) {
      nextErrors.push(index);
    }
  });

  state.errors = nextErrors;
}

function isCompleted(state) {
  return state.values.every((value, index) => value === state.solution[index]);
}

function startRound(io, socket, payload) {
  const roomId = getSocketRoomId(socket);
  if (!roomId) {
    socket.emit('sudoku-error', { message: 'Please join the room first' });
    return;
  }

  const nextName = sanitizeWord(payload.nickname, 24);
  if (!nextName) {
    socket.emit('sudoku-error', { message: 'Please log in before starting Sudoku' });
    return;
  }

  const validation = validatePuzzlePayload(payload);
  if (!validation.ok) {
    socket.emit('sudoku-error', { message: validation.error });
    return;
  }

  const state = getState(roomId);
  state.playerNames[socket.id] = nextName;
  if (typeof state.scores[socket.id] !== 'number') {
    state.scores[socket.id] = 0;
  }

  state.started = true;
  state.difficulty = validation.data.difficulty;
  state.puzzle = validation.data.puzzle.slice();
  state.solution = validation.data.solution.slice();
  state.values = validation.data.puzzle.slice();
  state.fixed = validation.data.puzzle.map((value) => value !== 0);
  state.errors = [];
  state.completed = false;
  state.startedAt = Date.now();
  state.roundNumber = (state.roundNumber || 0) + 1;

  io.to(getRoomChannel(roomId)).emit('sudoku-round-started', {
    roomId,
    difficulty: state.difficulty,
    roundNumber: state.roundNumber,
    startedAt: state.startedAt,
    startedBy: displayName(nextName),
  });

  emitStateToRoom(io, roomId, state);
}

function registerSudokuHandlers(io, socket) {
  socket.emit('sudoku-state', {
    roomId: null,
    started: false,
    difficulty: null,
    puzzle: EMPTY_BOARD.slice(),
    values: EMPTY_BOARD.slice(),
    fixed: EMPTY_FIXED.slice(),
    errors: [],
    completed: false,
    roundNumber: 0,
    startedAt: null,
    leaderboard: [],
  });

  socket.on('sudoku-set-profile', ({ nickname, roomId } = {}) => {
    const cleanRoomId = sanitizeWord(roomId, 24);
    if (!cleanRoomId) return;

    if (!socket.rooms.has(cleanRoomId)) {
      socket.emit('sudoku-error', { message: 'Please join the room first' });
      return;
    }

    joinSudokuRoom(io, socket, cleanRoomId, nickname);
  });

  socket.on('create-room', () => {
    leaveSudokuRoom(io, socket);
  });

  socket.on('join-room', (roomId) => {
    const targetRoomId = sanitizeWord(roomId, 24);
    const currentRoomId = getSocketRoomId(socket);
    if (currentRoomId && currentRoomId !== targetRoomId) {
      leaveSudokuRoom(io, socket);
    }
  });

  socket.on('leave-room', () => {
    leaveSudokuRoom(io, socket);
  });

  socket.on('sudoku-start', (payload = {}) => {
    startRound(io, socket, payload);
  });

  socket.on('sudoku-next-round', (payload = {}) => {
    startRound(io, socket, payload);
  });

  socket.on('sudoku-request-state', () => {
    const roomId = getSocketRoomId(socket);
    if (!roomId) {
      socket.emit('sudoku-state', {
        roomId: null,
        started: false,
        difficulty: null,
        puzzle: EMPTY_BOARD.slice(),
        values: EMPTY_BOARD.slice(),
        fixed: EMPTY_FIXED.slice(),
        errors: [],
        completed: false,
        roundNumber: 0,
        startedAt: null,
        leaderboard: [],
      });
      return;
    }

    emitStateToSocket(io, socket, roomId, getState(roomId));
  });

  socket.on('sudoku-edit', ({ index, value, nickname } = {}) => {
    const roomId = getSocketRoomId(socket);
    if (!roomId) {
      socket.emit('sudoku-error', { message: 'Please join the room first' });
      return;
    }

    const state = getState(roomId);
    if (!state.started || state.completed) return;

    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex > 80) {
      socket.emit('sudoku-error', { message: 'Invalid cell index' });
      return;
    }

    if (state.fixed[nextIndex]) {
      socket.emit('sudoku-error', { message: 'This clue cannot be changed' });
      return;
    }

    const nextValue = sanitizeDigit(value, true);
    if (nextValue === null) {
      socket.emit('sudoku-error', { message: 'Invalid Sudoku value' });
      return;
    }

    const nextName = sanitizeWord(nickname, 24);
    if (nextName) {
      state.playerNames[socket.id] = nextName;
    }
    if (typeof state.scores[socket.id] !== 'number') {
      state.scores[socket.id] = 0;
    }

    const previousValue = state.values[nextIndex];
    if (previousValue === nextValue) return;

    state.values[nextIndex] = nextValue;

    if (nextValue !== 0) {
      if (nextValue === state.solution[nextIndex]) {
        state.scores[socket.id] += 2;
      } else {
        state.scores[socket.id] -= 1;
      }
    }

    recalculateErrors(state);
    state.completed = isCompleted(state);
    emitStateToRoom(io, roomId, state);

    if (state.completed) {
      io.to(getRoomChannel(roomId)).emit('sudoku-complete', {
        roomId,
        roundNumber: state.roundNumber,
        completedBy: displayName(state.playerNames[socket.id]),
      });
    }
  });

  socket.on('sudoku-end', ({ nickname } = {}) => {
    const roomId = getSocketRoomId(socket);
    if (!roomId) {
      socket.emit('sudoku-error', { message: 'Please join the room first' });
      return;
    }

    const state = getState(roomId);
    if (!state.started && !state.completed) return;

    const endedBy = displayName(nickname || state.playerNames[socket.id]);
    resetGameState(state, state.difficulty);
    io.to(getRoomChannel(roomId)).emit('sudoku-ended', {
      roomId,
      roundNumber: state.roundNumber || 0,
      endedBy,
    });
    emitStateToRoom(io, roomId, state);
  });

  socket.on('disconnect', () => {
    leaveSudokuRoom(io, socket);
  });
}

module.exports = {
  registerSudokuHandlers,
};
