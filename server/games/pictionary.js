const PICT_PREFIX = 'pict:';
const ROOM_STATES = new Map();

function normalizeGuess(value) {
  return (value || '').toString().trim().toLowerCase();
}

function sanitizeWord(value, maxLen = 40) {
  return (value || '').toString().trim().slice(0, maxLen);
}

function displayName(name) {
  const cleaned = sanitizeWord(name, 24);
  return cleaned || 'Guest';
}

function getRoomChannel(roomId) {
  return `${PICT_PREFIX}${roomId}`;
}

function getState(roomId) {
  if (!ROOM_STATES.has(roomId)) {
    ROOM_STATES.set(roomId, {
      drawerId: null,
      word: null,
      roundActive: false,
      scores: {},
      playerNames: {},
      lastStartAt: 0,
      strokes: [],
    });
  }
  return ROOM_STATES.get(roomId);
}

function cleanupRoomStateIfEmpty(io, roomId) {
  const channel = getRoomChannel(roomId);
  const members = io.sockets.adapter.rooms.get(channel);
  if (!members || members.size === 0) {
    ROOM_STATES.delete(roomId);
  }
}

function getPlayerName(state, socketId) {
  return displayName(state.playerNames[socketId]);
}

function getMembersOfPictRoom(io, roomId) {
  const room = io.sockets.adapter.rooms.get(getRoomChannel(roomId));
  return room ? Array.from(room) : [];
}

function buildLeaderboard(io, roomId, state) {
  const members = getMembersOfPictRoom(io, roomId);
  return members
    .map((id) => ({
      id,
      name: getPlayerName(state, id),
      score: state.scores[id] || 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
}

function emitPictState(io, roomId, state) {
  const channel = getRoomChannel(roomId);
  io.to(channel).emit('pict-state', {
    drawerId: state.drawerId,
    drawerName: state.drawerId ? getPlayerName(state, state.drawerId) : null,
    roundActive: state.roundActive,
    scores: state.scores,
    leaderboard: buildLeaderboard(io, roomId, state),
    roomId,
  });
}

function getSocketRoomId(socket) {
  return socket.data?.pictRoomId || null;
}

function isPictMember(socket) {
  return !!getSocketRoomId(socket);
}

function endRound(io, roomId, state, payload) {
  state.roundActive = false;
  state.word = null;
  state.drawerId = null;
  state.strokes = [];

  const channel = getRoomChannel(roomId);
  io.to(channel).emit('pict-round-ended', {
    ...payload,
    scores: state.scores,
    leaderboard: buildLeaderboard(io, roomId, state),
    roomId,
  });
}

function joinPictRoom(io, socket, roomId, nickname) {
  const state = getState(roomId);
  const nextName = sanitizeWord(nickname, 24);
  if (!nextName) return null;

  const previousRoomId = getSocketRoomId(socket);
  if (previousRoomId && previousRoomId !== roomId) {
    const previousState = getState(previousRoomId);
    const previousChannel = getRoomChannel(previousRoomId);
    socket.leave(previousChannel);
    delete previousState.playerNames[socket.id];

    if (previousState.roundActive && previousState.drawerId === socket.id) {
      endRound(io, previousRoomId, previousState, {
        winnerId: null,
        winnerName: null,
        word: previousState.word,
        endedBy: 'System',
        manual: true,
      });
    }

    emitPictState(io, previousRoomId, previousState);
    cleanupRoomStateIfEmpty(io, previousRoomId);
  }

  socket.data.pictRoomId = roomId;
  socket.join(getRoomChannel(roomId));
  state.playerNames[socket.id] = nextName;
  emitPictState(io, roomId, state);

  return state;
}

function registerPictionaryHandlers(io, socket) {
  socket.emit('pict-state', {
    drawerId: null,
    drawerName: null,
    roundActive: false,
    scores: {},
    leaderboard: [],
    roomId: null,
  });

  socket.on('pict-set-profile', ({ nickname, roomId } = {}) => {
    const cleanRoomId = sanitizeWord(roomId, 24);
    if (!cleanRoomId) return;

    if (!socket.rooms.has(cleanRoomId)) {
      socket.emit('pict-error', { message: 'Please join the room first' });
      return;
    }

    joinPictRoom(io, socket, cleanRoomId, nickname);
  });

  socket.on('pict-start', (payload = {}) => {
    if (!isPictMember(socket)) {
      socket.emit('pict-error', { message: 'Please join the room first' });
      return;
    }

    const roomId = getSocketRoomId(socket);
    const state = getState(roomId);

    const now = Date.now();
    if (now - state.lastStartAt < 800) return;

    const startName = sanitizeWord(payload.nickname, 24);
    if (!startName) {
      socket.emit('pict-error', { message: 'Please log in before starting the game' });
      return;
    }
    state.playerNames[socket.id] = startName;

    const manualWord = sanitizeWord(payload.word);
    if (!manualWord) {
      socket.emit('pict-error', { message: 'Answer word is required to start' });
      return;
    }

    const members = getMembersOfPictRoom(io, roomId);
    if (members.length === 0) return;

    state.lastStartAt = now;
    state.drawerId = socket.id;
    state.word = manualWord;
    state.roundActive = true;

    io.to(getRoomChannel(roomId)).emit('pict-round-started', {
      drawerId: state.drawerId,
      drawerName: getPlayerName(state, state.drawerId),
      leaderboard: buildLeaderboard(io, roomId, state),
      roomId,
    });

    io.to(state.drawerId).emit('pict-word', { word: state.word });
    state.strokes = [];
    io.to(getRoomChannel(roomId)).emit('pict-clear');
  });

  socket.on('pict-draw', (segment) => {
    if (!isPictMember(socket)) return;

    const roomId = getSocketRoomId(socket);
    const state = getState(roomId);

    if (!state.roundActive) return;
    if (socket.id !== state.drawerId) return;

    state.strokes.push(segment);
    if (state.strokes.length > 20000) state.strokes.shift();

    socket.to(getRoomChannel(roomId)).emit('pict-draw', segment);
  });

  socket.on('pict-clear', () => {
    if (!isPictMember(socket)) return;

    const roomId = getSocketRoomId(socket);
    const state = getState(roomId);

    if (socket.id !== state.drawerId) return;
    state.strokes = [];
    io.to(getRoomChannel(roomId)).emit('pict-clear');
  });

  socket.on('pict-guess', ({ guess, nickname } = {}) => {
    if (!isPictMember(socket)) return;

    const roomId = getSocketRoomId(socket);
    const state = getState(roomId);

    if (!state.roundActive || !state.word) return;
    if (socket.id === state.drawerId) return;

    const guessName = sanitizeWord(nickname, 24);
    if (!guessName) return;
    state.playerNames[socket.id] = guessName;

    const normalizedGuess = normalizeGuess(guess);
    if (!normalizedGuess) return;

    const correct = normalizedGuess === normalizeGuess(state.word);

    io.to(getRoomChannel(roomId)).emit('pict-guess-broadcast', {
      from: displayName(nickname),
      guess: sanitizeWord(guess, 80),
      correct,
      roomId,
    });

    if (!correct) {
      socket.emit('pict-guess-feedback', {
        correct: false,
        message: 'Wrong answer, try again!',
      });
      return;
    }

    if (correct) {
      state.scores[socket.id] = (state.scores[socket.id] || 0) + 1;
      const answerWord = state.word;
      const winnerName = getPlayerName(state, socket.id);

      io.to(getRoomChannel(roomId)).emit('pict-correct', {
        winnerId: socket.id,
        winnerName,
        roomId,
      });

      setTimeout(() => {
        endRound(io, roomId, state, {
          winnerId: socket.id,
          winnerName,
          word: answerWord,
          endedBy: winnerName,
          manual: false,
        });
      }, 700);
    }
  });

  socket.on('pict-end-round', ({ nickname } = {}) => {
    if (!isPictMember(socket)) return;

    const roomId = getSocketRoomId(socket);
    const state = getState(roomId);

    if (!state.roundActive) return;

    const endName = sanitizeWord(nickname, 24);
    if (!endName) return;
    state.playerNames[socket.id] = endName;

    endRound(io, roomId, state, {
      winnerId: null,
      winnerName: null,
      word: state.word,
      endedBy: getPlayerName(state, socket.id),
      manual: true,
    });
  });

  socket.on('pict-request-history', () => {
    if (!isPictMember(socket)) {
      socket.emit('pict-history', { strokes: [] });
      return;
    }

    const roomId = getSocketRoomId(socket);
    const state = getState(roomId);
    socket.emit('pict-history', { strokes: state.strokes, roomId });
  });

  socket.on('disconnect', () => {
    const roomId = getSocketRoomId(socket);
    if (!roomId) return;

    const state = getState(roomId);
    delete state.playerNames[socket.id];

    if (state.roundActive && state.drawerId === socket.id) {
      endRound(io, roomId, state, {
        winnerId: null,
        winnerName: null,
        word: state.word,
        endedBy: 'System',
        manual: true,
      });
    }

    emitPictState(io, roomId, state);
    cleanupRoomStateIfEmpty(io, roomId);
  });
}

module.exports = {
  registerPictionaryHandlers,
};
