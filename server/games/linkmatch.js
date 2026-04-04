const LINKMATCH_PREFIX = 'linkmatch:';
const ROOM_STATES = new Map();

/** Grid size; middle two columns and two rows are CELL_VOID (-2), passable; some cells stay -1 (holes). */
const DEFAULT_COLS = 12;
const DEFAULT_ROWS = 7;

const CELL_VOID = -2;
/** Fewer pairs than full playable grid: random cells remain -1 (passable, no tile). */
const PAIR_COUNT_REDUCTION = 3;

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
      'Guest',
  );
}

function getRoomChannel(roomId) {
  return `${LINKMATCH_PREFIX}${roomId}`;
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

function createRoomState() {
  return {
    started: false,
    finished: false,
    winnerId: null,
    winnerName: null,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    tiles: [],
    roundId: 0,
    startedAt: null,
    playerNames: {},
  };
}

function getState(roomId) {
  if (!ROOM_STATES.has(roomId)) {
    ROOM_STATES.set(roomId, createRoomState());
  }
  return ROOM_STATES.get(roomId);
}

function getSocketRoomId(socket) {
  return socket.data?.linkmatchRoomId || null;
}

function cleanupRoomStateIfEmpty(io, roomId) {
  const members = io.sockets.adapter.rooms.get(getRoomChannel(roomId));
  if (!members || members.size === 0) {
    ROOM_STATES.delete(roomId);
  }
}

function buildPadded(flat, cols, rows) {
  const W = cols + 2;
  const H = rows + 2;
  const g = Array.from({ length: H }, () => Array(W).fill(-1));
  let i = 0;
  for (let r = 1; r <= rows; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      g[r][c] = flat[i];
      i += 1;
    }
  }
  return g;
}

/** Passable: cleared (-1), void (-2), holes (-1); only face-up tiles (>= 0) block. */
function canLinkPair(padded, r1, c1, r2, c2) {
  if (padded[r1][c1] !== padded[r2][c2] || padded[r1][c1] < 0) return false;
  const work = padded.map((row) => row.slice());
  work[r1][c1] = -1;
  work[r2][c2] = -1;

  function rowClear(r, cA, cB) {
    const lo = Math.min(cA, cB);
    const hi = Math.max(cA, cB);
    for (let c = lo; c <= hi; c += 1) {
      if (work[r][c] >= 0) return false;
    }
    return true;
  }

  function colClear(c, rA, rB) {
    const lo = Math.min(rA, rB);
    const hi = Math.max(rA, rB);
    for (let r = lo; r <= hi; r += 1) {
      if (work[r][c] >= 0) return false;
    }
    return true;
  }

  if (r1 === r2 && rowClear(r1, c1, c2)) return true;
  if (c1 === c2 && colClear(c1, r1, r2)) return true;

  if (work[r1][c2] < 0 && rowClear(r1, c1, c2) && colClear(c2, r1, r2)) return true;
  if (work[r2][c1] < 0 && rowClear(r2, c1, c2) && colClear(c1, r1, r2)) return true;

  const w = work[0].length;
  const h = work.length;
  for (let x = 0; x < w; x += 1) {
    if (work[r1][x] < 0 && work[r2][x] < 0) {
      if (rowClear(r1, c1, x) && colClear(x, r1, r2) && rowClear(r2, x, c2)) return true;
    }
  }
  for (let y = 0; y < h; y += 1) {
    if (work[y][c1] < 0 && work[y][c2] < 0) {
      if (colClear(c1, r1, y) && rowClear(y, c1, c2) && colClear(c2, y, r2)) return true;
    }
  }
  return false;
}

function hasAnyLinkablePair(flat, cols, rows) {
  const padded = buildPadded(flat, cols, rows);
  const n = cols * rows;
  for (let i = 0; i < n; i += 1) {
    if (flat[i] < 0) continue;
    const r1 = Math.floor(i / cols) + 1;
    const c1 = (i % cols) + 1;
    for (let j = i + 1; j < n; j += 1) {
      if (flat[j] !== flat[i] || flat[j] < 0) continue;
      const r2 = Math.floor(j / cols) + 1;
      const c2 = (j % cols) + 1;
      if (canLinkPair(padded, r1, c1, r2, c2)) return true;
    }
  }
  return false;
}

function collectPlayableIndices(cols, rows) {
  const vcx = Math.floor(cols / 2) - 1;
  const vcy0 = Math.floor(rows / 2) - 1;
  const playable = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (c === vcx || c === vcx + 1) continue;
      if (r === vcy0 || r === vcy0 + 1) continue;
      playable.push(r * cols + c);
    }
  }
  return playable;
}

function generateRegionalBoard(cols, rows) {
  const playable = collectPlayableIndices(cols, rows);
  const P = playable.length;
  if (P < 4) return null;

  const maxPairs = Math.floor(P / 2);
  const targetPairs = maxPairs > PAIR_COUNT_REDUCTION
    ? maxPairs - PAIR_COUNT_REDUCTION
    : maxPairs;
  const tileCellCount = targetPairs * 2;
  if (tileCellCount > P) return null;

  const flat = Array(cols * rows).fill(CELL_VOID);

  function fillAttempt() {
    for (let i = 0; i < flat.length; i += 1) {
      flat[i] = CELL_VOID;
    }
    const shuffledPlayable = shuffle(playable.slice());
    const holeIndices = shuffledPlayable.slice(0, P - tileCellCount);
    const tileIndices = shuffledPlayable.slice(P - tileCellCount);
    const ids = [];
    for (let i = 0; i < targetPairs; i += 1) {
      ids.push(i, i);
    }
    const shuffled = shuffle(ids);
    holeIndices.forEach((idx) => {
      flat[idx] = -1;
    });
    tileIndices.forEach((idx, k) => {
      flat[idx] = shuffled[k];
    });
  }

  for (let attempt = 0; attempt < 600; attempt += 1) {
    fillAttempt();
    if (hasAnyLinkablePair(flat, cols, rows)) {
      return { tiles: flat.slice(), cols, rows, pairCount: targetPairs };
    }
  }

  fillAttempt();
  return { tiles: flat.slice(), cols, rows, pairCount: targetPairs };
}

function buildPublicState(roomId, state) {
  return {
    roomId,
    started: !!state.started,
    finished: !!state.finished,
    winnerId: state.winnerId || null,
    winnerName: state.winnerName || null,
    cols: state.cols,
    rows: state.rows,
    tiles: Array.isArray(state.tiles) ? state.tiles.slice() : [],
    roundId: state.roundId || 0,
    startedAt: state.startedAt || null,
  };
}

function emitStateToRoom(io, roomId, state) {
  io.to(getRoomChannel(roomId)).emit('linkmatch-state', buildPublicState(roomId, state));
}

function emitEmptyState(socket) {
  socket.emit('linkmatch-state', {
    roomId: null,
    started: false,
    finished: false,
    winnerId: null,
    winnerName: null,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    tiles: [],
    roundId: 0,
    startedAt: null,
  });
}

function syncPlayerState(state, socket, nickname) {
  const playerKey = getPlayerKey(socket);
  const nextName = sanitizeWord(nickname, 24) || getSocketDisplayName(socket);
  state.playerNames[playerKey] = nextName;
  socket.data.linkmatchPlayerKey = playerKey;
  return playerKey;
}

function joinLinkMatchRoom(io, socket, roomId, nickname) {
  const previousRoomId = getSocketRoomId(socket);
  if (previousRoomId && previousRoomId !== roomId) {
    leaveLinkMatchRoom(io, socket);
  }

  const state = getState(roomId);
  socket.data.linkmatchRoomId = roomId;
  socket.join(getRoomChannel(roomId));
  syncPlayerState(state, socket, nickname);
  return state;
}

function leaveLinkMatchRoom(io, socket) {
  const roomId = getSocketRoomId(socket);
  if (!roomId) return;

  const state = ROOM_STATES.get(roomId);
  socket.leave(getRoomChannel(roomId));
  socket.data.linkmatchRoomId = null;
  socket.data.linkmatchPlayerKey = null;

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

  const state = joinLinkMatchRoom(io, socket, cleanRoomId, nickname);
  return { ok: true, roomId: cleanRoomId, state };
}

function registerLinkMatchHandlers(io, socket) {
  emitEmptyState(socket);

  socket.on('linkmatch-set-profile', ({ nickname, roomId } = {}) => {
    const membership = syncMembership(io, socket, roomId, nickname);
    if (!membership.ok) {
      socket.emit('linkmatch-error', { message: membership.error });
      return;
    }
    socket.emit('linkmatch-state', buildPublicState(membership.roomId, membership.state));
    emitStateToRoom(io, membership.roomId, membership.state);
  });

  socket.on('create-room', () => {
    leaveLinkMatchRoom(io, socket);
  });

  socket.on('join-room', (roomId) => {
    const targetRoomId = sanitizeWord(roomId, 24);
    const currentRoomId = getSocketRoomId(socket);
    if (currentRoomId && currentRoomId !== targetRoomId) {
      leaveLinkMatchRoom(io, socket);
    }
  });

  socket.on('leave-room', () => {
    leaveLinkMatchRoom(io, socket);
  });

  socket.on('linkmatch-request-state', ({ roomId, nickname } = {}) => {
    let targetRoomId = getSocketRoomId(socket);
    let state = targetRoomId ? getState(targetRoomId) : null;

    if (roomId) {
      const membership = syncMembership(io, socket, roomId, nickname);
      if (!membership.ok) {
        socket.emit('linkmatch-error', { message: membership.error });
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

    socket.emit('linkmatch-state', buildPublicState(targetRoomId, state));
  });

  socket.on('linkmatch-start', ({ nickname, roomId, cols, rows } = {}) => {
    let targetRoomId = getSocketRoomId(socket);
    let state = targetRoomId ? getState(targetRoomId) : null;

    if (roomId) {
      const membership = syncMembership(io, socket, roomId, nickname);
      if (!membership.ok) {
        socket.emit('linkmatch-error', { message: membership.error });
        return;
      }
      targetRoomId = membership.roomId;
      state = membership.state;
    }

    if (!targetRoomId || !state) {
      socket.emit('linkmatch-error', { message: 'Please join the room first' });
      return;
    }

    syncPlayerState(state, socket, nickname);

    let c = Number(cols);
    let r = Number(rows);
    if (!Number.isInteger(c) || c < 10 || c > 18) c = DEFAULT_COLS;
    if (!Number.isInteger(r) || r < 6 || r > 12) r = DEFAULT_ROWS;

    let board = generateRegionalBoard(c, r);
    if (!board) {
      board = generateRegionalBoard(DEFAULT_COLS, DEFAULT_ROWS);
    }
    if (!board) {
      socket.emit('linkmatch-error', { message: 'Could not build board' });
      return;
    }

    state.cols = board.cols;
    state.rows = board.rows;
    state.tiles = board.tiles;
    state.started = true;
    state.finished = false;
    state.winnerId = null;
    state.winnerName = null;
    state.roundId = (state.roundId || 0) + 1;
    state.startedAt = Date.now();

    const starter = displayName(state.playerNames[getPlayerKey(socket)] || nickname || getSocketDisplayName(socket));

    io.to(getRoomChannel(targetRoomId)).emit('linkmatch-round-started', {
      roomId: targetRoomId,
      cols: state.cols,
      rows: state.rows,
      tiles: state.tiles.slice(),
      roundId: state.roundId,
      startedAt: state.startedAt,
      startedBy: starter,
    });

    emitStateToRoom(io, targetRoomId, state);
  });

  socket.on('linkmatch-finish', ({ nickname, roomId } = {}) => {
    let targetRoomId = getSocketRoomId(socket) || sanitizeWord(roomId, 24);
    if (!targetRoomId || !socket.rooms.has(targetRoomId)) {
      socket.emit('linkmatch-error', { message: 'Please join the room first' });
      return;
    }

    const state = getState(targetRoomId);
    if (!state.started) {
      socket.emit('linkmatch-error', { message: 'No active round' });
      return;
    }
    if (state.finished) {
      return;
    }

    syncPlayerState(state, socket, nickname);
    const playerKey = getPlayerKey(socket);
    const winnerName = displayName(nickname || state.playerNames[playerKey] || getSocketDisplayName(socket));

    state.finished = true;
    state.winnerId = playerKey;
    state.winnerName = winnerName;

    io.to(getRoomChannel(targetRoomId)).emit('linkmatch-round-ended', {
      roomId: targetRoomId,
      roundId: state.roundId,
      winnerId: playerKey,
      winnerName,
    });

    emitStateToRoom(io, targetRoomId, state);
  });

  socket.on('linkmatch-reset', ({ nickname, roomId } = {}) => {
    let targetRoomId = getSocketRoomId(socket);
    let state = targetRoomId ? getState(targetRoomId) : null;

    if (roomId) {
      const membership = syncMembership(io, socket, roomId, nickname);
      if (!membership.ok) {
        socket.emit('linkmatch-error', { message: membership.error });
        return;
      }
      targetRoomId = membership.roomId;
      state = membership.state;
    }

    if (!targetRoomId || !state) {
      socket.emit('linkmatch-error', { message: 'Please join the room first' });
      return;
    }

    syncPlayerState(state, socket, nickname);
    state.started = false;
    state.finished = false;
    state.winnerId = null;
    state.winnerName = null;
    state.tiles = [];
    state.startedAt = null;

    io.to(getRoomChannel(targetRoomId)).emit('linkmatch-reset', {
      roomId: targetRoomId,
      endedBy: displayName(nickname || getSocketDisplayName(socket)),
    });

    emitStateToRoom(io, targetRoomId, state);
  });

  socket.on('disconnect', () => {
    leaveLinkMatchRoom(io, socket);
  });
}

module.exports = {
  registerLinkMatchHandlers,
};
