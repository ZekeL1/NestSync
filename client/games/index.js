function initArcadeGames({ socket, showToast, getCurrentUser, getCurrentRoomId }) {
    const gamesRoot = document.getElementById('games');
    if (!gamesRoot) return;

    function openSudoku() {
        if (typeof window.mountSudokuGame !== 'function') {
            showToast('Sudoku module failed to load');
            return;
        }

        window.mountSudokuGame({
            gamesRoot,
            socket,
            showToast,
            getCurrentUser,
            getCurrentRoomId,
        });
    }

    function openPictionary() {
        if (typeof window.mountPictionaryGame !== 'function') {
            showToast('Pictionary module failed to load');
            return;
        }

        window.mountPictionaryGame({
            gamesRoot,
            socket,
            showToast,
            getCurrentUser,
            getCurrentRoomId,
        });
    }

    gamesRoot.innerHTML = `
      <div class="glass-panel" style="width:100%; height:100%; padding:18px; box-sizing:border-box;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div style="font-size:1.25rem; font-weight:800;"><i class="fa-solid fa-gamepad" style="color:#6c5ce7;"></i> Arcade</div>
          <div class="status-pill online">Choose a game</div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
          <button id="arcade-open-sudoku" class="glass-panel" style="padding:16px; text-align:left; cursor:pointer; border:none;">
            <div style="font-size:1.1rem; font-weight:800; margin-bottom:6px;"><i class="fa-solid fa-table-cells-large" style="color:#6c5ce7;"></i> Sudoku</div>
            <div style="opacity:.8; font-size:.95rem;">Solve a shared puzzle together with your room members.</div>
          </button>

          <button id="arcade-open-pictionary" class="glass-panel" style="padding:16px; text-align:left; cursor:pointer; border:none;">
            <div style="font-size:1.1rem; font-weight:800; margin-bottom:6px;"><i class="fa-solid fa-paintbrush" style="color:#6c5ce7;"></i> Pictionary</div>
            <div style="opacity:.8; font-size:.95rem;">Draw and guess with your room members.</div>
          </button>

          <div class="glass-panel" style="padding:16px; opacity:.75;">
            <div style="font-size:1.1rem; font-weight:800; margin-bottom:6px;"><i class="fa-solid fa-plus"></i> More games</div>
            <div style="font-size:.95rem;">Coming soon...</div>
          </div>
        </div>
      </div>
    `;

    const openSudokuBtn = document.getElementById('arcade-open-sudoku');
    const openBtn = document.getElementById('arcade-open-pictionary');
    if (openSudokuBtn) openSudokuBtn.addEventListener('click', openSudoku);
    if (openBtn) openBtn.addEventListener('click', openPictionary);
}

window.initArcadeGames = initArcadeGames;
