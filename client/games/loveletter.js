function mountLoveLetterGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    [
        'cleanupLoveLetterGame',
        'cleanupQuickBoatGame',
        'cleanupPictionaryGame',
        'cleanupSudokuGame',
        'cleanupLinkMatchGame',
    ].forEach((key) => {
        if (typeof window[key] === 'function') {
            window[key]();
        }
    });

    const CARD_RULES = {
        guard: 'Guess the opponent hand. A correct non-Guard guess eliminates them.',
        priest: 'Privately view the opponent hand.',
        baron: 'Compare hands. Lower value is eliminated.',
        handmaid: 'You cannot be targeted until your next turn.',
        prince: 'Choose a player to discard and redraw.',
        king: 'Swap hands with the opponent.',
        countess: 'Must be played if you also hold King or Prince.',
        princess: 'If you discard this card, you are out.',
    };

    let state = {
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
        targetTokens: 3,
        players: [],
        log: [],
        myHand: [],
    };
    let latestSecret = '';
    let activeRoomId = getJoinedRoomId();

    gamesRoot.innerHTML = `
      <div id="loveletter-shell" class="glass-panel boardgame-shell">
        <div class="boardgame-topbar">
          <div>
            <div class="game-title"><i class="fa-solid fa-envelope-open-text"></i> Love Letter</div>
            <div class="boardgame-empty">Two-player round duel. First to <span id="loveletter-target-tokens">3</span> tokens wins.</div>
          </div>
          <div class="boardgame-actions">
            <button id="loveletter-start" class="btn-primary" type="button"><i class="fa-solid fa-play"></i> Start</button>
            <button id="loveletter-next" class="btn-primary" type="button"><i class="fa-solid fa-forward"></i> Next Round</button>
            <button id="loveletter-reset" class="btn-ghost" type="button"><i class="fa-solid fa-rotate-left"></i> Reset</button>
            <button id="loveletter-back" class="btn-icon" title="Back to Arcade" type="button"><i class="fa-solid fa-arrow-left"></i></button>
          </div>
        </div>

        <div class="boardgame-summary-grid">
          <div class="glass-panel boardgame-panel">
            <div class="boardgame-meta">
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Room</span>
                <span id="loveletter-room" class="boardgame-stat-value">-</span>
              </div>
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Status</span>
                <span id="loveletter-status" class="boardgame-stat-value">Waiting</span>
              </div>
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Deck</span>
                <span id="loveletter-deck" class="boardgame-stat-value">0</span>
              </div>
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Turn</span>
                <span id="loveletter-turn" class="boardgame-stat-value">-</span>
              </div>
            </div>
          </div>

          <div class="glass-panel boardgame-panel">
            <h3>Action Controls</h3>
            <div class="loveletter-controls">
              <label>
                <span class="boardgame-stat-label">Target</span>
                <select id="loveletter-target" class="loveletter-select"></select>
              </label>
              <label>
                <span class="boardgame-stat-label">Guard Guess</span>
                <select id="loveletter-guess" class="loveletter-select"></select>
              </label>
            </div>
            <p id="loveletter-hint" class="boardgame-empty" style="margin:12px 0 0;">Join a room and start a round to play.</p>
          </div>
        </div>

        <div class="glass-panel boardgame-panel">
          <h3>Players</h3>
          <div id="loveletter-players" class="boardgame-player-grid"></div>
        </div>

        <div class="glass-panel boardgame-panel">
          <h3>Your Hand</h3>
          <div id="loveletter-hand" class="loveletter-hand"></div>
        </div>

        <div id="loveletter-secret" class="loveletter-secret" hidden></div>

        <div class="boardgame-summary-grid">
          <div class="glass-panel boardgame-panel">
            <h3>Round Log</h3>
            <div id="loveletter-log" class="boardgame-log"></div>
          </div>
          <div class="glass-panel boardgame-panel">
            <h3>Card Guide</h3>
            <div id="loveletter-guide" class="boardgame-log"></div>
          </div>
        </div>
      </div>
    `;

    const startBtn = document.getElementById('loveletter-start');
    const nextBtn = document.getElementById('loveletter-next');
    const resetBtn = document.getElementById('loveletter-reset');
    const backBtn = document.getElementById('loveletter-back');
    const roomEl = document.getElementById('loveletter-room');
    const statusEl = document.getElementById('loveletter-status');
    const deckEl = document.getElementById('loveletter-deck');
    const turnEl = document.getElementById('loveletter-turn');
    const targetTokensEl = document.getElementById('loveletter-target-tokens');
    const targetSelect = document.getElementById('loveletter-target');
    const guessSelect = document.getElementById('loveletter-guess');
    const hintEl = document.getElementById('loveletter-hint');
    const playersEl = document.getElementById('loveletter-players');
    const handEl = document.getElementById('loveletter-hand');
    const secretEl = document.getElementById('loveletter-secret');
    const logEl = document.getElementById('loveletter-log');
    const guideEl = document.getElementById('loveletter-guide');

    const socketHandlers = {
        connect: () => {
            syncProfile();
            requestState();
            render();
        },
        disconnect: () => {
            render();
        },
        'room-created': () => {
            activeRoomId = getJoinedRoomId();
            latestSecret = '';
            syncProfile();
            requestState();
            render();
        },
        'room-joined': () => {
            activeRoomId = getJoinedRoomId();
            latestSecret = '';
            syncProfile();
            requestState();
            render();
        },
        'room-left': () => {
            activeRoomId = null;
            latestSecret = '';
            state = {
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
                targetTokens: 3,
                players: [],
                log: [],
                myHand: [],
            };
            render();
        },
        'loveletter-state': (nextState) => {
            state = nextState || state;
            render();
        },
        'loveletter-round-started': ({ currentPlayerName, round }) => {
            latestSecret = '';
            showToast(`${currentPlayerName || 'Someone'} starts Love Letter round ${round || ''}`.trim());
        },
        'loveletter-round-ended': ({ winnerName, gameWinnerName }) => {
            if (gameWinnerName) {
                showToast(`${gameWinnerName} wins the Love Letter match`);
            } else if (winnerName) {
                showToast(`${winnerName} wins the round`);
            } else {
                showToast('Round ended in a tie');
            }
        },
        'loveletter-reset': () => {
            latestSecret = '';
            showToast('Love Letter reset');
        },
        'loveletter-secret': ({ message }) => {
            latestSecret = message || '';
            if (latestSecret) showToast(latestSecret);
            renderSecret();
        },
        'loveletter-error': ({ message }) => {
            if (message) showToast(message);
        },
    };

    Object.entries(socketHandlers).forEach(([eventName, handler]) => {
        socket.on(eventName, handler);
    });

    function cleanup() {
        if (socket && typeof socket.off === 'function') {
            Object.entries(socketHandlers).forEach(([eventName, handler]) => {
                socket.off(eventName, handler);
            });
        }
        if (window.cleanupLoveLetterGame === cleanup) {
            delete window.cleanupLoveLetterGame;
        }
    }

    window.cleanupLoveLetterGame = cleanup;

    function getDisplayName() {
        const user = getCurrentUser ? getCurrentUser() : null;
        return user ? (user.nickname || user.username || 'Guest') : 'Guest';
    }

    function getJoinedRoomId() {
        const roomId = getCurrentRoomId ? getCurrentRoomId() : null;
        return roomId ? String(roomId).trim() : null;
    }

    function getMyPlayerId() {
        const user = getCurrentUser ? getCurrentUser() : null;
        return user && user.id ? String(user.id) : (socket ? socket.id : null);
    }

    function getMyEntry() {
        const myId = getMyPlayerId();
        return (state.players || []).find((player) => player.id === myId) || null;
    }

    function getPlayerName(playerId) {
        const player = (state.players || []).find((item) => item.id === playerId);
        return player ? player.name : '-';
    }

    function syncProfile() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) return false;
        socket.emit('loveletter-set-profile', { roomId, nickname: getDisplayName() });
        return true;
    }

    function requestState() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) return;
        socket.emit('loveletter-request-state', { roomId, nickname: getDisplayName() });
    }

    function buildTargetOptions() {
        const myId = getMyPlayerId();
        const opponents = (state.players || []).filter((player) => player.id !== myId && !player.eliminated);
        return [
            { value: '', label: 'No target selected' },
            { value: myId || '', label: 'Yourself' },
            ...opponents.map((player) => ({
                value: player.id,
                label: player.protected ? `${player.name} (protected)` : player.name,
            })),
        ];
    }

    function renderTargetOptions() {
        const previous = targetSelect.value;
        const options = buildTargetOptions();
        targetSelect.innerHTML = options
            .filter((option, index) => index === 0 || option.value)
            .map((option) => `<option value="${option.value}">${option.label}</option>`)
            .join('');
        targetSelect.value = options.some((option) => option.value === previous) ? previous : '';
    }

    function renderGuessOptions() {
        const previous = guessSelect.value;
        const options = Object.values(CARD_RULES)
            .map((_, index) => index);
        const guardGuesses = [
            { value: '', label: 'Choose a card' },
            { value: 'priest', label: 'Priest' },
            { value: 'baron', label: 'Baron' },
            { value: 'handmaid', label: 'Handmaid' },
            { value: 'prince', label: 'Prince' },
            { value: 'king', label: 'King' },
            { value: 'countess', label: 'Countess' },
            { value: 'princess', label: 'Princess' },
        ];
        guessSelect.innerHTML = guardGuesses.map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
        guessSelect.value = guardGuesses.some((option) => option.value === previous) ? previous : '';
        return options;
    }

    function canPlayCard(card) {
        const myEntry = getMyEntry();
        if (!myEntry || myEntry.eliminated) return false;
        if (!socket.connected) return false;
        if (state.roundOver || state.gameWinnerId) return false;
        if (state.currentPlayer !== getMyPlayerId()) return false;
        if (!card) return false;
        return true;
    }

    function playCard(index, card) {
        if (!canPlayCard(card)) return;
        const payload = { index };
        if (card.id === 'guard' || card.id === 'priest' || card.id === 'baron' || card.id === 'king' || card.id === 'prince') {
            payload.targetId = targetSelect.value || undefined;
        }
        if (card.id === 'guard') {
            payload.guess = guessSelect.value || undefined;
        }
        socket.emit('loveletter-play-card', payload);
    }

    function renderPlayers() {
        if (!state.players || !state.players.length) {
            playersEl.innerHTML = '<div class="boardgame-empty">Waiting for two players in the room.</div>';
            return;
        }

        playersEl.innerHTML = state.players.map((player) => `
          <div class="boardgame-player-card${player.isCurrent ? ' is-current' : ''}${player.isMe ? ' is-me' : ''}">
            <div class="loveletter-card-title">
              <span>${player.name}</span>
              <span>${player.tokens}/${state.targetTokens}</span>
            </div>
            <div class="boardgame-badges">
              ${player.isCurrent ? '<span class="boardgame-badge is-hot">Current turn</span>' : ''}
              ${player.protected ? '<span class="boardgame-badge is-cool">Protected</span>' : ''}
              ${player.eliminated ? '<span class="boardgame-badge">Eliminated</span>' : ''}
              <span class="boardgame-badge">Hand ${player.handCount}</span>
            </div>
            <div class="loveletter-discard">
              ${player.discard && player.discard.length
                ? player.discard.map((card) => `<span class="loveletter-mini-card">${card.name}</span>`).join('')
                : '<span class="boardgame-empty">No discard yet</span>'}
            </div>
          </div>
        `).join('');
    }

    function renderHand() {
        if (!state.myHand || !state.myHand.length) {
            handEl.innerHTML = '<div class="boardgame-empty">Your hand will appear here when a round starts.</div>';
            return;
        }

        handEl.innerHTML = '';
        state.myHand.forEach((card, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'loveletter-card';
            button.disabled = !canPlayCard(card);
            button.innerHTML = `
              <div class="loveletter-card-title">
                <span>${card.name}</span>
                <span>Value ${card.value}</span>
              </div>
              <div class="loveletter-card-copy">${CARD_RULES[card.id] || 'Play this card.'}</div>
            `;
            button.addEventListener('click', () => playCard(index, card));
            handEl.appendChild(button);
        });
    }

    function renderLog() {
        const lines = state.log && state.log.length ? state.log : ['Round events will appear here.'];
        logEl.innerHTML = lines.map((line) => `<div class="boardgame-log-line">${line}</div>`).join('');
    }

    function renderGuide() {
        guideEl.innerHTML = Object.entries(CARD_RULES)
            .map(([cardId, copy]) => `<div class="boardgame-log-line"><strong>${cardId[0].toUpperCase()}${cardId.slice(1)}</strong><br>${copy}</div>`)
            .join('');
    }

    function renderSecret() {
        if (!latestSecret) {
            secretEl.hidden = true;
            secretEl.textContent = '';
            return;
        }
        secretEl.hidden = false;
        secretEl.textContent = latestSecret;
    }

    function renderMeta() {
        roomEl.textContent = getJoinedRoomId() || '-';
        deckEl.textContent = String(state.deckCount || 0);
        turnEl.textContent = state.currentPlayer ? getPlayerName(state.currentPlayer) : '-';
        targetTokensEl.textContent = String(state.targetTokens || 3);

        if (!socket.connected) {
            statusEl.textContent = 'Offline';
        } else if (state.gameWinnerName) {
            statusEl.textContent = `${state.gameWinnerName} won the match`;
        } else if (state.roundOver) {
            statusEl.textContent = state.roundWinnerName ? `${state.roundWinnerName} won the round` : 'Round tied';
        } else if (state.started) {
            statusEl.textContent = `Round ${state.round || 1}`;
        } else {
            statusEl.textContent = 'Waiting';
        }

        const myId = getMyPlayerId();
        const isMyTurn = state.currentPlayer && state.currentPlayer === myId && !state.roundOver;
        const joined = !!getJoinedRoomId();
        startBtn.disabled = !joined || !socket.connected || (state.started && !state.roundOver);
        nextBtn.disabled = !joined || !socket.connected || !state.roundOver || !!state.gameWinnerId;
        resetBtn.disabled = !joined || !socket.connected;

        if (!joined) {
            hintEl.textContent = 'Join a room first.';
        } else if (!state.players || state.players.length < 2) {
            hintEl.textContent = 'Need two players in the room to start.';
        } else if (state.gameWinnerName) {
            hintEl.textContent = 'Match finished. Use Reset to start over.';
        } else if (state.roundOver) {
            hintEl.textContent = 'Round over. Start the next round when both players are ready.';
        } else if (isMyTurn) {
            hintEl.textContent = 'Your turn. Choose a card from your hand to play.';
        } else if (state.started) {
            hintEl.textContent = `${getPlayerName(state.currentPlayer)} is deciding.`;
        } else {
            hintEl.textContent = 'Press Start when both players are ready.';
        }
    }

    function render() {
        renderTargetOptions();
        renderGuessOptions();
        renderMeta();
        renderPlayers();
        renderHand();
        renderLog();
        renderGuide();
        renderSecret();
    }

    startBtn.addEventListener('click', () => {
        const roomId = getJoinedRoomId();
        if (!roomId) {
            showToast('Join a room first');
            return;
        }
        syncProfile();
        socket.emit('loveletter-start', { roomId, nickname: getDisplayName() });
    });

    nextBtn.addEventListener('click', () => {
        const roomId = getJoinedRoomId();
        if (!roomId) {
            showToast('Join a room first');
            return;
        }
        syncProfile();
        socket.emit('loveletter-next-round', { roomId, nickname: getDisplayName() });
    });

    resetBtn.addEventListener('click', () => {
        const roomId = getJoinedRoomId();
        if (!roomId) {
            showToast('Join a room first');
            return;
        }
        latestSecret = '';
        syncProfile();
        socket.emit('loveletter-reset', { roomId, nickname: getDisplayName() });
    });

    backBtn.addEventListener('click', () => {
        cleanup();
        if (typeof window.initArcadeGames === 'function') {
            window.initArcadeGames({ socket, showToast, getCurrentUser, getCurrentRoomId });
        }
    });

    syncProfile();
    requestState();
    render();
}

window.mountLoveLetterGame = mountLoveLetterGame;
