const QUICKBOAT_PREFIX = 'quickboat:';
const ROOM_STATES = new Map();

const SCORE_CATEGORIES = [
  { id: 'ones', name: 'Ones' },
  { id: 'twos', name: 'Twos' },
  { id: 'threes', name: 'Threes' },
  { id: 'fours', name: 'Fours' },
  { id: 'fives', name: 'Fives' },
  { id: 'sixes', name: 'Sixes' },
  { id: 'choice', name: 'Choice' },
  { id: 'fourkind', name: 'Four of a Kind' },
  { id: 'fullhouse', name: 'Full House' },
  { id: 'smallstraight', name: 'Small Straight' },
  { id: 'largestraight', name: 'Large Straight' },
  { id: 'yacht', name: 'Yacht' },
];

function sanitizeWord(value, maxLen = 80) {
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
      'Guest',
  );
}

function getRoomChannel(roomId) {
  return `${QUICKBOAT_PREFIX}${roomId}`;
}

function createBlankScorecard() {
  return SCORE_CATEGORIES.reduce((accumulator, category) => {
    accumulator[category.id] = null;
    return accumulator;
  }, {});
}

function createPlayerState(name) {
  return {
    name: displayName(name),
    scorecard: createBlankScorecard(),
  };
}

function createRoomState() {
  return {
    started: false,
    gameOver: false,
    currentPlayer: null,
    turnOrder: [],
    players: {},
    dice: [0, 0, 0, 0, 0],
    holds: [false, false, false, false, false],
    rollsLeft: 3,
    hasRolled: false,
    round: 1,
    winnerId: null,
    winnerName: null,
    log: [],
  };
}

function getState(roomId) {
  if (!ROOM_STATES.has(roomId)) {
    ROOM_STATES.set(roomId, createRoomState());
  }
  return ROOM_STATES.get(roomId);
}

function getSocketRoomId(socket) {
  return socket.data?.quickboatRoomId || null;
}

function getPlayersInOrder(state) {
  return state.turnOrder.filter((playerId) => state.players[playerId]);
}

function pushLog(state, message) {
  const text = sanitizeWord(message, 220);
  if (!text) return;
  state.log.push(text);
  if (state.log.length > 16) {
    state.log.shift();
  }
}

function cleanupRoomStateIfEmpty(io, roomId) {
  const members = io.sockets.adapter.rooms.get(getRoomChannel(roomId));
  if (!members || members.size === 0) {
    ROOM_STATES.delete(roomId);
  }
}

function ensurePlayerState(state, playerId, name) {
  if (!state.players[playerId]) {
    state.players[playerId] = createPlayerState(name);
  }
  state.players[playerId].name = displayName(name);
  if (!state.turnOrder.includes(playerId)) {
    state.turnOrder.push(playerId);
  }
  return state.players[playerId];
}

function totalScore(scorecard) {
  return Object.values(scorecard || {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function filledCount(scorecard) {
  return Object.values(scorecard || {}).filter((value) => Number.isFinite(value)).length;
}

function countFaces(dice) {
  return dice.reduce((counts, value) => {
    if (value >= 1 && value <= 6) {
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }, {});
}

function hasSequence(dice, sequence) {
  const set = new Set(dice);
  return sequence.every((value) => set.has(value));
}

function scoreCategory(categoryId, dice) {
  const counts = countFaces(dice);
  const sum = dice.reduce((accumulator, value) => accumulator + value, 0);

  if (categoryId === 'ones') return (counts[1] || 0) * 1;
  if (categoryId === 'twos') return (counts[2] || 0) * 2;
  if (categoryId === 'threes') return (counts[3] || 0) * 3;
  if (categoryId === 'fours') return (counts[4] || 0) * 4;
  if (categoryId === 'fives') return (counts[5] || 0) * 5;
  if (categoryId === 'sixes') return (counts[6] || 0) * 6;
  if (categoryId === 'choice') return sum;
  if (categoryId === 'fourkind') {
    const face = Object.keys(counts).find((key) => counts[key] >= 4);
    return face ? Number(face) * 4 : 0;
  }
  if (categoryId === 'fullhouse') {
    const values = Object.values(counts).sort((a, b) => a - b);
    return values.length === 2 && values[0] === 2 && values[1] === 3 ? sum : 0;
  }
  if (categoryId === 'smallstraight') {
    return hasSequence(dice, [1, 2, 3, 4, 5]) ? 15 : 0;
  }
  if (categoryId === 'largestraight') {
    return hasSequence(dice, [2, 3, 4, 5, 6]) ? 30 : 0;
  }
  if (categoryId === 'yacht') {
    return Object.values(counts).some((count) => count === 5) ? 50 : 0;
  }
  return 0;
}

function buildPublicState(roomId, state) {
  return {
    roomId,
    started: !!state.started,
    gameOver: !!state.gameOver,
    currentPlayer: state.currentPlayer || null,
    round: Number(state.round || 1),
    dice: state.dice.slice(),
    holds: state.holds.slice(),
    rollsLeft: Number(state.rollsLeft || 0),
    hasRolled: !!state.hasRolled,
    winnerId: state.winnerId || null,
    winnerName: state.winnerName || null,
    log: state.log.slice(),
    categories: SCORE_CATEGORIES.map((category) => ({ ...category })),
    players: getPlayersInOrder(state).map((playerId) => {
      const player = state.players[playerId];
      return {
        id: playerId,
        name: displayName(player.name),
        scorecard: { ...player.scorecard },
        total: totalScore(player.scorecard),
        filledCount: filledCount(player.scorecard),
      };
    }),
  };
}

function emitStateToRoom(io, roomId, state) {
  io.to(getRoomChannel(roomId)).emit('quickboat-state', buildPublicState(roomId, state));
}

function emitEmptyState(socket) {
  socket.emit('quickboat-state', {
    roomId: null,
    started: false,
    gameOver: false,
    currentPlayer: null,
    round: 1,
    dice: [0, 0, 0, 0, 0],
    holds: [false, false, false, false, false],
    rollsLeft: 3,
    hasRolled: false,
    winnerId: null,
    winnerName: null,
    log: [],
    categories: SCORE_CATEGORIES.map((category) => ({ ...category })),
    players: [],
  });
}

function leaveQuickBoatRoom(io, socket) {
  const roomId = getSocketRoomId(socket);
  if (!roomId) return;

  socket.leave(getRoomChannel(roomId));
  socket.data.quickboatRoomId = null;
  emitEmptyState(socket);

  const state = ROOM_STATES.get(roomId);
  if (state) {
    emitStateToRoom(io, roomId, state);
  }
  cleanupRoomStateIfEmpty(io, roomId);
}

function syncMembership(io, socket, roomId, nickname) {
  const cleanRoomId = sanitizeWord(roomId, 24);
  if (!cleanRoomId) {
    return { ok: false, error: 'Please join the room first' };
  }
  if (!socket.rooms.has(cleanRoomId)) {
    return { ok: false, error: 'Please join the room first' };
  }

  const state = getState(cleanRoomId);
  const playerId = getPlayerKey(socket);
  ensurePlayerState(state, playerId, nickname || getSocketDisplayName(socket));
  socket.data.quickboatRoomId = cleanRoomId;
  socket.join(getRoomChannel(cleanRoomId));
  return { ok: true, roomId: cleanRoomId, state, playerId };
}

function startTurn(state, playerId) {
  state.currentPlayer = playerId;
  state.dice = [0, 0, 0, 0, 0];
  state.holds = [false, false, false, false, false];
  state.rollsLeft = 3;
  state.hasRolled = false;
}

function getNextPlayerId(state, currentPlayerId) {
  const players = getPlayersInOrder(state);
  if (!players.length) return null;
  const currentIndex = players.indexOf(currentPlayerId);
  if (currentIndex === -1) return players[0];
  return players[(currentIndex + 1) % players.length];
}

function allScorecardsFilled(state) {
  return getPlayersInOrder(state).every((playerId) => filledCount(state.players[playerId].scorecard) === SCORE_CATEGORIES.length);
}

function computeWinner(state) {
  const ranked = getPlayersInOrder(state)
    .map((playerId) => {
      const player = state.players[playerId];
      return {
        id: playerId,
        name: displayName(player.name),
        total: totalScore(player.scorecard),
      };
    })
    .sort((a, b) => b.total - a.total);

  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].total === ranked[1].total) {
    return { id: null, name: null };
  }
  return { id: ranked[0].id, name: ranked[0].name };
}

function startMatch(io, roomId, state) {
  const playerIds = getPlayersInOrder(state);
  if (playerIds.length < 2) {
    return { ok: false, error: 'Quick Boat needs two players in the room' };
  }

  playerIds.forEach((playerId) => {
    state.players[playerId].scorecard = createBlankScorecard();
  });
  state.started = true;
  state.gameOver = false;
  state.round = 1;
  state.winnerId = null;
  state.winnerName = null;
  state.log = [];

  const starter = playerIds[0];
  startTurn(state, starter);
  pushLog(state, `${displayName(state.players[starter].name)} starts Quick Boat.`);

  io.to(getRoomChannel(roomId)).emit('quickboat-round-started', {
    roomId,
    currentPlayer: starter,
    currentPlayerName: displayName(state.players[starter].name),
  });
  emitStateToRoom(io, roomId, state);
  return { ok: true };
}

function registerQuickBoatHandlers(io, socket) {
  emitEmptyState(socket);

  socket.on('quickboat-set-profile', ({ roomId, nickname } = {}) => {
    const membership = syncMembership(io, socket, roomId, nickname);
    if (!membership.ok) {
      socket.emit('quickboat-error', { message: membership.error });
      emitEmptyState(socket);
      return;
    }
    emitStateToRoom(io, membership.roomId, membership.state);
  });

  socket.on('quickboat-request-state', ({ roomId, nickname } = {}) => {
    const targetRoomId = roomId || getSocketRoomId(socket);
    const membership = syncMembership(io, socket, targetRoomId, nickname);
    if (!membership.ok) {
      socket.emit('quickboat-error', { message: membership.error });
      emitEmptyState(socket);
      return;
    }
    socket.emit('quickboat-state', buildPublicState(membership.roomId, membership.state));
  });

  socket.on('quickboat-start', ({ roomId, nickname } = {}) => {
    const targetRoomId = roomId || getSocketRoomId(socket);
    const membership = syncMembership(io, socket, targetRoomId, nickname);
    if (!membership.ok) {
      socket.emit('quickboat-error', { message: membership.error });
      return;
    }
    const result = startMatch(io, membership.roomId, membership.state);
    if (!result.ok) {
      socket.emit('quickboat-error', { message: result.error });
    }
  });

  socket.on('quickboat-toggle-hold', ({ index } = {}) => {
    const roomId = getSocketRoomId(socket);
    if (!roomId) {
      socket.emit('quickboat-error', { message: 'Please join the room first' });
      return;
    }
    const state = getState(roomId);
    if (!state.started || state.gameOver) {
      socket.emit('quickboat-error', { message: 'No active game' });
      return;
    }
    if (state.currentPlayer !== getPlayerKey(socket)) {
      socket.emit('quickboat-error', { message: 'It is not your turn' });
      return;
    }
    if (!state.hasRolled) {
      socket.emit('quickboat-error', { message: 'Roll first before holding dice' });
      return;
    }
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= state.holds.length) {
      socket.emit('quickboat-error', { message: 'Invalid die index' });
      return;
    }
    state.holds[nextIndex] = !state.holds[nextIndex];
    emitStateToRoom(io, roomId, state);
  });

  socket.on('quickboat-roll', () => {
    const roomId = getSocketRoomId(socket);
    if (!roomId) {
      socket.emit('quickboat-error', { message: 'Please join the room first' });
      return;
    }
    const state = getState(roomId);
    if (!state.started || state.gameOver) {
      socket.emit('quickboat-error', { message: 'No active game' });
      return;
    }
    if (state.currentPlayer !== getPlayerKey(socket)) {
      socket.emit('quickboat-error', { message: 'It is not your turn' });
      return;
    }
    if (state.rollsLeft <= 0) {
      socket.emit('quickboat-error', { message: 'No rolls left this turn' });
      return;
    }

    state.dice = state.dice.map((value, index) => {
      if (state.hasRolled && state.holds[index]) return value;
      return 1 + Math.floor(Math.random() * 6);
    });
    state.rollsLeft -= 1;
    state.hasRolled = true;
    emitStateToRoom(io, roomId, state);
  });

  socket.on('quickboat-score', ({ categoryId } = {}) => {
    const roomId = getSocketRoomId(socket);
    if (!roomId) {
      socket.emit('quickboat-error', { message: 'Please join the room first' });
      return;
    }
    const state = getState(roomId);
    if (!state.started || state.gameOver) {
      socket.emit('quickboat-error', { message: 'No active game' });
      return;
    }
    const playerId = getPlayerKey(socket);
    if (state.currentPlayer !== playerId) {
      socket.emit('quickboat-error', { message: 'It is not your turn' });
      return;
    }
    if (!state.hasRolled) {
      socket.emit('quickboat-error', { message: 'Roll the dice before scoring' });
      return;
    }
    const category = SCORE_CATEGORIES.find((entry) => entry.id === categoryId);
    if (!category) {
      socket.emit('quickboat-error', { message: 'Unknown scoring category' });
      return;
    }
    const player = state.players[playerId];
    if (Number.isFinite(player.scorecard[category.id])) {
      socket.emit('quickboat-error', { message: 'That category is already filled' });
      return;
    }

    const score = scoreCategory(category.id, state.dice);
    player.scorecard[category.id] = score;
    pushLog(state, `${displayName(player.name)} scored ${score} in ${category.name}.`);

    if (allScorecardsFilled(state)) {
      state.started = false;
      state.gameOver = true;
      const winner = computeWinner(state);
      state.winnerId = winner?.id || null;
      state.winnerName = winner?.name || null;
      io.to(getRoomChannel(roomId)).emit('quickboat-game-ended', {
        roomId,
        winnerId: state.winnerId,
        winnerName: state.winnerName,
      });
      emitStateToRoom(io, roomId, state);
      return;
    }

    const nextPlayerId = getNextPlayerId(state, playerId);
    if (nextPlayerId === getPlayersInOrder(state)[0]) {
      state.round += 1;
    }
    startTurn(state, nextPlayerId);
    emitStateToRoom(io, roomId, state);
  });

  socket.on('quickboat-reset', ({ roomId, nickname } = {}) => {
    const targetRoomId = roomId || getSocketRoomId(socket);
    const membership = syncMembership(io, socket, targetRoomId, nickname);
    if (!membership.ok) {
      socket.emit('quickboat-error', { message: membership.error });
      return;
    }

    membership.state.started = false;
    membership.state.gameOver = false;
    membership.state.currentPlayer = null;
    membership.state.round = 1;
    membership.state.dice = [0, 0, 0, 0, 0];
    membership.state.holds = [false, false, false, false, false];
    membership.state.rollsLeft = 3;
    membership.state.hasRolled = false;
    membership.state.winnerId = null;
    membership.state.winnerName = null;
    membership.state.log = [];

    getPlayersInOrder(membership.state).forEach((playerId) => {
      membership.state.players[playerId].scorecard = createBlankScorecard();
    });
    pushLog(membership.state, `${displayName(nickname || getSocketDisplayName(socket))} reset Quick Boat.`);

    io.to(getRoomChannel(membership.roomId)).emit('quickboat-reset', { roomId: membership.roomId });
    emitStateToRoom(io, membership.roomId, membership.state);
  });

  socket.on('create-room', () => {
    leaveQuickBoatRoom(io, socket);
  });

  socket.on('join-room', (payload) => {
    const rawId =
      typeof payload === 'string'
        ? payload
        : payload && payload.roomId
          ? payload.roomId
          : '';
    const targetRoomId = sanitizeWord(rawId, 24);
    const currentRoomId = getSocketRoomId(socket);
    if (currentRoomId && currentRoomId !== targetRoomId) {
      leaveQuickBoatRoom(io, socket);
    }
  });

  socket.on('leave-room', () => {
    leaveQuickBoatRoom(io, socket);
  });

  socket.on('disconnect', () => {
    leaveQuickBoatRoom(io, socket);
  });
}

module.exports = {
  registerQuickBoatHandlers,
};
