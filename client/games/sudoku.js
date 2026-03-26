function mountSudokuGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    if (typeof window.cleanupSudokuGame === 'function') {
        window.cleanupSudokuGame();
    }

    const difficultyOptions = ['Easy', 'Medium', 'Hard'];
    const holeCountByDifficulty = {
        Easy: 38,
        Medium: 46,
        Hard: 54,
    };

    let selectedDifficulty = 'Medium';
    let started = false;
    let completed = false;
    let selectedIndex = null;
    let puzzle = Array(81).fill(0);
    let values = Array(81).fill(0);
    let fixed = Array(81).fill(false);
    let errors = new Set();
    let leaderboard = [];
    let timerSeconds = 0;
    let timerStartedAt = null;
    let timerIntervalId = null;
    let activeRoomId = getJoinedRoomId();
    let roundNumber = 0;
    let activeStartedAt = null;

    const socketListeners = {
        connect: () => {
            refreshStartAvailability();
            requestSudokuState();
            renderMeta();
        },
        disconnect: () => {
            refreshStartAvailability();
            renderMeta();
        },
        'room-created': () => {
            const nextRoomId = getJoinedRoomId();
            if (nextRoomId !== activeRoomId) {
                resetLocalGameState({ clearLeaderboard: true, resetRound: true });
            }
            activeRoomId = nextRoomId;
            refreshStartAvailability();
            requestSudokuState();
            renderMeta();
        },
        'room-joined': () => {
            const nextRoomId = getJoinedRoomId();
            if (nextRoomId !== activeRoomId) {
                resetLocalGameState({ clearLeaderboard: true, resetRound: true });
            }
            activeRoomId = nextRoomId;
            refreshStartAvailability();
            requestSudokuState();
            renderMeta();
        },
        'room-left': () => {
            activeRoomId = null;
            resetLocalGameState({ clearLeaderboard: true, resetRound: true });
            refreshStartAvailability();
            renderMeta();
        },
        'sudoku-state': (state) => {
            applyServerState(state);
        },
        'sudoku-round-started': ({ difficulty, startedBy, roundNumber: nextRound }) => {
            const who = startedBy || 'Someone';
            const label = difficulty || selectedDifficulty;
            showToast(`${who} started ${label} Sudoku${nextRound ? ` (Round ${nextRound})` : ''}.`);
        },
        'sudoku-complete': ({ completedBy }) => {
            const who = completedBy || 'Someone';
            showToast(`${who} completed the puzzle!`);
        },
        'sudoku-ended': ({ endedBy }) => {
            const who = endedBy || 'Someone';
            showToast(`Sudoku ended by ${who}.`);
        },
        'sudoku-error': ({ message }) => {
            if (message) showToast(message);
        },
    };

    function cleanup() {
        stopTimer();
        window.removeEventListener('keydown', onWindowKeyDown);
        window.removeEventListener('resize', syncBoardSize);
        if (socket && typeof socket.off === 'function') {
            Object.entries(socketListeners).forEach(([eventName, handler]) => {
                socket.off(eventName, handler);
            });
        }
        if (window.cleanupSudokuGame === cleanup) {
            delete window.cleanupSudokuGame;
        }
    }

    window.cleanupSudokuGame = cleanup;

    function shuffle(list) {
        const next = list.slice();
        for (let index = next.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            const temp = next[index];
            next[index] = next[swapIndex];
            next[swapIndex] = temp;
        }
        return next;
    }

    function buildSolvedBoard() {
        const base = 3;
        const side = base * base;

        function pattern(row, col) {
            return (base * (row % base) + Math.floor(row / base) + col) % side;
        }

        const rowGroups = shuffle([0, 1, 2]);
        const colGroups = shuffle([0, 1, 2]);
        const rows = rowGroups.flatMap((group) => shuffle([0, 1, 2]).map((item) => group * base + item));
        const cols = colGroups.flatMap((group) => shuffle([0, 1, 2]).map((item) => group * base + item));
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        return rows.flatMap((row) => cols.map((col) => nums[pattern(row, col)]));
    }

    function generateSudokuBoard(difficulty) {
        const nextSolution = buildSolvedBoard();
        const nextPuzzle = nextSolution.slice();
        const holeCount = holeCountByDifficulty[difficulty] || holeCountByDifficulty.Medium;
        const indexes = shuffle(Array.from({ length: 81 }, (_, index) => index));

        for (let index = 0; index < holeCount; index++) {
            nextPuzzle[indexes[index]] = 0;
        }

        return {
            puzzle: nextPuzzle,
            solution: nextSolution,
        };
    }

    function formatTime(totalSeconds) {
        const seconds = Math.max(0, Number(totalSeconds) || 0);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainSeconds = seconds % 60;

        if (hours > 0) {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`;
        }

        return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`;
    }

    function getDisplayName() {
        const user = getCurrentUser ? getCurrentUser() : null;
        return user ? (user.nickname || user.username || 'Guest') : 'Guest';
    }

    function getJoinedRoomId() {
        const roomId = getCurrentRoomId ? getCurrentRoomId() : null;
        return roomId ? roomId.trim() : null;
    }

    function getStatusLabel() {
        if (!socket || !socket.connected) return 'Offline';
        if (completed) return 'Solved';
        if (started) return 'Playing';
        return 'Ready';
    }

    function stopTimer() {
        if (timerIntervalId) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
        }
        timerStartedAt = null;
        activeStartedAt = null;
    }

    function syncTimer(startedAt) {
        if (!started || !startedAt) {
            timerSeconds = 0;
            stopTimer();
            return;
        }

        if (timerIntervalId && activeStartedAt === startedAt) {
            timerSeconds = Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000));
            return;
        }

        stopTimer();
        timerStartedAt = Number(startedAt);
        activeStartedAt = startedAt;
        timerSeconds = Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000));
        timerIntervalId = setInterval(() => {
            timerSeconds = Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000));
            renderMeta();
        }, 1000);
    }

    function getFirstEditableIndex() {
        return fixed.findIndex((item) => !item);
    }

    function resetLocalGameState(options = {}) {
        const { clearLeaderboard = false, resetRound = false } = options;
        stopTimer();
        started = false;
        completed = false;
        selectedIndex = null;
        puzzle = Array(81).fill(0);
        values = Array(81).fill(0);
        fixed = Array(81).fill(false);
        errors = new Set();
        if (clearLeaderboard) {
            leaderboard = [];
        }
        if (resetRound) {
            roundNumber = 0;
        }
        setStartedUI(false);
        renderBoard();
        syncBoardSize();
        renderMeta();
        renderKeypad();
        renderLeaderboard();
    }

    function setStartedUI(active) {
        const waitingEl = gamesRoot.querySelector('#sudoku-waiting');
        const liveAreaEl = gamesRoot.querySelector('#sudoku-live-area');
        const nextBtn = gamesRoot.querySelector('#sudoku-next');

        if (waitingEl) {
            waitingEl.style.display = active ? 'none' : 'flex';
        }

        if (liveAreaEl) {
            liveAreaEl.style.display = active ? 'flex' : 'none';
        }

        if (nextBtn) {
            nextBtn.style.display = active ? 'flex' : 'none';
            nextBtn.style.opacity = active ? '1' : '.7';
        }

        syncBoardSize();
    }

    function refreshStartAvailability(notify = false) {
        const roomId = getJoinedRoomId();
        const joined = !!roomId && !!socket && socket.connected;
        const waitStartBtn = gamesRoot.querySelector('#sudoku-wait-start');
        const waitHintEl = gamesRoot.querySelector('#sudoku-wait-hint');

        if (waitStartBtn) {
            waitStartBtn.disabled = !joined;
            waitStartBtn.style.opacity = joined ? '1' : '.55';
            waitStartBtn.style.cursor = joined ? 'pointer' : 'not-allowed';
        }

        if (waitHintEl) {
            if (!roomId) {
                waitHintEl.innerText = 'Please join a room first.';
            } else if (!socket || !socket.connected) {
                waitHintEl.innerText = 'Server connection is required to start Sudoku.';
            } else {
                waitHintEl.innerText = 'Choose a difficulty and click Start to begin.';
            }
        }

        if (notify) {
            if (!roomId) {
                showToast('Please join a room first');
            } else if (!socket || !socket.connected) {
                showToast('Server connection is required for Sudoku.');
            }
        }
    }

    function syncSudokuProfile() {
        const roomId = getJoinedRoomId();
        const nickname = getDisplayName();

        if (!roomId || !nickname || !socket || !socket.connected) {
            return false;
        }

        socket.emit('sudoku-set-profile', { roomId, nickname });
        return true;
    }

    function requestSudokuState() {
        const roomId = getJoinedRoomId();
        const nickname = getDisplayName();

        if (!socket || !socket.connected || !roomId || !nickname) return;

        socket.emit('sudoku-request-state', { roomId, nickname });
    }

    function applyServerState(state) {
        if (!state) return;

        const joinedRoomId = getJoinedRoomId();
        if (state.roomId && joinedRoomId && state.roomId !== joinedRoomId) {
            return;
        }

        started = !!state.started;
        completed = !!state.completed;
        roundNumber = Number(state.roundNumber || 0);
        leaderboard = Array.isArray(state.leaderboard) ? state.leaderboard.slice() : [];

        if (state.difficulty) {
            selectedDifficulty = state.difficulty;
        }

        puzzle = Array.isArray(state.puzzle) && state.puzzle.length === 81 ? state.puzzle.slice() : Array(81).fill(0);
        values = Array.isArray(state.values) && state.values.length === 81 ? state.values.slice() : puzzle.slice();
        fixed = Array.isArray(state.fixed) && state.fixed.length === 81 ? state.fixed.slice() : puzzle.map((value) => value !== 0);
        errors = new Set(Array.isArray(state.errors) ? state.errors : []);

        if (started) {
            if (selectedIndex === null || fixed[selectedIndex]) {
                selectedIndex = getFirstEditableIndex();
            }
            setStartedUI(true);
            syncTimer(state.startedAt);
        } else {
            selectedIndex = null;
            setStartedUI(false);
            timerSeconds = 0;
            stopTimer();
        }

        renderDifficultyButtons();
        renderBoard();
        syncBoardSize();
        renderMeta();
        renderKeypad();
        renderLeaderboard();
    }

    function buildRoundPayload() {
        const nextBoard = generateSudokuBoard(selectedDifficulty);
        return {
            difficulty: selectedDifficulty,
            puzzle: nextBoard.puzzle,
            solution: nextBoard.solution,
            nickname: getDisplayName(),
        };
    }

    function handleStart() {
        if (!getJoinedRoomId() || !socket || !socket.connected) {
            refreshStartAvailability(true);
            return;
        }

        if (!syncSudokuProfile()) {
            refreshStartAvailability(true);
            return;
        }

        socket.emit('sudoku-start', buildRoundPayload());
    }

    function handleNextPuzzle() {
        if (!getJoinedRoomId() || !socket || !socket.connected) {
            refreshStartAvailability(true);
            return;
        }

        if (!syncSudokuProfile()) {
            refreshStartAvailability(true);
            return;
        }

        socket.emit('sudoku-next-round', buildRoundPayload());
    }

    function handleEndGame() {
        if (!started && !completed) {
            showToast('No active puzzle to end right now.');
            return;
        }

        if (!getJoinedRoomId() || !socket || !socket.connected) {
            refreshStartAvailability(true);
            return;
        }

        syncSudokuProfile();
        socket.emit('sudoku-end', { nickname: getDisplayName() });
    }

    function selectCell(index) {
        if (!started) return;
        selectedIndex = index;
        renderBoard();
        renderMeta();
        renderKeypad();
    }

    function applyValue(rawValue) {
        if (!started) {
            showToast('Click Start to generate a puzzle first.');
            return;
        }

        if (completed) {
            showToast('This puzzle is already solved. Start the next one.');
            return;
        }

        if (selectedIndex === null || selectedIndex < 0 || selectedIndex > 80) {
            showToast('Select a cell first.');
            return;
        }

        if (fixed[selectedIndex]) {
            showToast('This is a fixed clue and cannot be changed.');
            return;
        }

        const nextValue = rawValue ? Number(rawValue) : 0;
        if (nextValue < 0 || nextValue > 9 || Number.isNaN(nextValue)) return;
        if (values[selectedIndex] === nextValue) return;

        if (!socket || !socket.connected) {
            showToast('Server connection is required for Sudoku.');
            return;
        }

        syncSudokuProfile();
        socket.emit('sudoku-edit', {
            index: selectedIndex,
            value: nextValue,
            nickname: getDisplayName(),
        });
    }

    function moveSelection(rowOffset, colOffset) {
        if (!started || selectedIndex === null) return;

        const row = Math.floor(selectedIndex / 9);
        const col = selectedIndex % 9;
        const nextRow = Math.max(0, Math.min(8, row + rowOffset));
        const nextCol = Math.max(0, Math.min(8, col + colOffset));
        selectedIndex = nextRow * 9 + nextCol;
        renderBoard();
        renderMeta();
        renderKeypad();
    }

    function onWindowKeyDown(event) {
        if (!gamesRoot.classList.contains('active-content')) return;

        if (!gamesRoot.contains(document.activeElement)) {
            const tagName = document.activeElement ? document.activeElement.tagName : '';
            if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
                return;
            }
        }

        if (!gamesRoot.querySelector('#sudoku-shell')) return;

        if (/^[1-9]$/.test(event.key)) {
            event.preventDefault();
            applyValue(event.key);
            return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
            event.preventDefault();
            applyValue(0);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(-1, 0);
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveSelection(1, 0);
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            moveSelection(0, -1);
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            moveSelection(0, 1);
        }
    }

    function renderDifficultyButtons() {
        const container = gamesRoot.querySelector('#sudoku-difficulty-buttons');
        if (!container) return;

        container.innerHTML = difficultyOptions.map((level) => {
            const isActive = level === selectedDifficulty;
            const background = isActive ? 'var(--primary-color)' : 'rgba(255,255,255,.86)';
            const color = isActive ? 'white' : 'var(--text-main)';
            const shadow = isActive ? '0 8px 20px rgba(108,92,231,.28)' : 'none';

            return `
              <button
                type="button"
                class="sudoku-difficulty-btn"
                data-level="${level}"
                style="
                  min-width:90px;
                  height:40px;
                  padding:0 16px;
                  border:none;
                  border-radius:14px;
                  cursor:pointer;
                  font-weight:700;
                  background:${background};
                  color:${color};
                  box-shadow:${shadow};
                  transition:.2s;
                "
              >
                ${level}
              </button>
            `;
        }).join('');

        const buttons = container.querySelectorAll('.sudoku-difficulty-btn');
        buttons.forEach((button) => {
            button.addEventListener('click', () => {
                selectedDifficulty = button.dataset.level || 'Medium';
                renderDifficultyButtons();
                renderMeta();
            });
        });
    }

    function renderBoard() {
        const boardEl = gamesRoot.querySelector('#sudoku-board');
        if (!boardEl) return;

        const selectedValue = selectedIndex !== null ? values[selectedIndex] : 0;

        boardEl.innerHTML = values.map((value, index) => {
            const row = Math.floor(index / 9);
            const col = index % 9;
            const isSelected = index === selectedIndex;
            const sameValue = selectedValue && value && value === selectedValue;
            const sameRow = selectedIndex !== null && Math.floor(selectedIndex / 9) === row;
            const sameCol = selectedIndex !== null && selectedIndex % 9 === col;
            const sameBox = selectedIndex !== null &&
                Math.floor(Math.floor(selectedIndex / 9) / 3) === Math.floor(row / 3) &&
                Math.floor((selectedIndex % 9) / 3) === Math.floor(col / 3);
            const isFixed = fixed[index];
            const isError = errors.has(index);

            let background = 'rgba(255,255,255,.95)';
            if (sameRow || sameCol || sameBox) background = 'rgba(108,92,231,.06)';
            if (sameValue) background = 'rgba(108,92,231,.12)';
            if (isSelected) background = 'rgba(108,92,231,.18)';
            if (isError) background = 'rgba(255,118,117,.20)';

            const blockEdge = (col + 1) % 3 === 0 && col !== 8 ? 'border-right:2px solid rgba(108,92,231,.36);' : '';
            const rowEdge = (row + 1) % 3 === 0 && row !== 8 ? 'border-bottom:2px solid rgba(108,92,231,.36);' : '';
            const textColor = isError ? '#d63031' : (isFixed ? '#2d3436' : 'var(--primary-color)');
            const fontWeight = isFixed ? '800' : '700';

            return `
              <button
                type="button"
                class="sudoku-cell"
                data-index="${index}"
                style="
                  aspect-ratio:1;
                  border:none;
                  border-right:1px solid rgba(108,92,231,.12);
                  border-bottom:1px solid rgba(108,92,231,.12);
                  ${blockEdge}
                  ${rowEdge}
                  background:${background};
                  color:${textColor};
                  font-size:1.35rem;
                  font-weight:${fontWeight};
                  cursor:pointer;
                  transition:.15s;
                "
              >
                ${value || ''}
              </button>
            `;
        }).join('');

        const cells = boardEl.querySelectorAll('.sudoku-cell');
        cells.forEach((cell) => {
            cell.addEventListener('click', () => {
                selectCell(Number(cell.dataset.index));
            });
        });

        syncBoardSize();
    }

    function syncBoardSize() {
        const boardEl = gamesRoot.querySelector('#sudoku-board');
        const boardStageEl = gamesRoot.querySelector('#sudoku-board-stage');
        const boardPanelEl = gamesRoot.querySelector('#sudoku-board-panel');

        if (!boardEl || !boardStageEl || !boardPanelEl) return;
        if (boardStageEl.offsetParent === null) return;

        const stageRect = boardStageEl.getBoundingClientRect();
        const panelRect = boardPanelEl.getBoundingClientRect();

        const horizontalPadding = Math.max(0, panelRect.width - boardStageEl.clientWidth);
        const verticalPadding = Math.max(0, panelRect.height - boardStageEl.clientHeight);
        const reservedHeaderHeight = Math.max(54, panelRect.height - boardStageEl.clientHeight - verticalPadding);
        const availableWidth = Math.max(180, stageRect.width);
        const availableHeight = Math.max(180, panelRect.height - reservedHeaderHeight - 20);
        const boardSize = Math.floor(Math.max(180, Math.min(availableWidth, availableHeight)));

        boardEl.style.width = `${boardSize}px`;
        boardEl.style.height = `${boardSize}px`;
        boardEl.style.maxWidth = '100%';
        boardEl.style.maxHeight = '100%';
    }

    function renderKeypad() {
        const keypadEl = gamesRoot.querySelector('#sudoku-keypad');
        if (!keypadEl) return;

        keypadEl.innerHTML = `
          ${Array.from({ length: 9 }, (_, index) => `
            <button
              type="button"
              class="sudoku-key-btn"
              data-value="${index + 1}"
              style="
                height:44px;
                border:none;
                border-radius:14px;
                background:white;
                color:var(--text-main);
                font-weight:800;
                cursor:pointer;
                box-shadow:0 4px 12px rgba(0,0,0,.05);
                transition:.2s;
              "
            >
              ${index + 1}
            </button>
          `).join('')}
          <button
            type="button"
            id="sudoku-erase"
            style="
              grid-column:1 / -1;
              height:42px;
              border:none;
              border-radius:14px;
              background:rgba(255,255,255,.9);
              color:#d63031;
              font-weight:800;
              cursor:pointer;
            "
          >
            <i class="fa-solid fa-eraser"></i> Erase
          </button>
        `;

        const keyButtons = keypadEl.querySelectorAll('.sudoku-key-btn');
        keyButtons.forEach((button) => {
            button.addEventListener('click', () => {
                applyValue(button.dataset.value);
            });
        });

        const eraseBtn = keypadEl.querySelector('#sudoku-erase');
        if (eraseBtn) {
            eraseBtn.addEventListener('click', () => {
                applyValue(0);
            });
        }
    }

    function renderLeaderboard() {
        const containers = gamesRoot.querySelectorAll('[data-sudoku-scoreboard]');
        if (!containers.length) return;

        containers.forEach((container) => {
            container.innerHTML = '';

            if (!leaderboard.length) {
                container.textContent = '-';
                return;
            }

            leaderboard.forEach((row, index) => {
                const item = document.createElement('div');
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.gap = '8px';
                item.style.padding = '3px 0';

                const left = document.createElement('span');
                left.textContent = `#${index + 1} ${row.id === socket.id ? 'You' : (row.name || 'Guest')}`;

                const right = document.createElement('strong');
                right.textContent = String(row.score || 0);

                item.appendChild(left);
                item.appendChild(right);
                container.appendChild(item);
            });
        });
    }

    function renderMeta() {
        const statusEl = gamesRoot.querySelector('#sudoku-status');
        const timerEl = gamesRoot.querySelector('#sudoku-timer');
        const roomEl = gamesRoot.querySelector('#sudoku-room-value');
        const playerEl = gamesRoot.querySelector('#sudoku-player-value');
        const filledEl = gamesRoot.querySelector('#sudoku-filled-value');
        const mistakesEl = gamesRoot.querySelector('#sudoku-mistakes-value');
        const hintEl = gamesRoot.querySelector('#sudoku-hint');
        const nextBtn = gamesRoot.querySelector('#sudoku-next');
        const endBtn = gamesRoot.querySelector('#sudoku-end');
        const roundEl = gamesRoot.querySelector('#sudoku-round-value');
        const scoreEl = gamesRoot.querySelector('#sudoku-score-value');

        if (statusEl) {
            const online = socket && socket.connected;
            statusEl.textContent = getStatusLabel();
            statusEl.className = `status-pill ${online ? 'online' : 'offline'}`;
        }

        if (timerEl) {
            timerEl.textContent = formatTime(timerSeconds);
        }

        if (roomEl) {
            roomEl.textContent = getJoinedRoomId() || 'Not joined yet';
        }

        if (playerEl) {
            playerEl.textContent = getDisplayName();
        }

        gamesRoot.querySelectorAll('[data-sudoku-difficulty]').forEach((element) => {
            element.textContent = selectedDifficulty;
        });

        if (filledEl) {
            filledEl.textContent = `${values.filter(Boolean).length} / 81`;
        }

        if (mistakesEl) {
            mistakesEl.textContent = String(errors.size);
        }

        if (roundEl) {
            roundEl.textContent = started ? `Round ${roundNumber}` : (roundNumber > 0 ? `Round ${roundNumber}` : '-');
        }

        if (scoreEl) {
            const me = leaderboard.find((item) => item.id === socket.id);
            scoreEl.textContent = String(me ? Number(me.score || 0) : 0);
        }

        if (hintEl) {
            if (!started) {
                hintEl.textContent = 'Room members will share the same puzzle once someone starts.';
            } else if (completed) {
                hintEl.textContent = 'Puzzle solved. Start the next shared round when ready.';
            } else if (selectedIndex === null) {
                hintEl.textContent = 'Select a cell to type a number or use the keypad.';
            } else if (fixed[selectedIndex]) {
                hintEl.textContent = 'Selected cell is a fixed clue. Choose an empty cell to edit.';
            } else {
                hintEl.textContent = 'Edits are synced through the room in real time.';
            }
        }

        if (nextBtn) {
            nextBtn.style.opacity = started ? '1' : '.7';
        }

        if (endBtn) {
            endBtn.style.opacity = started ? '1' : '.7';
        }
    }

    function renderShell() {
        gamesRoot.innerHTML = `
          <div id="sudoku-shell" class="glass-panel" style="width:100%; height:100%; padding:18px; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:1.25rem; font-weight:800;">
                  <i class="fa-solid fa-table-cells-large" style="color:#6c5ce7;"></i> Sudoku
                </div>
                <div id="sudoku-status" class="status-pill offline">Ready</div>
              </div>

              <button id="sudoku-back" class="btn-icon" title="Back to Arcade">
                <i class="fa-solid fa-arrow-left"></i>
              </button>
            </div>

            <div id="sudoku-waiting" class="glass-panel" style="height:calc(100% - 58px); display:flex; align-items:center; justify-content:center; text-align:center;">
              <div style="width:min(560px, 92%);">
                <div style="font-size:40px; margin-bottom:8px; color:#6c5ce7;"><i class="fa-solid fa-spinner fa-spin"></i></div>
                <div style="font-size:20px; font-weight:700; margin-bottom:6px;">Waiting for puzzle to start...</div>
                <div id="sudoku-wait-hint" style="opacity:.75; margin-bottom:14px;">Please join a room first.</div>

                <div class="glass-panel" style="padding:14px; margin-bottom:14px; text-align:left;">
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Player</span>
                    <strong id="sudoku-player-value">-</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Room</span>
                    <strong id="sudoku-room-value">-</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Difficulty</span>
                    <strong data-sudoku-difficulty>Medium</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px;">
                    <span style="opacity:.75;">Score</span>
                    <strong id="sudoku-score-value">0</strong>
                  </div>
                  <div style="display:flex; justify-content:center; margin-top:12px;">
                    <button id="sudoku-wait-start" class="btn-primary" style="min-width:220px; height:44px; padding:0 24px; display:flex; align-items:center; justify-content:center; gap:10px; font-size:1rem;">
                      <i class="fa-solid fa-play" style="font-size:1rem;"></i> Start
                    </button>
                  </div>
                </div>

                <div class="glass-panel" style="padding:14px; margin-bottom:14px; text-align:left;">
                  <div style="font-weight:800; margin-bottom:8px;">Leaderboard</div>
                  <div data-sudoku-scoreboard style="max-height:160px; overflow:auto;">-</div>
                </div>

                <div class="glass-panel" style="padding:14px; text-align:left;">
                  <div style="font-weight:800; margin-bottom:10px;">Difficulty</div>
                  <div id="sudoku-difficulty-buttons" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
                </div>
              </div>
            </div>

            <div id="sudoku-live-area" style="display:none; gap:16px; height:calc(100% - 58px); min-height:0;">
              <div style="flex:1; min-width:520px; display:flex; flex-direction:column; gap:12px; min-height:0;">
                <div class="glass-panel" style="padding:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                  <div style="font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#6c5ce7;">Interactive Board</div>

                  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <div class="glass-panel" style="height:44px; padding:0 14px; display:flex; align-items:center; gap:8px; border-radius:14px;">
                      <i class="fa-regular fa-clock" style="color:#6c5ce7;"></i>
                      <strong id="sudoku-timer">00:00</strong>
                    </div>
                    <button id="sudoku-end" class="btn-icon" title="End Game">
                      <i class="fa-solid fa-flag-checkered"></i>
                    </button>
                    <button id="sudoku-next" class="btn-primary" style="height:44px; display:flex; align-items:center; justify-content:center; opacity:.7;">
                      <i class="fa-solid fa-forward"></i> Next Puzzle
                    </button>
                  </div>
                </div>

                <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center;">
                  <div id="sudoku-board-panel" class="glass-panel" style="width:min(100%, 700px); height:100%; max-width:100%; max-height:100%; padding:14px; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                      <div style="font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#6c5ce7;">Shared Puzzle Surface</div>
                      <div id="sudoku-hint" style="font-size:.9rem; opacity:.74;">Pick a difficulty and press Start to generate a random puzzle.</div>
                    </div>

                    <div id="sudoku-board-stage" style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                      <div id="sudoku-board" style="display:grid; grid-template-columns:repeat(9, 1fr); border:2px solid rgba(108,92,231,.32); border-radius:18px; overflow:hidden; background:rgba(255,255,255,.8);"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div style="width:360px; display:flex; flex-direction:column; gap:12px;">
                <div class="glass-panel" style="padding:14px;">
                  <div style="font-weight:800; margin-bottom:8px;">Puzzle Stats</div>
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Round</span>
                    <strong id="sudoku-round-value">-</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Difficulty</span>
                    <strong data-sudoku-difficulty>Medium</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Filled</span>
                    <strong id="sudoku-filled-value">0 / 81</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px;">
                    <span style="opacity:.75;">Mistakes</span>
                    <strong id="sudoku-mistakes-value">0</strong>
                  </div>
                </div>

                <div class="glass-panel" style="padding:14px;">
                  <div style="font-weight:800; margin-bottom:8px;">Leaderboard</div>
                  <div data-sudoku-scoreboard style="max-height:140px; overflow:auto;">-</div>
                </div>

                <div class="glass-panel" style="padding:14px;">
                  <div style="font-weight:800; margin-bottom:10px;">Keypad</div>
                  <div id="sudoku-keypad" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;"></div>
                </div>

                <div class="glass-panel" style="padding:14px; flex:1;">
                  <div style="font-weight:800; margin-bottom:8px;">Controls</div>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                    <span class="status-pill online" style="font-size:.78rem;">Click Cell</span>
                    <span class="status-pill online" style="font-size:.78rem;">Type 1-9</span>
                    <span class="status-pill online" style="font-size:.78rem;">Erase</span>
                  </div>
                  <div style="opacity:.76; line-height:1.6; font-size:.95rem;">
                    This stage uses shared room state. Everyone in the room sees the same puzzle, the same progress, and the same scoreboard.
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        const backBtn = gamesRoot.querySelector('#sudoku-back');
        const waitStartBtn = gamesRoot.querySelector('#sudoku-wait-start');
        const nextBtn = gamesRoot.querySelector('#sudoku-next');
        const endBtn = gamesRoot.querySelector('#sudoku-end');

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                cleanup();
                if (typeof window.initArcadeGames !== 'function') return;
                window.initArcadeGames({ socket, showToast, getCurrentUser, getCurrentRoomId });
            });
        }

        if (waitStartBtn) {
            waitStartBtn.addEventListener('click', handleStart);
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', handleNextPuzzle);
        }

        if (endBtn) {
            endBtn.addEventListener('click', handleEndGame);
        }

        renderDifficultyButtons();
        setStartedUI(false);
        refreshStartAvailability();
        renderBoard();
        renderKeypad();
        renderLeaderboard();
        renderMeta();
        syncBoardSize();
    }

    renderShell();
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('resize', syncBoardSize);
    if (socket && typeof socket.on === 'function') {
        Object.entries(socketListeners).forEach(([eventName, handler]) => {
            socket.on(eventName, handler);
        });
    }
    requestSudokuState();
}

window.mountSudokuGame = mountSudokuGame;
