function mountSudokuGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    if (typeof window.cleanupLinkMatchGame === 'function') {
        window.cleanupLinkMatchGame();
    }
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
    let viewerPlayerId = getCurrentPlayerKey();
    let viewerScore = 0;

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
        window.removeEventListener('resize', syncSudokuLayout);
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

    function getCurrentPlayerKey() {
        const user = getCurrentUser ? getCurrentUser() : null;
        return user && user.id ? String(user.id) : (socket ? socket.id : null);
    }

    function findCurrentLeaderboardEntry() {
        const playerKey = viewerPlayerId || getCurrentPlayerKey();
        const displayName = getDisplayName();
        const user = getCurrentUser ? getCurrentUser() : null;
        const username = user && user.username ? String(user.username) : '';

        return leaderboard.find((item) => (
            item &&
            (
                item.id === playerKey ||
                item.name === displayName ||
                (!!username && item.name === username)
            )
        )) || null;
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
        viewerPlayerId = getCurrentPlayerKey();
        viewerScore = 0;
        setStartedUI(false);
        renderBoard();
        syncSudokuLayout();
        renderMeta();
        renderKeypad();
        renderLeaderboard();
    }

    function setStartedUI(active) {
        const waitingEl = gamesRoot.querySelector('#sudoku-waiting');
        const liveAreaEl = gamesRoot.querySelector('#sudoku-live-area');
        const nextBtn = gamesRoot.querySelector('#sudoku-next');
        const endBtn = gamesRoot.querySelector('#sudoku-end');

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

        if (endBtn) {
            endBtn.style.display = active ? 'flex' : 'none';
            endBtn.style.opacity = active ? '1' : '.7';
        }

        syncSudokuLayout();
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
                waitHintEl.innerText = 'Join a room.';
            } else if (!socket || !socket.connected) {
                waitHintEl.innerText = 'Connect to server.';
            } else {
                waitHintEl.innerText = 'Ready to start.';
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

    function resetSudokuScores(notify = false) {
        const roomId = getJoinedRoomId();
        const nickname = getDisplayName();
        const refreshBtn = gamesRoot.querySelector('#sudoku-refresh-scores');
        const refreshIcon = refreshBtn ? refreshBtn.querySelector('i') : null;

        if (!roomId) {
            if (notify) showToast('Please join a room first');
            return;
        }

        if (!socket || !socket.connected || !nickname) {
            if (notify) showToast('Server connection is required for Sudoku.');
            return;
        }

        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.style.opacity = '.7';
        }

        if (refreshIcon) {
            refreshIcon.style.transition = 'transform .35s ease';
            refreshIcon.style.transform = 'rotate(180deg)';
        }

        socket.emit('sudoku-set-profile', { roomId, nickname });
        socket.emit('sudoku-reset-scores');

        setTimeout(() => {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '1';
            }
            if (refreshIcon) {
                refreshIcon.style.transform = 'rotate(0deg)';
            }
        }, 450);
    }

    function applyServerState(state) {
        if (!state) return;

        const joinedRoomId = getJoinedRoomId();
        if (state.roomId && joinedRoomId && state.roomId !== joinedRoomId) {
            return;
        }

        if (state.currentPlayerId) {
            viewerPlayerId = String(state.currentPlayerId);
        }
        if (state.currentPlayerScore !== null && state.currentPlayerScore !== undefined) {
            viewerScore = Number(state.currentPlayerScore || 0);
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
        syncSudokuLayout();
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
                  border:none;
                  border-right:1px solid rgba(108,92,231,.12);
                  border-bottom:1px solid rgba(108,92,231,.12);
                  ${blockEdge}
                  ${rowEdge}
                  background:${background};
                  color:${textColor};
                  font-size:var(--sudoku-cell-size, 1.35rem);
                  font-weight:${fontWeight};
                  cursor:pointer;
                  width:100%;
                  height:100%;
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

        syncSudokuLayout();
    }

    function syncBoardSize() {
        const boardEl = gamesRoot.querySelector('#sudoku-board');
        const boardStageEl = gamesRoot.querySelector('#sudoku-board-stage');
        
        if (!boardEl || !boardStageEl) return;
        if (boardStageEl.offsetParent === null) return;

        const availableWidth = Math.max(220, boardStageEl.clientWidth);
        const availableHeight = Math.max(220, boardStageEl.clientHeight);
        const boardWidth = Math.floor(availableWidth);
        const boardHeight = Math.floor(availableHeight);
        const cellFontSize = Math.max(18, Math.floor((Math.min(boardWidth / 9, boardHeight / 9)) * 0.42));

        boardEl.style.width = `${boardWidth}px`;
        boardEl.style.height = `${boardHeight}px`;
        boardEl.style.maxWidth = '100%';
        boardEl.style.maxHeight = '100%';
        boardEl.style.setProperty('--sudoku-cell-size', `${cellFontSize}px`);
    }

    function syncLiveLayoutScale() {
        const liveFrameEl = gamesRoot.querySelector('#sudoku-live-area');
        const liveInnerEl = gamesRoot.querySelector('#sudoku-live-scale-inner');
        const liveContentEl = gamesRoot.querySelector('#sudoku-live-scale-content');
        const sideColumnEl = gamesRoot.querySelector('#sudoku-live-scale-content .game-side-column');

        if (!liveFrameEl || !liveInnerEl || !liveContentEl) return;
        if (liveFrameEl.offsetParent === null) return;

        const isCompactLayout = window.matchMedia('(max-width: 767px)').matches;
        const baseWidth = 1180;

        if (sideColumnEl) {
            sideColumnEl.style.width = isCompactLayout ? '100%' : '360px';
            sideColumnEl.style.maxWidth = '100%';
        }

        liveInnerEl.style.height = isCompactLayout ? 'auto' : '100%';
        liveContentEl.style.flexDirection = isCompactLayout ? 'column' : 'row';
        liveContentEl.style.width = isCompactLayout ? '100%' : `${baseWidth}px`;
        liveContentEl.style.maxWidth = 'none';
        liveContentEl.style.transform = 'none';

        if (isCompactLayout) {
            liveFrameEl.style.height = 'auto';
            return;
        }

        const availableWidth = Math.max(320, liveFrameEl.clientWidth);
        const scale = availableWidth / baseWidth;
        const naturalHeight = liveContentEl.scrollHeight || liveContentEl.offsetHeight || 0;

        liveContentEl.style.transform = `scale(${scale})`;
        liveFrameEl.style.height = `${Math.ceil(naturalHeight * scale)}px`;
    }

    function syncSudokuLayout() {
        syncBoardSize();
        syncLiveLayoutScale();
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
                  transform:translateY(0);
                  transition:transform .16s, box-shadow .16s, background .16s, color .16s;
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
              box-shadow:0 4px 12px rgba(0,0,0,.05);
              transform:translateY(0);
              transition:transform .16s, box-shadow .16s, background .16s;
            "
          >
            <i class="fa-solid fa-eraser"></i> Erase
          </button>
        `;

        const keyButtons = keypadEl.querySelectorAll('.sudoku-key-btn');
        keyButtons.forEach((button) => {
            button.addEventListener('mouseenter', () => {
                button.style.background = 'rgba(108,92,231,.14)';
                button.style.color = 'var(--primary-color)';
                button.style.transform = 'translateY(-1px)';
                button.style.boxShadow = '0 10px 22px rgba(108,92,231,.18)';
            });
            button.addEventListener('mouseleave', () => {
                button.style.background = 'white';
                button.style.color = 'var(--text-main)';
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 4px 12px rgba(0,0,0,.05)';
            });
            button.addEventListener('click', () => {
                applyValue(button.dataset.value);
            });
        });

        const eraseBtn = keypadEl.querySelector('#sudoku-erase');
        if (eraseBtn) {
            eraseBtn.addEventListener('mouseenter', () => {
                eraseBtn.style.background = 'rgba(255,118,117,.16)';
                eraseBtn.style.transform = 'translateY(-1px)';
                eraseBtn.style.boxShadow = '0 10px 22px rgba(255,118,117,.16)';
            });
            eraseBtn.addEventListener('mouseleave', () => {
                eraseBtn.style.background = 'rgba(255,255,255,.9)';
                eraseBtn.style.transform = 'translateY(0)';
                eraseBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,.05)';
            });
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
            const currentEntry = findCurrentLeaderboardEntry();

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
                const isSelf = !!currentEntry && (
                    row.id === currentEntry.id ||
                    row.name === currentEntry.name
                );
                left.textContent = `#${index + 1} ${isSelf ? 'You' : (row.name || 'Guest')}`;

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
            scoreEl.textContent = String(viewerScore);
        }

        if (hintEl) {
            if (!started) {
                hintEl.textContent = 'Waiting';
            } else if (completed) {
                hintEl.textContent = 'Solved';
            } else if (selectedIndex === null) {
                hintEl.textContent = 'Pick a cell';
            } else if (fixed[selectedIndex]) {
                hintEl.textContent = 'Fixed clue';
            } else {
                hintEl.textContent = 'Editing';
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
          <div id="sudoku-shell" class="glass-panel game-shell game-shell--sudoku">
            <div class="game-header">
              <div class="game-header-main">
                <div class="game-title">
                  <i class="fa-solid fa-table-cells-large"></i> Sudoku
                </div>
                <div id="sudoku-status" class="status-pill offline">Ready</div>
              </div>

              <div class="game-header-actions">
                <button id="sudoku-next" class="btn-primary game-action-primary" type="button" style="opacity:.7;">
                  <i class="fa-solid fa-forward"></i> Next Puzzle
                </button>
                <button id="sudoku-end" class="btn-icon" title="End Game" type="button">
                  <i class="fa-solid fa-flag-checkered"></i>
                </button>
                <button id="sudoku-back" class="btn-icon" title="Back to Arcade" type="button">
                  <i class="fa-solid fa-arrow-left"></i>
                </button>
              </div>
            </div>

            <div id="sudoku-waiting" class="glass-panel game-wait-screen">
              <div class="game-wait-card">
                <div class="game-wait-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
                <div class="game-wait-title">Waiting</div>
                <div id="sudoku-wait-hint" class="game-wait-copy">Please join a room first.</div>

                <div class="glass-panel game-sidebar-panel game-wait-metrics">
                  <div class="game-meta-row">
                    <span class="game-meta-label">Player</span>
                    <strong id="sudoku-player-value">-</strong>
                  </div>
                  <div class="game-meta-row">
                    <span class="game-meta-label">Room</span>
                    <strong id="sudoku-room-value">-</strong>
                  </div>
                  <div class="game-meta-row">
                    <span class="game-meta-label">Difficulty</span>
                    <strong data-sudoku-difficulty>Medium</strong>
                  </div>
                  <div class="game-meta-row">
                    <span class="game-meta-label">Score</span>
                    <strong id="sudoku-score-value">0</strong>
                  </div>
                  <div class="game-wait-actions">
                    <button id="sudoku-wait-start" class="btn-primary game-action-primary game-action-wide" type="button">
                      <i class="fa-solid fa-play"></i> Start
                    </button>
                  </div>
                </div>

                <div class="glass-panel game-sidebar-panel game-panel-stack">
                  <div class="game-panel-title">Difficulty</div>
                  <div id="sudoku-difficulty-buttons" class="sudoku-difficulty-wrap"></div>
                </div>

                <div class="glass-panel game-sidebar-panel game-panel-stack">
                  <div class="game-panel-header">
                    <div class="game-panel-title">Leaderboard</div>
                    <button id="sudoku-refresh-scores" class="btn-icon" title="Reset Scores" type="button">
                      <i class="fa-solid fa-rotate-right"></i>
                    </button>
                  </div>
                  <div data-sudoku-scoreboard class="game-scoreboard">-</div>
                </div>
              </div>
            </div>

            <div id="sudoku-live-area" class="sudoku-live-scale-frame" style="display:none;">
              <div id="sudoku-live-scale-inner" class="sudoku-live-scale-inner">
                <div id="sudoku-live-scale-content" class="game-live-layout sudoku-live-scale-content">
                  <div class="game-stage-column">
                  <div id="sudoku-board-panel" class="game-stage-panel">
                    <div class="glass-panel game-stage-toolbar">
                      <div class="game-stage-label">
                        <i class="fa-solid fa-table-cells"></i>
                        <span>Puzzle Board</span>
                      </div>
                      <div id="sudoku-hint" class="status-pill online sudoku-hint-pill">Waiting</div>
                    </div>

                    <div class="sudoku-stage-shell">
                      <div id="sudoku-board-stage" class="sudoku-board-stage">
                        <div id="sudoku-board" class="sudoku-board-grid"></div>
                      </div>
                    </div>
                  </div>
                </div>

                  <div class="game-side-column">
                  <div class="glass-panel game-sidebar-panel">
                    <div class="game-panel-title">Puzzle Stats</div>
                    <div class="game-meta-row">
                      <span class="game-meta-label">Timer</span>
                      <strong id="sudoku-timer">00:00</strong>
                    </div>
                    <div class="game-meta-row">
                      <span class="game-meta-label">Round</span>
                      <strong id="sudoku-round-value">-</strong>
                    </div>
                    <div class="game-meta-row">
                      <span class="game-meta-label">Difficulty</span>
                      <strong data-sudoku-difficulty>Medium</strong>
                    </div>
                    <div class="game-meta-row">
                      <span class="game-meta-label">Filled</span>
                      <strong id="sudoku-filled-value">0 / 81</strong>
                    </div>
                    <div class="game-meta-row">
                      <span class="game-meta-label">Mistakes</span>
                      <strong id="sudoku-mistakes-value">0</strong>
                    </div>
                  </div>

                  <div class="glass-panel game-sidebar-panel">
                    <div class="game-panel-title">Keypad</div>
                    <div id="sudoku-keypad" class="sudoku-keypad-grid"></div>
                  </div>

                  <div class="glass-panel game-sidebar-panel">
                    <div class="game-panel-title">Leaderboard</div>
                    <div data-sudoku-scoreboard class="game-scoreboard">-</div>
                  </div>

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
        const refreshScoresBtn = gamesRoot.querySelector('#sudoku-refresh-scores');

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

        if (refreshScoresBtn) {
            refreshScoresBtn.addEventListener('click', () => {
                resetSudokuScores(true);
            });
        }

        renderDifficultyButtons();
        setStartedUI(false);
        refreshStartAvailability();
        renderBoard();
        renderKeypad();
        renderLeaderboard();
        renderMeta();
        syncSudokuLayout();
    }

    renderShell();
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('resize', syncSudokuLayout);
    if (socket && typeof socket.on === 'function') {
        Object.entries(socketListeners).forEach(([eventName, handler]) => {
            socket.on(eventName, handler);
        });
    }
    requestSudokuState();
}

window.mountSudokuGame = mountSudokuGame;
