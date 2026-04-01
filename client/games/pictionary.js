function mountPictionaryGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    gamesRoot.innerHTML = `
      <div class="glass-panel game-shell game-shell--pictionary">
        <div class="game-header">
          <div class="game-header-main">
            <div class="game-title">
              <i class="fa-solid fa-paintbrush"></i> Pictionary
            </div>
            <div class="status-pill offline" id="pict-status">Offline</div>
          </div>

          <div class="game-header-actions">
            <button id="pict-next" class="btn-primary game-action-primary" type="button"><i class="fa-solid fa-forward"></i> Next Round</button>
            <button id="pict-end" class="btn-icon" title="End Round" type="button">
              <i class="fa-solid fa-flag-checkered"></i>
            </button>
            <button id="pict-back" class="btn-icon" title="Back to Arcade" type="button">
              <i class="fa-solid fa-arrow-left"></i>
            </button>
          </div>
        </div>

        <div id="pict-waiting" class="glass-panel game-wait-screen">
          <div class="game-wait-card">
            <div class="game-wait-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
            <div class="game-wait-title">Waiting for round to start...</div>
            <div id="pict-wait-hint" class="game-wait-copy">Click Start to begin.</div>
            <div class="game-wait-actions">
              <button id="pict-wait-start" class="btn-primary game-action-primary game-action-wide" type="button"><i class="fa-solid fa-play"></i> Start</button>
            </div>
            <div class="glass-panel game-sidebar-panel game-wait-leaderboard">
              <div class="game-panel-header">
                <div class="game-panel-title">Leaderboard</div>
                <button id="pict-reset-scores" class="btn-icon" title="Reset Scores" type="button">
                  <i class="fa-solid fa-rotate-right"></i>
                </button>
              </div>
              <div id="pict-wait-scores" class="game-scoreboard">-</div>
            </div>
          </div>
        </div>

        <div id="pict-live-area" class="game-live-layout" style="display:none;">
          <div class="game-stage-column">
            <div class="game-stage-panel">
              <div class="glass-panel game-stage-toolbar">
                <div class="game-stage-label">
                  <i class="fa-solid fa-pen-ruler"></i>
                  <span>Drawing Canvas</span>
                </div>
                <div class="game-stage-tools">
                  <button id="pict-tool-brush" class="btn-icon" title="Brush" type="button"><i class="fa-solid fa-paintbrush"></i></button>
                  <button id="pict-tool-eraser" class="btn-icon" title="Eraser" type="button"><i class="fa-solid fa-eraser"></i></button>
                  <button id="pict-tool-clear" class="btn-icon" title="Clear Canvas" type="button"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </div>

              <div class="game-stage-frame pict-stage-frame">
                <canvas id="pict-canvas" width="900" height="560" class="pict-canvas"></canvas>
              </div>
            </div>
          </div>

          <div class="game-side-column">
            <div class="glass-panel game-sidebar-panel">
              <div class="game-meta-row">
                <span class="game-meta-label">Drawer</span>
                <span id="pict-drawer">-</span>
              </div>
              <div class="game-meta-row">
                <span class="game-meta-label">Your word</span>
                <span id="pict-word">-</span>
              </div>
              <div class="game-panel-block">
                <span class="game-meta-label game-meta-label-block">Leaderboard</span>
                <div id="pict-scores" class="game-scoreboard">-</div>
              </div>
            </div>

            <div class="chat-wrapper pict-chat-panel">
              <div class="chat-messages" id="pict-log">
                <div class="chat-msg system"><span>Game ready. Waiting for start.</span></div>
              </div>
              <div class="chat-input-area">
                <input type="text" id="pict-guess" placeholder="Type your guess...">
                <button id="pict-guess-btn" class="btn-primary pict-guess-btn" type="button"><i class="fa-solid fa-paper-plane"></i></button>
              </div>
            </div>
          </div>
        </div>

        <div id="pict-word-modal" class="game-modal">
          <div class="glass-panel game-modal-card">
            <div class="game-modal-title">Enter answer word</div>
            <input id="pict-modal-word" class="input-room game-modal-input" maxlength="40" placeholder="e.g. apple">
            <div class="game-modal-actions">
              <button id="pict-modal-cancel" class="btn-icon" title="Cancel" type="button"><i class="fa-solid fa-xmark"></i></button>
              <button id="pict-modal-confirm" class="btn-primary" type="button"><i class="fa-solid fa-check"></i> Confirm</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const statusEl = document.getElementById('pict-status');
    const waitStartBtn = document.getElementById('pict-wait-start');
    const waitHintEl = document.getElementById('pict-wait-hint');
    const nextBtn = document.getElementById('pict-next');
    const endBtn = document.getElementById('pict-end');
    const backBtn = document.getElementById('pict-back');
    const resetScoresBtn = document.getElementById('pict-reset-scores');

    const waitingEl = document.getElementById('pict-waiting');
    const liveAreaEl = document.getElementById('pict-live-area');

    const drawerEl = document.getElementById('pict-drawer');
    const wordEl = document.getElementById('pict-word');
    const scoresEl = document.getElementById('pict-scores');
    const waitScoresEl = document.getElementById('pict-wait-scores');

    const logEl = document.getElementById('pict-log');
    const guessEl = document.getElementById('pict-guess');
    const guessBtn = document.getElementById('pict-guess-btn');

    const wordModalEl = document.getElementById('pict-word-modal');
    const modalWordEl = document.getElementById('pict-modal-word');
    const modalCancelBtn = document.getElementById('pict-modal-cancel');
    const modalConfirmBtn = document.getElementById('pict-modal-confirm');
    const brushToolBtn = document.getElementById('pict-tool-brush');
    const eraserToolBtn = document.getElementById('pict-tool-eraser');
    const clearToolBtn = document.getElementById('pict-tool-clear');

    const canvas = document.getElementById('pict-canvas');
    const brushCursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#111' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 2l4 4-8.5 8.5-4-4L18 2z'/><path d='M8 12l4 4'/><path d='M2 22c2.5-.2 4.4-.9 5.8-2.2C9.2 18.4 10 16.5 10 14'/></svg>`;
    const brushCursor = `url("data:image/svg+xml,${encodeURIComponent(brushCursorSvg)}") 2 24, crosshair`;
    const eraserCursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#111' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 20H7L3 16l9-9 8 8-5 5z'/><path d='M14 8l6 6'/></svg>`;
    const eraserCursor = `url("data:image/svg+xml,${encodeURIComponent(eraserCursorSvg)}") 4 22, crosshair`;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    let drawerId = null;
    let drawerName = null;
    let myWord = null;
    let leaderboard = [];
    let roundActive = false;
    let currentTool = 'brush';
    let isDrawing = false;
    let last = null;
    let activeRoomId = getJoinedRoomId();

    function appendGameMsg(text, type = 'system') {
        const div = document.createElement('div');
        div.className = `chat-msg ${type}`;
        const span = document.createElement('span');
        span.textContent = text;
        div.appendChild(span);
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function resetRoundLog() {
        logEl.innerHTML = '';
    }

    function resetLocalRoomView() {
        drawerId = null;
        drawerName = null;
        myWord = null;
        leaderboard = [];
        currentTool = 'brush';
        guessEl.value = '';
        closeWordModal();
        clearBoard();
        setRoundUI(false);

        resetRoundLog();
        appendGameMsg('Game ready. Waiting for start.', 'system');
        updateStatus();
    }

    function renderLeaderboard(items) {
        const targets = [scoresEl, waitScoresEl];

        if (!Array.isArray(items) || !items.length) {
            targets.forEach((target) => { target.textContent = '-'; });
            return;
        }

        targets.forEach((target) => {
            target.textContent = '';

            items.forEach((item, index) => {
                const name = item.id === socket.id ? 'You' : (item.name || 'Guest');
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.gap = '8px';
                row.style.padding = '2px 0';

                const left = document.createElement('span');
                left.textContent = `#${index + 1} ${name}`;

                const right = document.createElement('strong');
                right.textContent = String(item.score || 0);

                row.appendChild(left);
                row.appendChild(right);
                target.appendChild(row);
            });
        });
    }

    function clearBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function setRoundUI(active) {
        roundActive = !!active;
        waitingEl.style.display = roundActive ? 'none' : 'flex';
        liveAreaEl.style.display = roundActive ? 'flex' : 'none';

        nextBtn.style.display = roundActive ? 'flex' : 'none';
        endBtn.style.display = roundActive ? 'flex' : 'none';

        if (!roundActive) {
            myWord = null;
            currentTool = 'brush';
            wordEl.innerText = '-';
            stopDrawing();
        }
    }

    function updateStatus() {
        const online = !!(socket && socket.connected);
        const isMeDrawer = online && roundActive && drawerId && socket.id === drawerId;

        statusEl.innerText = !online ? 'Offline' : (roundActive ? (isMeDrawer ? 'You draw' : 'You guess') : 'Waiting');
        statusEl.className = 'status-pill ' + (!online ? 'offline' : 'online');

        if (!roundActive) {
            drawerEl.innerText = '-';
        } else {
            drawerEl.innerText = drawerId === socket.id ? 'You' : (drawerName || (drawerId ? drawerId.slice(0, 6) + '…' : '-'));
        }

        wordEl.innerText = myWord || '-';
        renderLeaderboard(leaderboard);
        updateToolUI();
        updateCanvasCursor();
        updateGuessInputState();
    }

    function canDraw() {
        return roundActive && socket && socket.connected && drawerId && socket.id === drawerId;
    }

    function canGuess() {
        return roundActive && socket && socket.connected && (!drawerId || socket.id !== drawerId);
    }

    function updateGuessInputState() {
        const drawMode = canDraw();
        const guessMode = canGuess();

        guessEl.disabled = !guessMode;
        guessBtn.disabled = !guessMode;
        guessBtn.style.opacity = guessMode ? '1' : '.55';
        guessBtn.style.cursor = guessMode ? 'pointer' : 'not-allowed';

        if (drawMode) {
            guessEl.placeholder = 'You are the drawer, guessing is disabled';
        } else if (!roundActive) {
            guessEl.placeholder = 'Round not started yet';
        } else {
            guessEl.placeholder = 'Type your guess...';
        }
    }

    function getDisplayName() {
        const user = getCurrentUser ? getCurrentUser() : null;
        if (!user || !user.nickname) return null;
        return user.nickname;
    }

    function getJoinedRoomId() {
        const roomId = getCurrentRoomId ? getCurrentRoomId() : null;
        return roomId ? roomId.trim() : null;
    }

    function syncProfile() {
        const nickname = getDisplayName();
        const roomId = getJoinedRoomId();
        if (!nickname || !roomId) return false;
        socket.emit('pict-set-profile', { nickname, roomId });
        return true;
    }

    function drawSegment(seg) {
        ctx.strokeStyle = seg.color || '#111';
        ctx.lineWidth = seg.width || 4;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
    }

    function getCurrentToolStyle() {
        if (currentTool === 'eraser') {
            return { color: '#fff', width: 20 };
        }
        return { color: '#111', width: 4 };
    }

    function getPos(event) {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    function drawAndEmit(nextPos) {
        const style = getCurrentToolStyle();
        const seg = { x1: last.x, y1: last.y, x2: nextPos.x, y2: nextPos.y, color: style.color, width: style.width };
        drawSegment(seg);
        socket.emit('pict-draw', seg);
        last = nextPos;
    }

    function stopDrawing() {
        isDrawing = false;
        last = null;
    }

    function setTool(nextTool) {
        if (nextTool !== 'brush' && nextTool !== 'eraser') return;
        currentTool = nextTool;
        updateToolUI();
        updateCanvasCursor();
    }

    function updateToolUI() {
        const enabled = canDraw();
        const activeColor = 'var(--primary-color)';
        const inactiveBg = 'white';
        const inactiveText = 'var(--text-main)';

        [brushToolBtn, eraserToolBtn, clearToolBtn].forEach((btn) => {
            if (!btn) return;
            btn.disabled = !enabled;
            btn.style.opacity = enabled ? '1' : '.55';
            btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
        });

        if (brushToolBtn) {
            const active = currentTool === 'brush';
            brushToolBtn.style.background = active ? activeColor : inactiveBg;
            brushToolBtn.style.color = active ? 'white' : inactiveText;
        }

        if (eraserToolBtn) {
            const active = currentTool === 'eraser';
            eraserToolBtn.style.background = active ? activeColor : inactiveBg;
            eraserToolBtn.style.color = active ? 'white' : inactiveText;
        }
    }

    function updateCanvasCursor() {
        if (!canDraw()) {
            canvas.style.cursor = 'default';
            return;
        }

        canvas.style.cursor = currentTool === 'eraser' ? eraserCursor : brushCursor;
    }

    function sendGuess() {
        const guess = guessEl.value.trim();
        if (!guess || !roundActive) return;
        const nickname = getDisplayName();
        if (!nickname) return;
        syncProfile();
        socket.emit('pict-guess', { guess, nickname });
        guessEl.value = '';
    }

    function openWordModal() {
        const roomId = getJoinedRoomId();
        if (!roomId) {
            showToast('Please join a room first');
            return;
        }

        modalWordEl.value = '';
        wordModalEl.style.display = 'flex';
        modalWordEl.focus();
    }

    function refreshStartAvailability(notify = false) {
        const joined = !!getJoinedRoomId();

        waitStartBtn.disabled = !joined;
        waitStartBtn.style.opacity = joined ? '1' : '.55';
        waitStartBtn.style.cursor = joined ? 'pointer' : 'not-allowed';

        if (waitHintEl) {
            waitHintEl.innerText = joined ? 'Click Start to begin.' : 'Please join a room first.';
        }

        if (notify && !joined) {
            showToast('Please join a room first');
        }
    }

    function closeWordModal() {
        wordModalEl.style.display = 'none';
    }

    function confirmStart() {
        const customWord = modalWordEl.value.trim();
        if (!customWord) {
            showToast('Please enter an answer word before starting');
            return;
        }

        const roomId = getJoinedRoomId();
        if (!roomId) {
            showToast('Please join a room first');
            return;
        }

        const nickname = getDisplayName();
        if (!nickname) {
            showToast('Please log in first');
            return;
        }

        syncProfile();
        myWord = null;
        closeWordModal();
        socket.emit('pict-start', { word: customWord, nickname });
    }

    canvas.addEventListener('mousedown', (event) => {
        if (!canDraw()) return;
        isDrawing = true;
        last = getPos(event);
    });

    canvas.addEventListener('mousemove', (event) => {
        if (!isDrawing || !canDraw()) return;
        drawAndEmit(getPos(event));
    });

    window.addEventListener('mouseup', stopDrawing);

    canvas.addEventListener('touchstart', (event) => {
        if (!canDraw()) return;
        event.preventDefault();
        isDrawing = true;
        last = getPos(event);
    }, { passive: false });

    canvas.addEventListener('touchmove', (event) => {
        if (!isDrawing || !canDraw()) return;
        event.preventDefault();
        drawAndEmit(getPos(event));
    }, { passive: false });

    canvas.addEventListener('touchend', stopDrawing);

    brushToolBtn.addEventListener('click', () => setTool('brush'));
    eraserToolBtn.addEventListener('click', () => setTool('eraser'));
    clearToolBtn.addEventListener('click', () => {
        if (!roundActive || !canDraw()) return;
        socket.emit('pict-clear');
    });

    waitStartBtn.addEventListener('click', openWordModal);
    nextBtn.addEventListener('click', openWordModal);
    endBtn.addEventListener('click', () => {
        if (!roundActive) return;
        const nickname = getDisplayName();
        if (!nickname) return;
        syncProfile();
        socket.emit('pict-end-round', { nickname });
    });

    modalConfirmBtn.addEventListener('click', confirmStart);
    modalCancelBtn.addEventListener('click', closeWordModal);
    modalWordEl.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') confirmStart();
    });

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (typeof window.initArcadeGames !== 'function') return;
            window.initArcadeGames({ socket, showToast, getCurrentUser, getCurrentRoomId });
        });
    }

    if (resetScoresBtn) {
        resetScoresBtn.addEventListener('click', () => {
            const roomId = getJoinedRoomId();
            const nickname = getDisplayName();
            const icon = resetScoresBtn.querySelector('i');

            if (!roomId) {
                showToast('Please join a room first');
                return;
            }

            if (!nickname) {
                showToast('Please log in before resetting scores');
                return;
            }

            resetScoresBtn.disabled = true;
            resetScoresBtn.style.opacity = '.7';

            if (icon) {
                icon.style.transition = 'transform .35s ease';
                icon.style.transform = 'rotate(180deg)';
            }

            syncProfile();
            socket.emit('pict-reset-scores');

            setTimeout(() => {
                resetScoresBtn.disabled = false;
                resetScoresBtn.style.opacity = '1';
                if (icon) {
                    icon.style.transform = 'rotate(0deg)';
                }
            }, 450);
        });
    }

    guessBtn.addEventListener('click', sendGuess);
    guessEl.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') sendGuess();
    });

    socket.on('connect', () => {
        syncProfile();
        appendGameMsg('Connected', 'system');
        updateStatus();
        socket.emit('pict-request-history');
    });

    socket.on('room-created', () => {
        const nextRoomId = getJoinedRoomId();
        if (nextRoomId && nextRoomId !== activeRoomId) {
            resetLocalRoomView();
        }
        activeRoomId = nextRoomId;
        syncProfile();
        refreshStartAvailability();
        socket.emit('pict-request-history');
    });

    socket.on('room-joined', () => {
        const nextRoomId = getJoinedRoomId();
        if (nextRoomId && nextRoomId !== activeRoomId) {
            resetLocalRoomView();
        }
        activeRoomId = nextRoomId;
        syncProfile();
        refreshStartAvailability();
        socket.emit('pict-request-history');
    });

    socket.on('disconnect', () => {
        appendGameMsg('Disconnected', 'system');
        setRoundUI(false);
        updateStatus();
    });

    socket.on('pict-state', (state) => {
        const wasRoundActive = roundActive;
        drawerId = state.drawerId || null;
        drawerName = state.drawerName || null;
        leaderboard = state.leaderboard || [];
        setRoundUI(!!state.roundActive);

        if (!wasRoundActive && state.roundActive) {
            resetRoundLog();
            const drawerText = drawerId === socket.id ? 'You' : (drawerName || 'Unknown');
            appendGameMsg(`Round is already in progress. Drawer: ${drawerText}`, 'system');
        }

        updateStatus();
    });

    socket.on('pict-round-started', ({ drawerId: nextDrawerId, drawerName: nextDrawerName, leaderboard: nextLeaderboard }) => {
        drawerId = nextDrawerId;
        drawerName = nextDrawerName || null;
        leaderboard = nextLeaderboard || leaderboard;
        myWord = null;
        clearBoard();
        setRoundUI(true);
        resetRoundLog();
        appendGameMsg(`Round started. Drawer: ${nextDrawerId === socket.id ? 'You' : (drawerName || 'Unknown')}`, 'system');
        updateStatus();
    });

    socket.on('pict-word', ({ word }) => {
        myWord = word;
        appendGameMsg(`Your word: ${word}`, 'system');
        updateStatus();
    });

    socket.on('pict-clear', () => {
        clearBoard();
    });

    socket.on('pict-draw', (segment) => {
        if (!roundActive) return;
        drawSegment(segment);
    });

    socket.on('pict-guess-broadcast', (message) => {
        const tag = message.correct ? '✅' : '💬';
        appendGameMsg(`${tag} ${message.from}: ${message.guess}`, message.correct ? 'system' : 'remote');

        if (!message.correct) {
            appendGameMsg(`❌ ${message.from || 'Someone'} guessed wrong.`, 'system');
        }
    });

    socket.on('pict-correct', ({ winnerName }) => {
        const name = winnerName || 'Someone';
        showToast(`${name} guessed correctly!`);
        appendGameMsg(`🎉 ${name} guessed correctly!`, 'system');
    });

    socket.on('pict-guess-feedback', ({ correct, message, guesserId, guesserName }) => {
        if (correct) return;
        const text = message || 'Wrong answer, try again!';
        if (guesserId === socket.id) {
            showToast(text);
        }
    });

    socket.on('pict-round-ended', ({ winnerName, word, endedBy, manual, leaderboard: nextLeaderboard }) => {
        leaderboard = nextLeaderboard || leaderboard;
        if (manual) {
            appendGameMsg(`⏹ Round ended by ${endedBy || 'Unknown'}. Word: ${word || '-'}`, 'system');
        } else {
            appendGameMsg(`🏁 Winner: ${winnerName || 'Unknown'}. Word: ${word || '-'}`, 'system');
        }

        drawerId = null;
        drawerName = null;
        clearBoard();
        setRoundUI(false);
        updateStatus();
    });

    socket.on('pict-error', ({ message }) => {
        if (message) showToast(message);
    });

    socket.on('pict-history', ({ strokes }) => {
        if (!Array.isArray(strokes) || !roundActive) return;
        clearBoard();
        for (const segment of strokes) drawSegment(segment);
    });

    if (socket.connected) {
        syncProfile();
        socket.emit('pict-request-history');
    }

    setRoundUI(false);
    refreshStartAvailability(true);
    updateStatus();
}

window.mountPictionaryGame = mountPictionaryGame;
