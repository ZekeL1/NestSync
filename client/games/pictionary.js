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

          <div style="display:flex; gap:10px; align-items:center;">
            <button id="pict-next" class="btn-primary"><i class="fa-solid fa-forward"></i> Next Round</button>
            <button id="pict-end" class="btn-icon" title="End Round"><i class="fa-solid fa-flag-checkered"></i></button>
            <button id="pict-clear" class="btn-icon" title="Clear"><i class="fa-solid fa-eraser"></i></button>
          </div>
        </div>

        <div id="pict-waiting" class="glass-panel" style="height:calc(100% - 58px); display:flex; align-items:center; justify-content:center; text-align:center;">
          <div style="width:min(520px, 92%);">
            <div style="font-size:40px; margin-bottom:8px; color:#6c5ce7;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            <div style="font-size:20px; font-weight:700; margin-bottom:6px;">Waiting for round to start...</div>
            <div style="opacity:.75; margin-bottom:14px;">Click Start to begin.</div>
            <div style="display:flex; justify-content:center; margin-bottom:14px;">
              <button id="pict-wait-start" class="btn-primary" style="min-width:160px;"><i class="fa-solid fa-play"></i> Start</button>
            </div>
            <div class="glass-panel" style="padding:10px; text-align:left;">
              <div style="font-weight:800; margin-bottom:8px;">Leaderboard</div>
              <div id="pict-wait-scores" style="max-height:170px; overflow:auto;">-</div>
            </div>
          </div>
        </div>

        <div id="pict-live-area" style="display:none; gap:16px; height:calc(100% - 58px);">
          <div style="flex:1; min-width:520px;">
            <div style="border-radius:18px; overflow:hidden; background:rgba(255,255,255,0.5); height:100%; padding:10px; box-sizing:border-box;">
              <canvas id="pict-canvas" width="900" height="560" style="width:100%; height:100%; background:#fff; border-radius:14px;"></canvas>
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
                <button id="pict-guess-btn"><i class="fa-solid fa-paper-plane"></i></button>
              </div>
            </div>

            <div style="opacity:.75; font-size:12px; padding:0 4px;">Tip: only drawer can draw; everyone can end round or start next round.</div>
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
    const nextBtn = document.getElementById('pict-next');
    const endBtn = document.getElementById('pict-end');
    const clearBtn = document.getElementById('pict-clear');

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

    const canvas = document.getElementById('pict-canvas');
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    let drawerId = null;
    let drawerName = null;
    let myWord = null;
    let leaderboard = [];
    let roundActive = false;
    let isDrawing = false;
    let last = null;

    function appendGameMsg(text, type = 'system') {
        const div = document.createElement('div');
        div.className = `chat-msg ${type}`;
        const span = document.createElement('span');
        span.textContent = text;
        div.appendChild(span);
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
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
        clearBtn.style.display = roundActive ? 'flex' : 'none';

        if (!roundActive) {
            myWord = null;
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
    }

    function canDraw() {
        return roundActive && socket && socket.connected && drawerId && socket.id === drawerId;
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
        const seg = { x1: last.x, y1: last.y, x2: nextPos.x, y2: nextPos.y, color: '#111', width: 4 };
        drawSegment(seg);
        socket.emit('pict-draw', seg);
        last = nextPos;
    }

    function stopDrawing() {
        isDrawing = false;
        last = null;
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
        modalWordEl.value = '';
        wordModalEl.style.display = 'flex';
        modalWordEl.focus();
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

    waitStartBtn.addEventListener('click', openWordModal);
    nextBtn.addEventListener('click', openWordModal);

    modalConfirmBtn.addEventListener('click', confirmStart);
    modalCancelBtn.addEventListener('click', closeWordModal);
    modalWordEl.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') confirmStart();
    });

    endBtn.addEventListener('click', () => {
        if (!roundActive) return;
        const nickname = getDisplayName();
        if (!nickname) return;
        syncProfile();
        socket.emit('pict-end-round', { nickname });
    });

    clearBtn.addEventListener('click', () => {
        if (!roundActive) return;
        socket.emit('pict-clear');
    });

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
        syncProfile();
        socket.emit('pict-request-history');
    });

    socket.on('room-joined', () => {
        syncProfile();
        socket.emit('pict-request-history');
    });

    socket.on('disconnect', () => {
        appendGameMsg('Disconnected', 'system');
        setRoundUI(false);
        updateStatus();
    });

    socket.on('pict-state', (state) => {
        drawerId = state.drawerId || null;
        drawerName = state.drawerName || null;
        leaderboard = state.leaderboard || [];
        setRoundUI(!!state.roundActive);
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
    });

    socket.on('pict-correct', ({ winnerName }) => {
        const name = winnerName || 'Someone';
        showToast(`${name} guessed correctly!`);
        appendGameMsg(`🎉 ${name} guessed correctly!`, 'system');
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
    updateStatus();
}

window.mountPictionaryGame = mountPictionaryGame;
