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

    function openLinkMatch() {
        if (typeof window.mountLinkMatchGame !== 'function') {
            showToast('Link Match module failed to load');
            return;
        }

        window.mountLinkMatchGame({
            gamesRoot,
            socket,
            showToast,
            getCurrentUser,
            getCurrentRoomId,
        });
    }

    gamesRoot.innerHTML = `
      <div class="glass-panel arcade-shell">
        <div class="arcade-header">
          <div class="arcade-title"><i class="fa-solid fa-gamepad"></i> Arcade</div>
          <div class="status-pill online">Choose a game</div>
        </div>

        <div class="arcade-grid">
          <button id="arcade-open-sudoku" class="glass-panel arcade-card" type="button">
            <div class="arcade-card-title"><i class="fa-solid fa-table-cells-large"></i> Sudoku</div>
            <div class="arcade-card-copy">Solve a shared puzzle together with your room members.</div>
          </button>

          <button id="arcade-open-pictionary" class="glass-panel arcade-card" type="button">
            <div class="arcade-card-title"><i class="fa-solid fa-paintbrush"></i> Pictionary</div>
            <div class="arcade-card-copy">Draw and guess with your room members.</div>
          </button>

          <button id="arcade-open-linkmatch" class="glass-panel arcade-card" type="button">
            <div class="arcade-card-title"><i class="fa-solid fa-link"></i> Link Match</div>
            <div class="arcade-card-copy">Link Match race: cross-shaped void, same board for both; path shown on match. Requires width ≥1024px.</div>
          </button>
        </div>
      </div>
    `;

    const openSudokuBtn = document.getElementById('arcade-open-sudoku');
    const openBtn = document.getElementById('arcade-open-pictionary');
    const openLinkMatchBtn = document.getElementById('arcade-open-linkmatch');
    if (openSudokuBtn) openSudokuBtn.addEventListener('click', openSudoku);
    if (openBtn) openBtn.addEventListener('click', openPictionary);
    if (openLinkMatchBtn) openLinkMatchBtn.addEventListener('click', openLinkMatch);
}

window.initArcadeGames = initArcadeGames;
