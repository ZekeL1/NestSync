function mountPictionaryGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    gamesRoot.innerHTML = `
      <div class="glass-panel" style="width:100%; height:100%; padding:18px; box-sizing:border-box; position:relative;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="font-size:1.25rem; font-weight:800;">
              <i class="fa-solid fa-paintbrush" style="color:#6c5ce7;"></i> Pictionary
            </div>
            <div class="status-pill offline" id="pict-status">Offline</div>
          </div>

                    <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end;">
                        <button id="pict-next" class="btn-primary" style="height:44px; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-forward"></i> Next Round</button>
                        <button id="pict-back" class="btn-icon" title="Back to Arcade">
                          <i class="fa-solid fa-arrow-left"></i>
                        </button>
          </div>
        </div>

        <div id="pict-waiting" class="glass-panel" style="height:calc(100% - 58px); display:flex; align-items:center; justify-content:center; text-align:center;">
          <div style="width:min(520px, 92%);">
            <div style="font-size:40px; margin-bottom:8px; color:#6c5ce7;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            <div style="font-size:20px; font-weight:700; margin-bottom:6px;">Waiting for round to start...</div>
                        <div id="pict-wait-hint" style="opacity:.75; margin-bottom:14px;">Click Start to begin.</div>
            <div style="display:flex; justify-content:center; margin-bottom:14px;">
                            <button id="pict-wait-start" class="btn-primary" style="min-width:220px; height:44px; padding:0 24px; display:flex; align-items:center; justify-content:center; gap:10px; font-size:1rem;"><i class="fa-solid fa-play" style="font-size:1rem;"></i> Start</button>
            </div>
            <div class="glass-panel" style="padding:10px; text-align:left;">
              <div style="font-weight:800; margin-bottom:8px;">Leaderboard</div>
              <div id="pict-wait-scores" style="max-height:170px; overflow:auto;">-</div>
            </div>
          </div>
        </div>

        <div id="pict-live-area" style="display:none; gap:16px; height:calc(100% - 58px);">
          <div style="flex:1; min-width:520px;">
                        <div style="display:flex; flex-direction:column; gap:10px; height:100%;">
                            <div class="glass-panel" style="padding:8px 10px; border-radius:14px; display:flex; align-items:center; justify-content:space-between;">
                                <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#6c5ce7;">
                                    <i class="fa-solid fa-pen-ruler"></i>
                                    <span>Drawing Canvas</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <button id="pict-tool-brush" class="btn-icon" title="Brush" style="display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-paintbrush"></i></button>
                                    <button id="pict-tool-eraser" class="btn-icon" title="Eraser" style="display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-eraser"></i></button>
                                    <button id="pict-tool-clear" class="btn-icon" title="Clear Canvas" style="display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-trash-can"></i></button>
                                </div>
                            </div>

                            <div style="position:relative; border-radius:18px; overflow:hidden; background:rgba(255,255,255,0.5); border:2px solid rgba(108,92,231,.36); flex:1; min-height:0; padding:10px; box-sizing:border-box;">
                                <canvas id="pict-canvas" width="900" height="560" style="width:100%; height:100%; background:#fff; border-radius:14px;"></canvas>
                            </div>
            </div>
          </div>

          <div style="width:360px; display:flex; flex-direction:column; gap:12px;">
            <div class="glass-panel" style="padding:12px;">
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <span style="font-weight:800;">Drawer:</span> <span id="pict-drawer">-</span>
              </div>
              <div style="margin-top:8px; display:flex; gap:10px; flex-wrap:wrap;">
                <span style="font-weight:800;">Your word:</span> <span id="pict-word">-</span>
              </div>
              <div style="margin-top:8px; display:flex; gap:10px; flex-wrap:wrap;">
                <span style="font-weight:800; width:100%;">Leaderboard:</span>
                <div id="pict-scores" style="width:100%; max-height:140px; overflow:auto;">-</div>
              </div>
            </div>

            <div class="chat-wrapper" style="flex:1; min-height:260px;">
              <div class="chat-messages" id="pict-log">
                <div class="chat-msg system"><span>Game ready. Waiting for start.</span></div>
              </div>
              <div class="chat-input-area">
                <input type="text" id="pict-guess" placeholder="Type your guess...">
                                <button id="pict-guess-btn" class="btn-primary" style="width:40px; height:40px; min-width:40px; padding:0; border-radius:14px; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-paper-plane"></i></button>
              </div>
            </div>
          </div>
        </div>

        <div id="pict-word-modal" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,.32); border-radius:18px; align-items:center; justify-content:center; z-index:20;">
          <div class="glass-panel" style="width:min(420px, 92%); padding:16px;">
            <div style="font-weight:800; font-size:1.1rem; margin-bottom:8px;">Enter answer word</div>
            <input id="pict-modal-word" class="input-room" style="width:100%; max-width:none;" maxlength="40" placeholder="e.g. apple">
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
              <button id="pict-modal-cancel" class="btn-icon" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
              <button id="pict-modal-confirm" class="btn-primary"><i class="fa-solid fa-check"></i> Confirm</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const statusEl = document.getElementById('pict-status');
    const waitStartBtn = document.getElementById('pict-wait-start');
    const waitHintEl = document.getElementById('pict-wait-hint');
    const nextBtn = document.getElementById('pict-next');
    const backBtn = document.getElementById('pict-back');

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

        logEl.innerHTML = '';
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
