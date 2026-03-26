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

function getPlayerKey(socket) {
  const authUserId = sanitizeWord(socket?.data?.auth?.userId, 80);
  return authUserId || socket.id;
}

function getSocketDisplayName(socket) {
  return displayName(
    socket?.data?.auth?.displayName ||
    socket?.data?.auth?.username ||
    'Guest'
  );
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

function getMembersOfRoom(io, roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  return room ? Array.from(room) : [];
}

function cleanupRoomStateIfEmpty(io, roomId) {
  const members = io.sockets.adapter.rooms.get(roomId);
  if (!members || members.size === 0) {
    ROOM_STATES.delete(roomId);
  }
}

function buildLeaderboard(io, roomId, state) {
  const members = getMembersOfRoom(io, roomId);
  const seen = new Set();

  return members
    .map((socketId) => io.sockets.sockets.get(socketId))
    .filter(Boolean)
    .map((memberSocket) => {
      const id = getPlayerKey(memberSocket);
      if (seen.has(id)) {
        return null;
      }
      seen.add(id);

      return {
        id,
        name: displayName(state.playerNames[id] || getSocketDisplayName(memberSocket)),
        score: state.scores[id] || 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.name.localeCompare(right.name);
    });
}

function buildPublicState(io, roomId, state, currentPlayerId = null) {
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
    currentPlayerId,
  };
}

function emitStateToRoom(io, roomId, state) {
  io.to(getRoomChannel(roomId)).emit('sudoku-state', buildPublicState(io, roomId, state));
}

function emitStateToSocket(io, socket, roomId, state) {
  socket.emit('sudoku-state', buildPublicState(io, roomId, state, getPlayerKey(socket)));
}

function emitEmptyState(socket) {
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
    currentPlayerId: null,
  });
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

function syncPlayerState(state, socket, nickname) {
  const playerKey = getPlayerKey(socket);
  const nextName = sanitizeWord(nickname, 24) || getSocketDisplayName(socket);

  state.playerNames[playerKey] = nextName;
  if (typeof state.scores[playerKey] !== 'number') {
    state.scores[playerKey] = 0;
  }

  socket.data.sudokuPlayerKey = playerKey;
  return playerKey;
}

function joinSudokuRoom(io, socket, roomId, nickname) {
  const previousRoomId = getSocketRoomId(socket);
  if (previousRoomId && previousRoomId !== roomId) {
    leaveSudokuRoom(io, socket);
  }

  const state = getState(roomId);
  socket.data.sudokuRoomId = roomId;
  socket.join(getRoomChannel(roomId));
  syncPlayerState(state, socket, nickname);
  return state;
}

function leaveSudokuRoom(io, socket) {
  const roomId = getSocketRoomId(socket);
  if (!roomId) return;

  const state = ROOM_STATES.get(roomId);
  socket.leave(getRoomChannel(roomId));
  socket.data.sudokuRoomId = null;
  socket.data.sudokuPlayerKey = null;

  if (state) {
    emitStateToRoom(io, roomId, state);
  }
  cleanupRoomStateIfEmpty(io, roomId);
}

function syncSudokuMembership(io, socket, roomId, nickname) {
  const cleanRoomId = sanitizeWord(roomId, 24);
  if (!cleanRoomId) {
    return { ok: false, error: 'Please join the room first' };
  }

  if (!socket.rooms.has(cleanRoomId)) {
    return { ok: false, error: 'Please join the room first' };
  }

  const state = joinSudokuRoom(io, socket, cleanRoomId, nickname);
  if (!state) {
    return { ok: false, error: 'Please log in before opening Sudoku' };
  }

  return {
    ok: true,
    roomId: cleanRoomId,
    state,
  };
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

  const nextName = sanitizeWord(payload.nickname, 24) || getSocketDisplayName(socket);
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
  syncPlayerState(state, socket, nextName);

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

function broadcastRoomStateIfActive(io, roomId) {
  const cleanRoomId = sanitizeWord(roomId, 24);
  if (!cleanRoomId || !ROOM_STATES.has(cleanRoomId)) return;
  emitStateToRoom(io, cleanRoomId, ROOM_STATES.get(cleanRoomId));
}

function registerSudokuHandlers(io, socket) {
  emitEmptyState(socket);

  socket.on('sudoku-set-profile', ({ nickname, roomId } = {}) => {
    const membership = syncSudokuMembership(io, socket, roomId, nickname);
    if (!membership.ok) {
      socket.emit('sudoku-error', { message: membership.error });
      return;
    }

    emitStateToSocket(io, socket, membership.roomId, membership.state);
    emitStateToRoom(io, membership.roomId, membership.state);
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

    broadcastRoomStateIfActive(io, targetRoomId);
  });

  socket.on('leave-room', (roomId) => {
    const targetRoomId = sanitizeWord(roomId, 24) || getSocketRoomId(socket);
    leaveSudokuRoom(io, socket);
    broadcastRoomStateIfActive(io, targetRoomId);
  });

  socket.on('sudoku-start', (payload = {}) => {
    startRound(io, socket, payload);
  });

  socket.on('sudoku-next-round', (payload = {}) => {
    startRound(io, socket, payload);
  });

  socket.on('sudoku-request-state', ({ roomId, nickname } = {}) => {
    let targetRoomId = getSocketRoomId(socket);
    let state = targetRoomId ? getState(targetRoomId) : null;

    if (roomId) {
      const membership = syncSudokuMembership(io, socket, roomId, nickname);
      if (!membership.ok) {
        socket.emit('sudoku-error', { message: membership.error });
        emitEmptyState(socket);
        return;
      }

      targetRoomId = membership.roomId;
      state = membership.state;
    }

    if (!targetRoomId || !state) {
      emitEmptyState(socket);
      return;
    }

    emitStateToSocket(io, socket, targetRoomId, state);
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

    const playerKey = syncPlayerState(state, socket, nickname);

    const previousValue = state.values[nextIndex];
    if (previousValue === nextValue) return;

    state.values[nextIndex] = nextValue;

    if (nextValue !== 0) {
      if (nextValue === state.solution[nextIndex]) {
        state.scores[playerKey] += 2;
      } else {
        state.scores[playerKey] -= 1;
      }
    }

    recalculateErrors(state);
    state.completed = isCompleted(state);
    emitStateToRoom(io, roomId, state);

    if (state.completed) {
      io.to(getRoomChannel(roomId)).emit('sudoku-complete', {
        roomId,
        roundNumber: state.roundNumber,
        completedBy: displayName(state.playerNames[playerKey]),
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

    const playerKey = getPlayerKey(socket);
    const endedBy = displayName(nickname || state.playerNames[playerKey] || getSocketDisplayName(socket));
    resetGameState(state, state.difficulty);
    io.to(getRoomChannel(roomId)).emit('sudoku-ended', {
      roomId,
      roundNumber: state.roundNumber || 0,
      endedBy,
    });
    emitStateToRoom(io, roomId, state);
  });

  socket.on('disconnecting', () => {
    const roomIds = Array.from(socket.rooms).filter((roomId) => (
      roomId &&
      roomId !== socket.id &&
      !roomId.startsWith(SUDOKU_PREFIX)
    ));

    if (!roomIds.length) return;

    setTimeout(() => {
      roomIds.forEach((roomId) => {
        broadcastRoomStateIfActive(io, roomId);
      });
    }, 0);
  });

  socket.on('disconnect', () => {
    leaveSudokuRoom(io, socket);
  });
}

module.exports = {
  registerSudokuHandlers,
};
