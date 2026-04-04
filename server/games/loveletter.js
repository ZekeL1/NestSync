const LOVELETTER_PREFIX = 'loveletter:';
const ROOM_STATES = new Map();

const CARD_LIBRARY = {
  guard: { id: 'guard', name: 'Guard', value: 1 },
  priest: { id: 'priest', name: 'Priest', value: 2 },
  baron: { id: 'baron', name: 'Baron', value: 3 },
  handmaid: { id: 'handmaid', name: 'Handmaid', value: 4 },
  prince: { id: 'prince', name: 'Prince', value: 5 },
  king: { id: 'king', name: 'King', value: 6 },
  countess: { id: 'countess', name: 'Countess', value: 7 },
  princess: { id: 'princess', name: 'Princess', value: 8 },
};

const DECK_TEMPLATE = [
  'guard', 'guard', 'guard', 'guard', 'guard',
  'priest', 'priest',
  'baron', 'baron',
  'handmaid', 'handmaid',
  'prince', 'prince',
  'king',
  'countess',
  'princess',
];

const TARGET_TOKEN_COUNT = 3;

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
  return `${LOVELETTER_PREFIX}${roomId}`;
}

function cloneCard(cardId) {
  if (!cardId || !CARD_LIBRARY[cardId]) return null;
  const card = CARD_LIBRARY[cardId];
  return {
    id: card.id,
    name: card.name,
    value: card.value,
  };
}

function shuffle(list) {
  const next = list.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;
  }
  return next;
}

function createPlayerState(name) {
  return {
    name: displayName(name),
    tokens: 0,
    hand: [],
    discard: [],
    eliminated: false,
    protected: false,
  };
}

function createRoomState() {
  return {
    started: false,
    round: 0,
    currentPlayer: null,
    burnCard: null,
    deck: [],
    roundOver: false,
    roundWinnerId: null,
    roundWinnerName: null,
    gameWinnerId: null,
    gameWinnerName: null,
    targetTokens: TARGET_TOKEN_COUNT,
    players: {},
    turnOrder: [],
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
  return socket.data?.loveletterRoomId || null;
}

function getRoundPlayers(state) {
  return state.turnOrder.filter((playerId) => state.players[playerId]);
}

function cleanupRoomStateIfEmpty(io, roomId) {
  const members = io.sockets.adapter.rooms.get(getRoomChannel(roomId));
  if (!members || members.size === 0) {
    ROOM_STATES.delete(roomId);
  }
}

function pushLog(state, message) {
  const text = sanitizeWord(message, 220);
  if (!text) return;
  state.log.push(text);
  if (state.log.length > 16) {
    state.log.shift();
  }
}

function getActivePlayers(state) {
  return getRoundPlayers(state).filter((playerId) => !state.players[playerId].eliminated);
}

function getOpponentIds(state, actorId) {
  return getRoundPlayers(state).filter((playerId) => playerId !== actorId && !state.players[playerId].eliminated);
}

function getTargetableOpponentIds(state, actorId) {
  return getOpponentIds(state, actorId).filter((playerId) => !state.players[playerId].protected);
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

function resetRoundState(state) {
  const playerIds = getRoundPlayers(state);
  playerIds.forEach((playerId) => {
    const player = state.players[playerId];
    player.hand = [];
    player.discard = [];
    player.eliminated = false;
    player.protected = false;
  });
  state.currentPlayer = null;
  state.roundOver = false;
  state.roundWinnerId = null;
  state.roundWinnerName = null;
  state.burnCard = null;
  state.deck = [];
}

function drawCard(state) {
  if (!state.deck.length) return null;
  return state.deck.pop();
}

function drawCardForPlayer(state, playerId, { allowBurn = false } = {}) {
  const player = state.players[playerId];
  if (!player || player.eliminated) return null;

  let cardId = drawCard(state);
  if (!cardId && allowBurn && state.burnCard) {
    cardId = state.burnCard;
    state.burnCard = null;
  }
  if (!cardId) return null;

  player.hand.push(cardId);
  return cardId;
}

function serializeCards(cardIds) {
  return cardIds.map((cardId) => cloneCard(cardId)).filter(Boolean);
}

function buildPublicState(roomId, state, viewerId) {
  const players = getRoundPlayers(state).map((playerId) => {
    const player = state.players[playerId];
    return {
      id: playerId,
      name: displayName(player.name),
      tokens: Number(player.tokens || 0),
      discard: serializeCards(player.discard || []),
      handCount: Array.isArray(player.hand) ? player.hand.length : 0,
      eliminated: !!player.eliminated,
      protected: !!player.protected,
      isCurrent: playerId === state.currentPlayer,
      isMe: playerId === viewerId,
    };
  });

  const me = viewerId ? state.players[viewerId] : null;

  return {
    roomId,
    started: !!state.started,
    round: Number(state.round || 0),
    currentPlayer: state.currentPlayer || null,
    roundOver: !!state.roundOver,
    roundWinnerId: state.roundWinnerId || null,
    roundWinnerName: state.roundWinnerName || null,
    gameWinnerId: state.gameWinnerId || null,
    gameWinnerName: state.gameWinnerName || null,
    deckCount: state.deck.length,
    burnCardReserved: !!state.burnCard,
    targetTokens: Number(state.targetTokens || TARGET_TOKEN_COUNT),
    players,
    log: state.log.slice(),
    myHand: me ? serializeCards(me.hand || []) : [],
  };
}

function emitStateToSocket(socket, roomId, state) {
  socket.emit('loveletter-state', buildPublicState(roomId, state, getPlayerKey(socket)));
}

function emitStateToRoom(io, roomId, state) {
  const room = io.sockets.adapter.rooms.get(getRoomChannel(roomId));
  if (!room || !room.size) return;

  room.forEach((socketId) => {
    const memberSocket = io.sockets.sockets.get(socketId);
    if (memberSocket) {
      emitStateToSocket(memberSocket, roomId, state);
    }
  });
}

function emitEmptyState(socket) {
  socket.emit('loveletter-state', {
    roomId: null,
    started: false,
    round: 0,
    currentPlayer: null,
    roundOver: false,
    roundWinnerId: null,
    roundWinnerName: null,
    gameWinnerId: null,
    gameWinnerName: null,
    deckCount: 0,
    burnCardReserved: false,
    targetTokens: TARGET_TOKEN_COUNT,
    players: [],
    log: [],
    myHand: [],
  });
}

function leaveLoveLetterRoom(io, socket) {
  const roomId = getSocketRoomId(socket);
  if (!roomId) return;

  socket.leave(getRoomChannel(roomId));
  socket.data.loveletterRoomId = null;
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
  socket.data.loveletterRoomId = cleanRoomId;
  socket.join(getRoomChannel(cleanRoomId));
  return { ok: true, roomId: cleanRoomId, state, playerId };
}

function prepareTurn(state, playerId) {
  const player = state.players[playerId];
  if (!player || player.eliminated) return;
  player.protected = false;
  drawCardForPlayer(state, playerId);
}

function getNextActivePlayerId(state, currentPlayerId) {
  const active = getActivePlayers(state);
  if (!active.length) return null;
  const currentIndex = active.indexOf(currentPlayerId);
  if (currentIndex === -1) return active[0];
  return active[(currentIndex + 1) % active.length];
}

function discardCard(player, cardId) {
  if (!cardId) return;
  player.discard.push(cardId);
}

function eliminatePlayer(state, playerId, reason) {
  const player = state.players[playerId];
  if (!player || player.eliminated) return;

  if (player.hand.length) {
    discardCard(player, player.hand[0]);
    player.hand = [];
  }
  player.eliminated = true;
  player.protected = false;

  if (reason) {
    pushLog(state, `${displayName(player.name)} is out: ${reason}`);
  }
}

function compareDiscardStrength(player) {
  return (player.discard || []).reduce((sum, cardId) => sum + (CARD_LIBRARY[cardId]?.value || 0), 0);
}

function finishRoundIfNeeded(io, roomId, state) {
  const active = getActivePlayers(state);
  let winnerId = null;

  if (active.length === 1) {
    winnerId = active[0];
  } else if (active.length === 0) {
    winnerId = null;
  } else if (state.deck.length === 0) {
    const ranked = active
      .map((playerId) => {
        const player = state.players[playerId];
        const handValue = player.hand.length ? CARD_LIBRARY[player.hand[0]].value : 0;
        return {
          id: playerId,
          handValue,
          discardValue: compareDiscardStrength(player),
        };
      })
      .sort((a, b) => {
        if (b.handValue !== a.handValue) return b.handValue - a.handValue;
        return b.discardValue - a.discardValue;
      });

    if (ranked.length) {
      const best = ranked[0];
      const tied = ranked.filter((entry) => entry.handValue === best.handValue && entry.discardValue === best.discardValue);
      if (tied.length === 1) {
        winnerId = best.id;
      }
    }
  }

  const roundShouldEnd = active.length <= 1 || state.deck.length === 0;
  if (!roundShouldEnd) return false;

  state.roundOver = true;
  state.currentPlayer = null;
  state.roundWinnerId = winnerId || null;
  state.roundWinnerName = winnerId ? displayName(state.players[winnerId].name) : null;

  if (winnerId) {
    state.players[winnerId].tokens = Number(state.players[winnerId].tokens || 0) + 1;
    pushLog(state, `${displayName(state.players[winnerId].name)} wins the round.`);

    if (state.players[winnerId].tokens >= state.targetTokens) {
      state.gameWinnerId = winnerId;
      state.gameWinnerName = displayName(state.players[winnerId].name);
      state.started = false;
      pushLog(state, `${state.gameWinnerName} wins the match.`);
    }
  } else {
    pushLog(state, 'Round ends in a tie.');
  }

  io.to(getRoomChannel(roomId)).emit('loveletter-round-ended', {
    roomId,
    winnerId: state.roundWinnerId,
    winnerName: state.roundWinnerName,
    gameWinnerId: state.gameWinnerId,
    gameWinnerName: state.gameWinnerName,
  });
  emitStateToRoom(io, roomId, state);
  return true;
}

function buildDeck() {
  return shuffle(DECK_TEMPLATE);
}

function startRound(io, roomId, state) {
  const playerIds = getRoundPlayers(state);
  if (playerIds.length < 2) {
    return { ok: false, error: 'Love Letter needs two players in the room' };
  }

  resetRoundState(state);
  state.started = true;
  state.round += 1;
  state.deck = buildDeck();
  state.burnCard = drawCard(state);

  playerIds.forEach((playerId) => {
    drawCardForPlayer(state, playerId);
  });

  const starter = playerIds[(state.round - 1) % playerIds.length];
  state.currentPlayer = starter;
  prepareTurn(state, starter);
  pushLog(state, `Round ${state.round} started. ${displayName(state.players[starter].name)} goes first.`);

  io.to(getRoomChannel(roomId)).emit('loveletter-round-started', {
    roomId,
    round: state.round,
    currentPlayer: state.currentPlayer,
    currentPlayerName: displayName(state.players[starter].name),
  });
  emitStateToRoom(io, roomId, state);
  return { ok: true };
}

function normalizeGuess(value) {
  const normalized = sanitizeWord(value, 24).toLowerCase();
  return Object.values(CARD_LIBRARY).find((card) => card.name.toLowerCase() === normalized || card.id === normalized)?.id || null;
}

function requireCurrentTurn(socket, state) {
  const playerId = getPlayerKey(socket);
  return playerId === state.currentPlayer;
}

function resolvePlay(io, socket, payload = {}) {
  const roomId = getSocketRoomId(socket);
  if (!roomId) {
    socket.emit('loveletter-error', { message: 'Please join the room first' });
    return;
  }

  const state = getState(roomId);
  if (!state.started || state.roundOver) {
    socket.emit('loveletter-error', { message: 'No active round' });
    return;
  }
  if (!requireCurrentTurn(socket, state)) {
    socket.emit('loveletter-error', { message: 'It is not your turn' });
    return;
  }

  const playerId = getPlayerKey(socket);
  const player = state.players[playerId];
  if (!player || player.eliminated) {
    socket.emit('loveletter-error', { message: 'You are not active in this round' });
    return;
  }
  if (player.hand.length < 2) {
    socket.emit('loveletter-error', { message: 'Your hand is not ready yet' });
    return;
  }

  const index = Number(payload.index);
  if (!Number.isInteger(index) || index < 0 || index >= player.hand.length) {
    socket.emit('loveletter-error', { message: 'Invalid card selection' });
    return;
  }

  const selectedCardId = player.hand[index];
  const otherCardId = player.hand[index === 0 ? 1 : 0];
  if (
    selectedCardId !== 'countess' &&
    player.hand.includes('countess') &&
    (otherCardId === 'king' || otherCardId === 'prince')
  ) {
    socket.emit('loveletter-error', { message: 'Countess must be played when held with King or Prince' });
    return;
  }

  player.hand.splice(index, 1);
  discardCard(player, selectedCardId);

  const actorName = displayName(player.name);
  const targetId = sanitizeWord(payload.targetId, 80) || null;
  const guessId = normalizeGuess(payload.guess);

  if (selectedCardId === 'guard') {
    const opponents = getTargetableOpponentIds(state, playerId);
    if (!opponents.length) {
      pushLog(state, `${actorName} played Guard, but no valid target was available.`);
    } else {
      if (!targetId || !opponents.includes(targetId)) {
        socket.emit('loveletter-error', { message: 'Choose a valid target' });
        player.hand.push(selectedCardId);
        player.discard.pop();
        return;
      }
      if (!guessId || guessId === 'guard') {
        socket.emit('loveletter-error', { message: 'Guard must guess a non-Guard card' });
        player.hand.push(selectedCardId);
        player.discard.pop();
        return;
      }
      const target = state.players[targetId];
      pushLog(state, `${actorName} used Guard on ${displayName(target.name)}.`);
      if (target.hand[0] === guessId) {
        eliminatePlayer(state, targetId, `Guard guessed ${CARD_LIBRARY[guessId].name}`);
      }
    }
  } else if (selectedCardId === 'priest') {
    const opponents = getTargetableOpponentIds(state, playerId);
    if (!opponents.length) {
      pushLog(state, `${actorName} played Priest, but no valid target was available.`);
    } else {
      if (!targetId || !opponents.includes(targetId)) {
        socket.emit('loveletter-error', { message: 'Choose a valid target' });
        player.hand.push(selectedCardId);
        player.discard.pop();
        return;
      }
      const target = state.players[targetId];
      const targetCard = target.hand[0];
      pushLog(state, `${actorName} looked at ${displayName(target.name)}'s hand.`);
      socket.emit('loveletter-secret', {
        roomId,
        message: `${displayName(target.name)} is holding ${CARD_LIBRARY[targetCard].name}.`,
      });
    }
  } else if (selectedCardId === 'baron') {
    const opponents = getTargetableOpponentIds(state, playerId);
    if (!opponents.length) {
      pushLog(state, `${actorName} played Baron, but no valid target was available.`);
    } else {
      if (!targetId || !opponents.includes(targetId)) {
        socket.emit('loveletter-error', { message: 'Choose a valid target' });
        player.hand.push(selectedCardId);
        player.discard.pop();
        return;
      }
      const target = state.players[targetId];
      const ownValue = player.hand.length ? CARD_LIBRARY[player.hand[0]].value : 0;
      const targetValue = target.hand.length ? CARD_LIBRARY[target.hand[0]].value : 0;
      pushLog(state, `${actorName} challenged ${displayName(target.name)} with Baron.`);
      if (ownValue > targetValue) {
        eliminatePlayer(state, targetId, 'lost the Baron comparison');
      } else if (targetValue > ownValue) {
        eliminatePlayer(state, playerId, 'lost the Baron comparison');
      } else {
        pushLog(state, 'Baron comparison tied. Nobody is eliminated.');
      }
    }
  } else if (selectedCardId === 'handmaid') {
    player.protected = true;
    pushLog(state, `${actorName} is protected until the next turn.`);
  } else if (selectedCardId === 'prince') {
    const targetableOpponents = getTargetableOpponentIds(state, playerId);
    const candidates = [playerId, ...targetableOpponents];
    const resolvedTargetId = targetId && candidates.includes(targetId) ? targetId : (candidates.length === 1 ? candidates[0] : null);
    if (!resolvedTargetId) {
      socket.emit('loveletter-error', { message: 'Choose a valid target' });
      player.hand.push(selectedCardId);
      player.discard.pop();
      return;
    }

    const target = state.players[resolvedTargetId];
    const discarded = target.hand.shift() || null;
    if (discarded) {
      discardCard(target, discarded);
    }
    pushLog(state, `${actorName} used Prince on ${displayName(target.name)}.`);

    if (discarded === 'princess') {
      eliminatePlayer(state, resolvedTargetId, 'discarded Princess');
    } else if (!target.eliminated) {
      drawCardForPlayer(state, resolvedTargetId, { allowBurn: true });
    }
  } else if (selectedCardId === 'king') {
    const opponents = getTargetableOpponentIds(state, playerId);
    if (!opponents.length) {
      pushLog(state, `${actorName} played King, but no valid target was available.`);
    } else {
      if (!targetId || !opponents.includes(targetId)) {
        socket.emit('loveletter-error', { message: 'Choose a valid target' });
        player.hand.push(selectedCardId);
        player.discard.pop();
        return;
      }
      const target = state.players[targetId];
      const ownHand = player.hand.slice();
      player.hand = target.hand.slice();
      target.hand = ownHand;
      pushLog(state, `${actorName} swapped hands with ${displayName(target.name)}.`);
    }
  } else if (selectedCardId === 'countess') {
    pushLog(state, `${actorName} discarded Countess.`);
  } else if (selectedCardId === 'princess') {
    eliminatePlayer(state, playerId, 'discarded Princess');
  }

  if (finishRoundIfNeeded(io, roomId, state)) {
    return;
  }

  const nextPlayerId = getNextActivePlayerId(state, playerId);
  state.currentPlayer = nextPlayerId;
  if (nextPlayerId) {
    prepareTurn(state, nextPlayerId);
    pushLog(state, `Turn passes to ${displayName(state.players[nextPlayerId].name)}.`);
  }
  emitStateToRoom(io, roomId, state);
}

function resetMatch(io, roomId, state, actorName) {
  state.started = false;
  state.round = 0;
  state.currentPlayer = null;
  state.roundOver = false;
  state.roundWinnerId = null;
  state.roundWinnerName = null;
  state.gameWinnerId = null;
  state.gameWinnerName = null;
  state.burnCard = null;
  state.deck = [];
  state.log = [];

  getRoundPlayers(state).forEach((playerId) => {
    const player = state.players[playerId];
    player.tokens = 0;
    player.hand = [];
    player.discard = [];
    player.eliminated = false;
    player.protected = false;
  });

  pushLog(state, `${displayName(actorName)} reset the match.`);
  io.to(getRoomChannel(roomId)).emit('loveletter-reset', { roomId });
  emitStateToRoom(io, roomId, state);
}

function registerLoveLetterHandlers(io, socket) {
  emitEmptyState(socket);

  socket.on('loveletter-set-profile', ({ roomId, nickname } = {}) => {
    const membership = syncMembership(io, socket, roomId, nickname);
    if (!membership.ok) {
      socket.emit('loveletter-error', { message: membership.error });
      emitEmptyState(socket);
      return;
    }
    emitStateToRoom(io, membership.roomId, membership.state);
  });

  socket.on('loveletter-request-state', ({ roomId, nickname } = {}) => {
    const targetRoomId = roomId || getSocketRoomId(socket);
    const membership = syncMembership(io, socket, targetRoomId, nickname);
    if (!membership.ok) {
      socket.emit('loveletter-error', { message: membership.error });
      emitEmptyState(socket);
      return;
    }
    emitStateToSocket(socket, membership.roomId, membership.state);
  });

  socket.on('loveletter-start', ({ roomId, nickname } = {}) => {
    const targetRoomId = roomId || getSocketRoomId(socket);
    const membership = syncMembership(io, socket, targetRoomId, nickname);
    if (!membership.ok) {
      socket.emit('loveletter-error', { message: membership.error });
      return;
    }
    if (membership.state.started && !membership.state.roundOver) {
      socket.emit('loveletter-error', { message: 'Round already in progress' });
      return;
    }
    const result = startRound(io, membership.roomId, membership.state);
    if (!result.ok) {
      socket.emit('loveletter-error', { message: result.error });
    }
  });

  socket.on('loveletter-next-round', ({ roomId, nickname } = {}) => {
    const targetRoomId = roomId || getSocketRoomId(socket);
    const membership = syncMembership(io, socket, targetRoomId, nickname);
    if (!membership.ok) {
      socket.emit('loveletter-error', { message: membership.error });
      return;
    }
    if (!membership.state.roundOver && membership.state.started) {
      socket.emit('loveletter-error', { message: 'Current round is still active' });
      return;
    }
    if (membership.state.gameWinnerId) {
      socket.emit('loveletter-error', { message: 'Match is already complete. Reset to play again.' });
      return;
    }
    const result = startRound(io, membership.roomId, membership.state);
    if (!result.ok) {
      socket.emit('loveletter-error', { message: result.error });
    }
  });

  socket.on('loveletter-play-card', (payload = {}) => {
    resolvePlay(io, socket, payload);
  });

  socket.on('loveletter-reset', ({ roomId, nickname } = {}) => {
    const targetRoomId = roomId || getSocketRoomId(socket);
    const membership = syncMembership(io, socket, targetRoomId, nickname);
    if (!membership.ok) {
      socket.emit('loveletter-error', { message: membership.error });
      return;
    }
    resetMatch(io, membership.roomId, membership.state, nickname || getSocketDisplayName(socket));
  });

  socket.on('create-room', () => {
    leaveLoveLetterRoom(io, socket);
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
      leaveLoveLetterRoom(io, socket);
    }
  });

  socket.on('leave-room', () => {
    leaveLoveLetterRoom(io, socket);
  });

  socket.on('disconnect', () => {
    leaveLoveLetterRoom(io, socket);
  });
}

module.exports = {
  registerLoveLetterHandlers,
};
