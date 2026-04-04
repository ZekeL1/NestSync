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

    function openQuickBoat() {
        if (typeof window.mountQuickBoatGame !== 'function') {
            showToast('Quick Boat module failed to load');
            return;
        }

        window.mountQuickBoatGame({
            gamesRoot,
            socket,
            showToast,
            getCurrentUser,
            getCurrentRoomId,
        });
    }

    function openLoveLetter() {
        if (typeof window.mountLoveLetterGame !== 'function') {
            showToast('Love Letter module failed to load');
            return;
        }

        window.mountLoveLetterGame({
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
            <div class="arcade-card-copy">Link same tiles across the shared board and clear the field before your opponent.</div>
          </button>

          <button id="arcade-open-quickboat" class="glass-panel arcade-card" type="button">
            <div class="arcade-card-title"><i class="fa-solid fa-dice-five"></i> Quick Boat</div>
            <div class="arcade-card-copy">Two-player Yacht duel. Roll, hold, and choose scoring slots to finish ahead.</div>
          </button>

          <button id="arcade-open-loveletter" class="glass-panel arcade-card" type="button">
            <div class="arcade-card-title"><i class="fa-solid fa-envelope-open-text"></i> Love Letter</div>
            <div class="arcade-card-copy">Two-player hidden-hand duel. Play card effects, read the opponent, and race to three tokens.</div>
          </button>
        </div>
      </div>
    `;

    const openSudokuBtn = document.getElementById('arcade-open-sudoku');
    const openPictionaryBtn = document.getElementById('arcade-open-pictionary');
    const openLinkMatchBtn = document.getElementById('arcade-open-linkmatch');
    const openQuickBoatBtn = document.getElementById('arcade-open-quickboat');
    const openLoveLetterBtn = document.getElementById('arcade-open-loveletter');

    if (openSudokuBtn) openSudokuBtn.addEventListener('click', openSudoku);
    if (openPictionaryBtn) openPictionaryBtn.addEventListener('click', openPictionary);
    if (openLinkMatchBtn) openLinkMatchBtn.addEventListener('click', openLinkMatch);
    if (openQuickBoatBtn) openQuickBoatBtn.addEventListener('click', openQuickBoat);
    if (openLoveLetterBtn) openLoveLetterBtn.addEventListener('click', openLoveLetter);
}

window.initArcadeGames = initArcadeGames;
