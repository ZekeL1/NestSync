function mountLinkMatchGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    if (typeof window.cleanupSudokuGame === 'function') {
        window.cleanupSudokuGame();
    }
    if (typeof window.cleanupPictionaryGame === 'function') {
        window.cleanupPictionaryGame();
    }
    if (typeof window.cleanupLinkMatchGame === 'function') {
        window.cleanupLinkMatchGame();
    }

    const MIN_VIEWPORT_PX = 1024;
    const LINK_ICONS = [
        'fa-star', 'fa-heart', 'fa-bolt', 'fa-cloud', 'fa-sun', 'fa-moon',
        'fa-snowflake', 'fa-leaf', 'fa-seedling', 'fa-fish', 'fa-cat', 'fa-dog',
        'fa-apple-whole', 'fa-car', 'fa-house', 'fa-gift', 'fa-flag', 'fa-key',
        'fa-bell', 'fa-anchor', 'fa-music', 'fa-shield', 'fa-crown', 'fa-gem',
        'fa-umbrella', 'fa-tree', 'fa-pizza-slice', 'fa-mug-hot', 'fa-plane',
        'fa-book', 'fa-compass', 'fa-feather', 'fa-fire', 'fa-ghost', 'fa-hand-spock',
    ];

    const LINK_TILE_COLORS = [
        '#6c5ce7', '#e17055', '#00b894', '#fdcb6e', '#0984e3', '#d63031',
        '#a29bfe', '#e84393', '#00cec9', '#fd79a8', '#e67e22', '#74b9ff',
        '#55efc4', '#fab1a0', '#ffeaa7', '#636e72', '#2d3436', '#b2bec3',
        '#d35400', '#16a085', '#8e44ad', '#c0392b', '#2980b9', '#27ae60',
    ];

    const EMPTY = -1;
    const CELL_VOID = -2;
    let cols = 12;
    let rows = 7;
    let localTiles = [];
    let roundId = 0;
    let serverStarted = false;
    let serverFinished = false;
    let winnerId = null;
    let winnerName = null;
    let selectedIdx = null;
    let locked = false;
    let pathAnimating = false;
    let activeRoomId = null;

    const socketHandlers = {
        connect: () => {
            requestState();
            renderAll();
        },
        disconnect: () => renderAll(),
        'room-joined': () => {
            activeRoomId = getJoinedRoomId();
            syncProfile();
            requestState();
            renderAll();
        },
        'room-left': () => {
            activeRoomId = null;
            resetLocalBoard();
            renderAll();
        },
        'linkmatch-state': (state) => applyServerState(state),
        'linkmatch-round-started': (payload) => {
            applyRoundPayload(payload);
            showToast(`${payload.startedBy || 'Someone'} started a Link Match round`);
        },
        'linkmatch-round-ended': (payload) => {
            locked = true;
            serverFinished = true;
            winnerId = payload.winnerId || null;
            winnerName = payload.winnerName || '';
            const me = getCurrentPlayerKey();
            if (me && payload.winnerId === me) {
                showToast('You cleared the board first — you win!');
            } else {
                showToast(`${payload.winnerName || 'Opponent'} finished first — round over`);
            }
            renderAll();
        },
        'linkmatch-reset': (payload) => {
            showToast(`${payload.endedBy || 'Someone'} reset Link Match`);
            resetLocalBoard();
            applyServerState({
                roomId: payload.roomId,
                started: false,
                finished: false,
                winnerId: null,
                winnerName: null,
                cols,
                rows,
                tiles: [],
                roundId: 0,
                startedAt: null,
            });
        },
        'linkmatch-error': ({ message }) => {
            if (message) showToast(message);
        },
    };

    function cleanup() {
        clearPathOverlay();
        window.removeEventListener('resize', onResize);
        if (socket && typeof socket.off === 'function') {
            Object.entries(socketHandlers).forEach(([event, handler]) => {
                socket.off(event, handler);
            });
        }
        if (window.cleanupLinkMatchGame === cleanup) {
            delete window.cleanupLinkMatchGame;
        }
    }

    window.cleanupLinkMatchGame = cleanup;

    function getDisplayName() {
        const user = getCurrentUser ? getCurrentUser() : null;
        return user ? (user.nickname || user.username || 'Guest') : 'Guest';
    }

    function getCurrentPlayerKey() {
        const user = getCurrentUser ? getCurrentUser() : null;
        return user && user.id ? String(user.id) : (socket ? socket.id : null);
    }

    function getJoinedRoomId() {
        const roomId = getCurrentRoomId ? getCurrentRoomId() : null;
        return roomId ? String(roomId).trim() : null;
    }

    function isViewportAllowed() {
        return window.matchMedia(`(min-width: ${MIN_VIEWPORT_PX}px)`).matches;
    }

    function onResize() {
        if (!gamesRoot.querySelector('#linkmatch-shell')) return;
        renderGateOrGame();
    }

    function syncProfile() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) return false;
        socket.emit('linkmatch-set-profile', { roomId, nickname: getDisplayName() });
        return true;
    }

    function requestState() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) return;
        syncProfile();
        socket.emit('linkmatch-request-state', { roomId, nickname: getDisplayName() });
    }

    function buildPadded(flat, c, r) {
        const W = c + 2;
        const H = r + 2;
        const g = Array.from({ length: H }, () => Array(W).fill(EMPTY));
        let i = 0;
        for (let rr = 1; rr <= r; rr += 1) {
            for (let cc = 1; cc <= c; cc += 1) {
                g[rr][cc] = flat[i];
                i += 1;
            }
        }
        return g;
    }

    function canLinkPair(padded, r1, c1, r2, c2) {
        if (padded[r1][c1] !== padded[r2][c2] || padded[r1][c1] < 0) return false;
        const work = padded.map((row) => row.slice());
        work[r1][c1] = EMPTY;
        work[r2][c2] = EMPTY;

        function rowClear(rr, cA, cB) {
            const lo = Math.min(cA, cB);
            const hi = Math.max(cA, cB);
            for (let c = lo; c <= hi; c += 1) {
                if (work[rr][c] >= 0) return false;
            }
            return true;
        }

        function colClear(cc, rA, rB) {
            const lo = Math.min(rA, rB);
            const hi = Math.max(rA, rB);
            for (let rr = lo; rr <= hi; rr += 1) {
                if (work[rr][cc] >= 0) return false;
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

    function findLinkPath(padded, r1, c1, r2, c2) {
        if (padded[r1][c1] !== padded[r2][c2] || padded[r1][c1] < 0) return null;
        const work = padded.map((row) => row.slice());
        work[r1][c1] = EMPTY;
        work[r2][c2] = EMPTY;

        function rowClear(rr, cA, cB) {
            const lo = Math.min(cA, cB);
            const hi = Math.max(cA, cB);
            for (let c = lo; c <= hi; c += 1) {
                if (work[rr][c] >= 0) return false;
            }
            return true;
        }

        function colClear(cc, rA, rB) {
            const lo = Math.min(rA, rB);
            const hi = Math.max(rA, rB);
            for (let rr = lo; rr <= hi; rr += 1) {
                if (work[rr][cc] >= 0) return false;
            }
            return true;
        }

        if (r1 === r2 && rowClear(r1, c1, c2)) return [[r1, c1], [r1, c2]];
        if (c1 === c2 && colClear(c1, r1, r2)) return [[r1, c1], [r2, c1]];

        if (work[r1][c2] < 0 && rowClear(r1, c1, c2) && colClear(c2, r1, r2)) {
            return [[r1, c1], [r1, c2], [r2, c2]];
        }
        if (work[r2][c1] < 0 && rowClear(r2, c1, c2) && colClear(c1, r1, r2)) {
            return [[r1, c1], [r2, c1], [r2, c2]];
        }

        const w = work[0].length;
        const h = work.length;
        for (let x = 0; x < w; x += 1) {
            if (work[r1][x] < 0 && work[r2][x] < 0) {
                if (rowClear(r1, c1, x) && colClear(x, r1, r2) && rowClear(r2, x, c2)) {
                    return [[r1, c1], [r1, x], [r2, x], [r2, c2]];
                }
            }
        }
        for (let y = 0; y < h; y += 1) {
            if (work[y][c1] < 0 && work[y][c2] < 0) {
                if (colClear(c1, r1, y) && rowClear(y, c1, c2) && colClear(c2, y, r2)) {
                    return [[r1, c1], [y, c1], [y, c2], [r2, c2]];
                }
            }
        }
        return null;
    }

    function clearPathOverlay() {
        const svg = gamesRoot.querySelector('#linkmatch-path-svg');
        if (svg) svg.innerHTML = '';
    }

    /** Force pixel polyline to axis-aligned segments (horizontal first, then vertical if needed). */
    function toStrictOrthogonalPixelPath(raw) {
        if (raw.length < 2) return raw;
        const EPS = 2.5;
        const out = [{ x: raw[0].x, y: raw[0].y }];
        for (let i = 1; i < raw.length; i += 1) {
            const px = out[out.length - 1].x;
            const py = out[out.length - 1].y;
            const x = raw[i].x;
            const y = raw[i].y;
            const dx = x - px;
            const dy = y - py;
            if (Math.abs(dx) < EPS) {
                out.push({ x: px, y });
            } else if (Math.abs(dy) < EPS) {
                out.push({ x, y: py });
            } else {
                out.push({ x, y: py });
                out.push({ x, y });
            }
        }
        const deduped = [];
        out.forEach((p) => {
            const q = deduped[deduped.length - 1];
            if (!q || Math.abs(p.x - q.x) > 0.4 || Math.abs(p.y - q.y) > 0.4) {
                deduped.push(p);
            }
        });
        return deduped;
    }

    function buildOrthogonalLineElements(orth) {
        const parts = [];
        for (let i = 0; i < orth.length - 1; i += 1) {
            const a = orth[i];
            const b = orth[i + 1];
            const dx = Math.abs(b.x - a.x);
            const dy = Math.abs(b.y - a.y);
            if (dx < 0.08 && dy < 0.08) continue;
            if (dx < 0.08 || dy < 0.08) {
                parts.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" />`);
            }
        }
        return parts.join('');
    }

    function paddedCellToFlat(pr, pc) {
        return (pr - 1) * cols + (pc - 1);
    }

    /** Walk from (r1,c1) to (r2,c2) along a straight row or column (inclusive). */
    function cellsOnOrthogonalSegment(r1, c1, r2, c2) {
        if (r1 === r2) {
            const out = [];
            if (c1 <= c2) for (let c = c1; c <= c2; c += 1) out.push([r1, c]);
            else for (let c = c1; c >= c2; c -= 1) out.push([r1, c]);
            return out;
        }
        if (c1 === c2) {
            const out = [];
            if (r1 <= r2) for (let r = r1; r <= r2; r += 1) out.push([r, c1]);
            else for (let r = r1; r >= r2; r -= 1) out.push([r, c1]);
            return out;
        }
        return [];
    }

    function expandWaypointsToCellSequence(waypoints) {
        if (!waypoints || waypoints.length < 2) return [];
        const cells = [];
        for (let w = 0; w < waypoints.length - 1; w += 1) {
            const [ra, ca] = waypoints[w];
            const [rb, cb] = waypoints[w + 1];
            const seg = cellsOnOrthogonalSegment(ra, ca, rb, cb);
            if (!seg.length) return [];
            if (cells.length) {
                const last = cells[cells.length - 1];
                const first = seg[0];
                if (last[0] === first[0] && last[1] === first[1]) seg.shift();
            }
            cells.push(...seg);
        }
        return cells;
    }

    function cellCenterPixel(pr, pc, grid, wbr) {
        const idx = paddedCellToFlat(pr, pc);
        const el = grid.children[idx];
        if (!el) return null;
        const er = el.getBoundingClientRect();
        return {
            x: er.left + er.width / 2 - wbr.left,
            y: er.top + er.height / 2 - wbr.top,
        };
    }

    /** Pixel center for padded coords (1,1)=first tile; includes outer padding ring used by link paths. */
    function pixelForPaddedCell(pr, pc, grid, wbr) {
        if (pr >= 1 && pr <= rows && pc >= 1 && pc <= cols) {
            return cellCenterPixel(pr, pc, grid, wbr);
        }
        const o = cellCenterPixel(1, 1, grid, wbr);
        const right = cellCenterPixel(1, Math.min(2, cols), grid, wbr);
        const down = cellCenterPixel(Math.min(2, rows), 1, grid, wbr);
        if (!o) return null;
        const stepX = right ? right.x - o.x : 0;
        const stepY = down ? down.y - o.y : 0;
        if (!stepX && !stepY) return null;
        return {
            x: o.x + (pc - 1) * stepX,
            y: o.y + (pr - 1) * stepY,
        };
    }

    function boundaryPointOnCellFacingPadded(fromPr, fromPc, toPr, toPc, grid, wbr) {
        const fromIdx = paddedCellToFlat(fromPr, fromPc);
        const fromEl = grid.children[fromIdx];
        if (!fromEl) return null;
        const toPt = pixelForPaddedCell(toPr, toPc, grid, wbr);
        if (!toPt) return null;
        const a = fromEl.getBoundingClientRect();
        const acx = a.left + a.width / 2;
        const acy = a.top + a.height / 2;
        const toVx = toPt.x + wbr.left;
        const toVy = toPt.y + wbr.top;
        const dx = toVx - acx;
        const dy = toVy - acy;
        const hw = a.width / 2;
        const hh = a.height / 2;
        let lx;
        let ly;
        if (Math.abs(dx) >= Math.abs(dy)) {
            lx = acx + Math.sign(dx || 1) * hw;
            ly = acy;
        } else {
            lx = acx;
            ly = acy + Math.sign(dy || 1) * hh;
        }
        return { x: lx - wbr.left, y: ly - wbr.top };
    }

    /**
     * Draw only through blank cells (void / hole / cleared / outer padding): tile endpoints use edge
     * points facing the path; interior uses centers for passable cells (including padding ring).
     */
    function buildPixelPathThroughBlankCellsOnly(seq, i1, i2, grid, wbr) {
        if (seq.length < 2) return [];
        const flatAt = (j) => paddedCellToFlat(seq[j][0], seq[j][1]);
        const n = seq.length;
        if (flatAt(0) !== i1 || flatAt(n - 1) !== i2) return [];

        const isInteriorPassable = (j) => {
            const idx = flatAt(j);
            if (idx < 0 || idx >= localTiles.length) return true;
            return localTiles[idx] < 0;
        };

        const pixels = [];
        const [r0, c0] = seq[0];
        pixels.push(boundaryPointOnCellFacingPadded(r0, c0, seq[1][0], seq[1][1], grid, wbr));

        for (let j = 1; j < n - 1; j += 1) {
            if (!isInteriorPassable(j)) continue;
            const [pr, pc] = seq[j];
            const p = pixelForPaddedCell(pr, pc, grid, wbr);
            if (p) pixels.push(p);
        }

        const [rL, cL] = seq[n - 1];
        pixels.push(boundaryPointOnCellFacingPadded(rL, cL, seq[n - 2][0], seq[n - 2][1], grid, wbr));
        return pixels.filter(Boolean);
    }

    function drawMatchPath(i1, i2, onDone) {
        const padded = buildPadded(localTiles, cols, rows);
        const r1 = Math.floor(i1 / cols) + 1;
        const c1 = (i1 % cols) + 1;
        const r2 = Math.floor(i2 / cols) + 1;
        const c2 = (i2 % cols) + 1;
        const waypoints = findLinkPath(padded, r1, c1, r2, c2);
        const wrap = gamesRoot.querySelector('.linkmatch-board-wrap');
        const grid = gamesRoot.querySelector('#linkmatch-grid');
        if (!waypoints || !wrap || !grid) {
            onDone();
            return;
        }

        const wbr = wrap.getBoundingClientRect();
        const bw = Math.max(1, wbr.width);
        const bh = Math.max(1, wbr.height);

        const cellSeq = expandWaypointsToCellSequence(waypoints);
        const points = buildPixelPathThroughBlankCellsOnly(cellSeq, i1, i2, grid, wbr);

        if (points.length < 2) {
            onDone();
            return;
        }

        const orth = toStrictOrthogonalPixelPath(points);
        const lineMarkup = buildOrthogonalLineElements(orth);
        if (!lineMarkup) {
            onDone();
            return;
        }

        const strokeColor = colorForTileId(localTiles[i1]) || '#6c5ce7';

        let svg = gamesRoot.querySelector('#linkmatch-path-svg');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('id', 'linkmatch-path-svg');
            svg.setAttribute('class', 'linkmatch-path-svg');
            svg.setAttribute('preserveAspectRatio', 'none');
            wrap.appendChild(svg);
        }

        svg.setAttribute('width', String(bw));
        svg.setAttribute('height', String(bh));
        svg.setAttribute('viewBox', `0 0 ${bw} ${bh}`);

        svg.innerHTML = `<g class="linkmatch-path-line" fill="none" stroke="${strokeColor}" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="3">${lineMarkup}</g>`;

        setTimeout(() => {
            clearPathOverlay();
            if (typeof onDone === 'function') onDone();
        }, 400);
    }

    function canLinkIndices(i1, i2) {
        if (i1 === i2) return false;
        if (localTiles[i1] < 0 || localTiles[i2] < 0) return false;
        if (localTiles[i1] !== localTiles[i2]) return false;
        const padded = buildPadded(localTiles, cols, rows);
        const r1 = Math.floor(i1 / cols) + 1;
        const c1 = (i1 % cols) + 1;
        const r2 = Math.floor(i2 / cols) + 1;
        const c2 = (i2 % cols) + 1;
        return canLinkPair(padded, r1, c1, r2, c2);
    }

    function remainingCount() {
        return localTiles.filter((v) => v >= 0).length;
    }

    function applyRoundPayload(payload) {
        if (!payload || !Array.isArray(payload.tiles)) return;
        cols = Number(payload.cols) || cols;
        rows = Number(payload.rows) || rows;
        localTiles = payload.tiles.slice();
        roundId = payload.roundId || roundId + 1;
        serverStarted = true;
        serverFinished = false;
        locked = false;
        winnerId = null;
        winnerName = null;
        selectedIdx = null;
        renderAll();
    }

    function applyServerState(state) {
        if (!state) return;
        if (state.roomId) {
            activeRoomId = state.roomId;
        }
        serverStarted = !!state.started;
        serverFinished = !!state.finished;
        winnerId = state.winnerId || null;
        winnerName = state.winnerName || null;
        locked = serverFinished;

        if (state.cols) cols = state.cols;
        if (state.rows) rows = state.rows;

        if (serverStarted && Array.isArray(state.tiles) && state.tiles.length === cols * rows) {
            if (state.roundId > roundId || localTiles.length !== state.tiles.length) {
                localTiles = state.tiles.slice();
                roundId = state.roundId || roundId;
                selectedIdx = null;
            }
        }

        if (!serverStarted) {
            resetLocalBoard();
        }

        renderAll();
    }

    function resetLocalBoard(clearRound) {
        localTiles = [];
        selectedIdx = null;
        if (clearRound !== false) {
            roundId = 0;
            serverStarted = false;
            serverFinished = false;
            locked = false;
            winnerId = null;
            winnerName = null;
        }
    }

    function handleCellClick(index) {
        if (pathAnimating || locked || !serverStarted || serverFinished) return;
        if (localTiles[index] < 0) return;

        if (selectedIdx === null) {
            selectedIdx = index;
            renderGrid();
            return;
        }

        if (selectedIdx === index) {
            selectedIdx = null;
            renderGrid();
            return;
        }

        if (canLinkIndices(selectedIdx, index)) {
            const a = selectedIdx;
            const b = index;
            selectedIdx = null;
            pathAnimating = true;
            renderGrid();
            drawMatchPath(a, b, () => {
                pathAnimating = false;
                if (!gamesRoot.querySelector('#linkmatch-grid')) return;
                localTiles[a] = EMPTY;
                localTiles[b] = EMPTY;
                renderGrid();
                if (remainingCount() === 0) {
                    submitWin();
                }
            });
            return;
        }

        if (localTiles[selectedIdx] === localTiles[index]) {
            selectedIdx = index;
            renderGrid();
            showToast('These tiles cannot be linked with at most two bends');
        } else {
            selectedIdx = index;
            renderGrid();
        }
    }

    function submitWin() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) return;
        syncProfile();
        socket.emit('linkmatch-finish', { roomId, nickname: getDisplayName() });
    }

    function handleStart() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) {
            showToast('Join a room first');
            return;
        }
        syncProfile();
        socket.emit('linkmatch-start', {
            roomId,
            nickname: getDisplayName(),
            cols: 12,
            rows: 7,
        });
    }

    function handleReset() {
        const roomId = getJoinedRoomId();
        if (!roomId || !socket || !socket.connected) {
            showToast('Join a room first');
            return;
        }
        syncProfile();
        socket.emit('linkmatch-reset', { roomId, nickname: getDisplayName() });
    }

    function backToArcade() {
        cleanup();
        if (typeof window.initArcadeGames === 'function') {
            window.initArcadeGames({
                socket,
                showToast,
                getCurrentUser,
                getCurrentRoomId,
            });
        }
    }

    function iconClassForId(id) {
        if (id < 0) return '';
        return LINK_ICONS[id % LINK_ICONS.length];
    }

    function colorForTileId(id) {
        if (id < 0) return '';
        return LINK_TILE_COLORS[id % LINK_TILE_COLORS.length];
    }

    function renderGrid() {
        const grid = gamesRoot.querySelector('#linkmatch-grid');
        if (!grid) return;

        grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        const n = cols * rows;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < n; i += 1) {
            const v = localTiles[i];
            if (v === CELL_VOID) {
                const hole = document.createElement('div');
                hole.className = 'linkmatch-cell linkmatch-cell-void';
                hole.setAttribute('aria-hidden', 'true');
                frag.appendChild(hole);
                continue;
            }

            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'linkmatch-cell';
            if (v === EMPTY) {
                cell.classList.add('linkmatch-cell-empty');
                cell.disabled = true;
                cell.innerHTML = '';
            } else {
                cell.classList.toggle('linkmatch-cell-selected', selectedIdx === i);
                cell.disabled = locked || pathAnimating;
                const ic = iconClassForId(v);
                const col = colorForTileId(v);
                cell.innerHTML = `<i class="fa-solid ${ic} linkmatch-tile-icon" style="color:${col}" aria-hidden="true"></i>`;
                cell.addEventListener('click', () => handleCellClick(i));
            }
            frag.appendChild(cell);
        }
        grid.innerHTML = '';
        grid.appendChild(frag);
    }

    function renderMeta() {
        const roomEl = gamesRoot.querySelector('#linkmatch-room');
        const statusEl = gamesRoot.querySelector('#linkmatch-status');
        const bannerEl = gamesRoot.querySelector('#linkmatch-banner');
        if (roomEl) roomEl.textContent = getJoinedRoomId() || 'Not in a room';
        if (statusEl) {
            if (!isViewportAllowed()) {
                statusEl.textContent = 'Viewport too narrow';
            } else if (locked && serverFinished) {
                const me = getCurrentPlayerKey();
                if (me && winnerId === me) {
                    statusEl.textContent = 'You won';
                } else {
                    statusEl.textContent = `${winnerName || 'Opponent'} finished first`;
                }
            } else if (serverStarted) {
                statusEl.textContent = 'Race — first to clear wins';
            } else {
                statusEl.textContent = 'Waiting to start';
            }
        }
        if (bannerEl) {
            bannerEl.hidden = !(locked && serverFinished);
            if (!bannerEl.hidden) {
                const me = getCurrentPlayerKey();
                bannerEl.textContent = me && winnerId === me
                    ? 'You cleared all tiles — round won.'
                    : `${winnerName || 'Opponent'} cleared all tiles — round ended.`;
            }
        }

        const startBtn = gamesRoot.querySelector('#linkmatch-start');
        const resetBtn = gamesRoot.querySelector('#linkmatch-reset');
        const canRoom = !!getJoinedRoomId() && socket && socket.connected;
        if (startBtn) {
            const midRound = serverStarted && !serverFinished;
            startBtn.disabled = !canRoom || !isViewportAllowed() || midRound;
        }
        if (resetBtn) {
            resetBtn.disabled = !canRoom || !isViewportAllowed();
        }
    }

    function renderAll() {
        renderMeta();
        renderGrid();
    }

    function renderGateOrGame() {
        if (!isViewportAllowed()) {
            gamesRoot.innerHTML = `
              <div class="game-shell" id="linkmatch-shell">
                <div class="game-header">
                  <button type="button" class="btn-primary" id="linkmatch-back"><i class="fa-solid fa-arrow-left"></i> Back to Arcade</button>
                  <div class="game-title"><i class="fa-solid fa-link"></i> Link Match</div>
                  <div></div>
                </div>
                <div class="linkmatch-gate glass-panel">
                  <p class="linkmatch-gate-title">Desktop / tablet only</p>
                  <p class="linkmatch-gate-copy">Widen the window to at least <strong>${MIN_VIEWPORT_PX}px</strong> to play.</p>
                </div>
              </div>`;
            gamesRoot.querySelector('#linkmatch-back').addEventListener('click', backToArcade);
            return;
        }

        gamesRoot.innerHTML = `
          <div class="game-shell" id="linkmatch-shell">
            <div class="game-header">
              <button type="button" class="btn-primary" id="linkmatch-back"><i class="fa-solid fa-arrow-left"></i> Back</button>
              <div class="game-title"><i class="fa-solid fa-link"></i> Link Match</div>
              <div class="game-header-actions">
                <button type="button" class="btn-primary" id="linkmatch-start"><i class="fa-solid fa-play"></i> Start round</button>
                <button type="button" class="btn-ghost" id="linkmatch-reset"><i class="fa-solid fa-rotate-left"></i> Reset</button>
              </div>
            </div>
            <div class="game-header-main linkmatch-meta">
              <div>Room <span id="linkmatch-room" class="linkmatch-room-id"></span></div>
              <div id="linkmatch-status" class="linkmatch-status"></div>
            </div>
            <div id="linkmatch-banner" class="linkmatch-banner" hidden></div>
            <div class="linkmatch-board-wrap glass-panel">
              <div id="linkmatch-grid" class="linkmatch-grid" role="grid"></div>
            </div>
            <p class="linkmatch-hint">12×7 board with a cross-shaped void and extra holes — lines may only pass through blank cells. Same layout for both players; match identical tiles with at most two bends (a short path is drawn through blanks only). Clear every tile to win.</p>
          </div>`;

        gamesRoot.querySelector('#linkmatch-back').addEventListener('click', backToArcade);
        gamesRoot.querySelector('#linkmatch-start').addEventListener('click', handleStart);
        gamesRoot.querySelector('#linkmatch-reset').addEventListener('click', handleReset);

        activeRoomId = getJoinedRoomId();
        requestState();
        renderAll();
    }

    if (socket && typeof socket.on === 'function') {
        Object.entries(socketHandlers).forEach(([event, handler]) => {
            socket.on(event, handler);
        });
    }

    window.addEventListener('resize', onResize);
    activeRoomId = getJoinedRoomId();
    requestState();
    renderGateOrGame();
}

window.mountLinkMatchGame = mountLinkMatchGame;
