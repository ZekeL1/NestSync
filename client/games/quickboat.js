function mountQuickBoatGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    [
        'cleanupQuickBoatGame',
        'cleanupLoveLetterGame',
        'cleanupPictionaryGame',
        'cleanupSudokuGame',
        'cleanupLinkMatchGame',
    ].forEach((key) => {
        if (typeof window[key] === 'function') {
            window[key]();
        }
    });

    const CATEGORY_HELP = {
        ones: 'Sum of 1s',
        twos: 'Sum of 2s',
        threes: 'Sum of 3s',
        fours: 'Sum of 4s',
        fives: 'Sum of 5s',
        sixes: 'Sum of 6s',
        choice: 'Sum of all dice',
        fourkind: 'Four same faces scores face × 4',
        fullhouse: '3 + 2 scores sum of dice',
        smallstraight: '1-2-3-4-5 scores 15',
        largestraight: '2-3-4-5-6 scores 30',
        yacht: 'Five of a kind scores 50',
    };

    let state = {
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
        categories: [],
        players: [],
    };

    gamesRoot.innerHTML = `
      <div id="quickboat-shell" class="glass-panel boardgame-shell">
        <div class="boardgame-topbar">
          <div>
            <div class="game-title"><i class="fa-solid fa-dice-five"></i> Quick Boat</div>
            <div class="boardgame-empty">Two-player Yacht duel. Fill every category and finish with the higher total.</div>
          </div>
          <div class="boardgame-actions">
            <button id="quickboat-start" class="btn-primary" type="button"><i class="fa-solid fa-play"></i> Start</button>
            <button id="quickboat-roll" class="btn-primary" type="button"><i class="fa-solid fa-dice"></i> Roll</button>
            <button id="quickboat-reset" class="btn-ghost" type="button"><i class="fa-solid fa-rotate-left"></i> Reset</button>
            <button id="quickboat-back" class="btn-icon" title="Back to Arcade" type="button"><i class="fa-solid fa-arrow-left"></i></button>
          </div>
        </div>

        <div class="boardgame-summary-grid">
          <div class="glass-panel boardgame-panel">
            <div class="boardgame-meta">
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Room</span>
                <span id="quickboat-room" class="boardgame-stat-value">-</span>
              </div>
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Status</span>
                <span id="quickboat-status" class="boardgame-stat-value">Waiting</span>
              </div>
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Round</span>
                <span id="quickboat-round" class="boardgame-stat-value">1</span>
              </div>
              <div class="boardgame-stat">
                <span class="boardgame-stat-label">Rolls Left</span>
                <span id="quickboat-rolls-left" class="boardgame-stat-value">3</span>
              </div>
            </div>
          </div>

          <div class="glass-panel boardgame-panel">
            <h3>Dice Tray</h3>
            <div id="quickboat-dice" class="quickboat-dice"></div>
            <p id="quickboat-hint" class="boardgame-empty" style="margin:12px 0 0;">Roll the dice, hold what you want to keep, then score a category.</p>
          </div>
        </div>

        <div class="glass-panel boardgame-panel">
          <h3>Players</h3>
          <div id="quickboat-players" class="boardgame-player-grid"></div>
        </div>

        <div class="glass-panel boardgame-panel">
          <h3>Scoreboard</h3>
          <table class="quickboat-scoreboard">
            <thead>
              <tr>
                <th>Category</th>
                <th id="quickboat-player-a">Player A</th>
                <th id="quickboat-player-b">Player B</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody id="quickboat-scorebody"></tbody>
          </table>
        </div>

        <div class="glass-panel boardgame-panel">
          <h3>Action Log</h3>
          <div id="quickboat-log" class="boardgame-log"></div>
        </div>
      </div>
    `;

    const startBtn = document.getElementById('quickboat-start');
    const rollBtn = document.getElementById('quickboat-roll');
    const resetBtn = document.getElementById('quickboat-reset');
    const backBtn = document.getElementById('quickboat-back');
    const roomEl = document.getElementById('quickboat-room');
    const statusEl = document.getElementById('quickboat-status');
    const roundEl = document.getElementById('quickboat-round');
    const rollsLeftEl = document.getElementById('quickboat-rolls-left');
    const hintEl = document.getElementById('quickboat-hint');
    const diceEl = document.getElementById('quickboat-dice');
    const playersEl = document.getElementById('quickboat-players');
    const scorebodyEl = document.getElementById('quickboat-scorebody');
    const logEl = document.getElementById('quickboat-log');
    const playerAHeadingEl = document.getElementById('quickboat-player-a');
    const playerBHeadingEl = document.getElementById('quickboat-player-b');

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
            syncProfile();
            requestState();
            render();
        },
        'room-joined': () => {
            syncProfile();
            requestState();
            render();
        },
        'room-left': () => {
            state = {
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
                categories: [],
                players: [],
            };
            render();
        },
        'quickboat-state': (nextState) => {
            state = nextState || state;
            render();
        },
        'quickboat-round-started': ({ currentPlayerName }) => {
            showToast(`${currentPlayerName || 'Someone'} starts Quick Boat`);
        },
        'quickboat-game-ended': ({ winnerName }) => {
            showToast(winnerName ? `${winnerName} wins Quick Boat` : 'Quick Boat ended in a tie');
        },
        'quickboat-reset': () => {
            showToast('Quick Boat reset');
        },
        'quickboat-error': ({ message }) => {
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
        if (window.cleanupQuickBoatGame === cleanup) {
            delete window.cleanupQuickBoatGame;
        }
    }

    window.cleanupQuickBoatGame = cleanup;

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

    function syncProfile() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) return false;
        socket.emit('quickboat-set-profile', { roomId, nickname: getDisplayName() });
        return true;
    }

    function requestState() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) return;
        socket.emit('quickboat-request-state', { roomId, nickname: getDisplayName() });
    }

    function getPlayers() {
        const players = state.players || [];
        return [players[0] || null, players[1] || null];
    }

    function isMyTurn() {
        return state.currentPlayer && state.currentPlayer === getMyPlayerId();
    }

    function renderPlayers() {
        const currentId = state.currentPlayer;
        if (!state.players || !state.players.length) {
            playersEl.innerHTML = '<div class="boardgame-empty">Waiting for two players in the room.</div>';
            return;
        }

        playersEl.innerHTML = state.players.map((player) => `
          <div class="boardgame-player-card${player.id === currentId ? ' is-current' : ''}${player.id === getMyPlayerId() ? ' is-me' : ''}">
            <div class="loveletter-card-title">
              <span>${player.name}</span>
              <span>${player.total}</span>
            </div>
            <div class="boardgame-badges">
              ${player.id === currentId ? '<span class="boardgame-badge is-hot">Current turn</span>' : ''}
              <span class="boardgame-badge">${player.filledCount}/${(state.categories || []).length || 0} filled</span>
            </div>
          </div>
        `).join('');
    }

    function renderDice() {
        diceEl.innerHTML = '';
        const joined = !!getJoinedRoomId();
        const interactive = joined && socket.connected && isMyTurn() && state.started && !state.gameOver;

        (state.dice || []).forEach((value, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `quickboat-die${state.holds && state.holds[index] ? ' is-held' : ''}`;
            button.disabled = !interactive || !state.hasRolled;
            button.textContent = value > 0 ? String(value) : '•';
            button.title = value > 0 ? 'Toggle hold' : 'Roll to start';
            button.addEventListener('click', () => {
                socket.emit('quickboat-toggle-hold', { index });
            });
            diceEl.appendChild(button);
        });
    }

    function renderScoreboard() {
        const [playerA, playerB] = getPlayers();
        playerAHeadingEl.textContent = playerA ? playerA.name : 'Player A';
        playerBHeadingEl.textContent = playerB ? playerB.name : 'Player B';

        const myId = getMyPlayerId();
        const canScore = socket.connected && isMyTurn() && state.started && !state.gameOver && state.hasRolled;

        scorebodyEl.innerHTML = (state.categories || []).map((category) => {
            const valueA = playerA && playerA.scorecard ? playerA.scorecard[category.id] : null;
            const valueB = playerB && playerB.scorecard ? playerB.scorecard[category.id] : null;

            function renderCell(player, value) {
                if (!player) return '-';
                if (Number.isFinite(value)) return String(value);
                if (player.id === myId && canScore) {
                    return `<button class="quickboat-score-btn" data-score-category="${category.id}" type="button">Score</button>`;
                }
                return '<span class="boardgame-empty">-</span>';
            }

            return `
              <tr>
                <td>${category.name}</td>
                <td>${renderCell(playerA, valueA)}</td>
                <td>${renderCell(playerB, valueB)}</td>
                <td>${CATEGORY_HELP[category.id] || ''}</td>
              </tr>
            `;
        }).join('') + `
          <tr class="quickboat-total-row">
            <td>Total</td>
            <td>${playerA ? playerA.total : '-'}</td>
            <td>${playerB ? playerB.total : '-'}</td>
            <td></td>
          </tr>
        `;

        scorebodyEl.querySelectorAll('[data-score-category]').forEach((button) => {
            button.addEventListener('click', () => {
                const categoryId = button.getAttribute('data-score-category');
                socket.emit('quickboat-score', { categoryId });
            });
        });
    }

    function renderLog() {
        const lines = state.log && state.log.length ? state.log : ['Quick Boat actions will appear here.'];
        logEl.innerHTML = lines.map((line) => `<div class="boardgame-log-line">${line}</div>`).join('');
    }

    function renderMeta() {
        const joined = !!getJoinedRoomId();
        roomEl.textContent = getJoinedRoomId() || '-';
        roundEl.textContent = String(state.round || 1);
        rollsLeftEl.textContent = String(state.rollsLeft || 0);

        if (!socket.connected) {
            statusEl.textContent = 'Offline';
        } else if (state.gameOver) {
            statusEl.textContent = state.winnerName ? `${state.winnerName} wins` : 'Tie game';
        } else if (state.started) {
            const currentName = (state.players || []).find((player) => player.id === state.currentPlayer)?.name || 'Unknown';
            statusEl.textContent = `${currentName} turn`;
        } else {
            statusEl.textContent = 'Waiting';
        }

        startBtn.disabled = !joined || !socket.connected || (state.started && !state.gameOver);
        resetBtn.disabled = !joined || !socket.connected;
        rollBtn.disabled = !joined || !socket.connected || !state.started || state.gameOver || !isMyTurn() || state.rollsLeft <= 0;

        if (!joined) {
            hintEl.textContent = 'Join a room first.';
        } else if (!state.players || state.players.length < 2) {
            hintEl.textContent = 'Need two players in the room to start.';
        } else if (state.gameOver) {
            hintEl.textContent = 'Game over. Reset to play again.';
        } else if (!state.started) {
            hintEl.textContent = 'Press Start to begin a new Quick Boat match.';
        } else if (isMyTurn()) {
            hintEl.textContent = state.hasRolled
                ? 'Hold any dice you want to keep, roll again, or score a category.'
                : 'Your turn. Roll the dice to begin.';
        } else {
            const currentName = (state.players || []).find((player) => player.id === state.currentPlayer)?.name || 'Your opponent';
            hintEl.textContent = `${currentName} is taking their turn.`;
        }
    }

    function render() {
        renderMeta();
        renderPlayers();
        renderDice();
        renderScoreboard();
        renderLog();
    }

    startBtn.addEventListener('click', () => {
        const roomId = getJoinedRoomId();
        if (!roomId) {
            showToast('Join a room first');
            return;
        }
        syncProfile();
        socket.emit('quickboat-start', { roomId, nickname: getDisplayName() });
    });

    rollBtn.addEventListener('click', () => {
        if (!isMyTurn()) {
            showToast('It is not your turn');
            return;
        }
        socket.emit('quickboat-roll');
    });

    resetBtn.addEventListener('click', () => {
        const roomId = getJoinedRoomId();
        if (!roomId) {
            showToast('Join a room first');
            return;
        }
        syncProfile();
        socket.emit('quickboat-reset', { roomId, nickname: getDisplayName() });
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

window.mountQuickBoatGame = mountQuickBoatGame;
