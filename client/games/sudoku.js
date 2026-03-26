function mountSudokuGame({ gamesRoot, socket, showToast, getCurrentUser, getCurrentRoomId }) {
    const difficultyOptions = ['Easy', 'Medium', 'Hard'];
    let selectedDifficulty = 'Medium';

    function renderBoardPreview() {
        return Array.from({ length: 81 }, (_, index) => {
            const row = Math.floor(index / 9);
            const col = index % 9;
            const blockEdge = (col + 1) % 3 === 0 && col !== 8 ? 'border-right:2px solid rgba(108,92,231,.32);' : '';
            const rowEdge = (row + 1) % 3 === 0 && row !== 8 ? 'border-bottom:2px solid rgba(108,92,231,.32);' : '';

            return `
              <div
                style="
                  aspect-ratio:1;
                  border-right:1px solid rgba(108,92,231,.12);
                  border-bottom:1px solid rgba(108,92,231,.12);
                  ${blockEdge}
                  ${rowEdge}
                  background:${index % 2 === 0 ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.92)'};
                "
              ></div>
            `;
        }).join('');
    }

    function renderDifficultyButtons() {
        return difficultyOptions.map((level) => {
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
    }

    function renderSkeleton() {
        const nickname = getCurrentUser && getCurrentUser() ? (getCurrentUser().nickname || getCurrentUser().username || 'Guest') : 'Guest';
        const roomId = getCurrentRoomId && getCurrentRoomId() ? getCurrentRoomId() : null;

        gamesRoot.innerHTML = `
          <div class="glass-panel" style="width:100%; height:100%; padding:18px; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:1.25rem; font-weight:800;">
                  <i class="fa-solid fa-table-cells-large" style="color:#6c5ce7;"></i> Sudoku
                </div>
                <div class="status-pill online">Skeleton Ready</div>
              </div>

              <button id="sudoku-back" class="btn-icon" title="Back to Arcade">
                <i class="fa-solid fa-arrow-left"></i>
              </button>
            </div>

            <div style="display:flex; gap:16px; height:calc(100% - 58px); min-height:0;">
              <div style="flex:1; min-width:520px; display:flex; flex-direction:column; gap:12px; min-height:0;">
                <div class="glass-panel" style="padding:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#6c5ce7;">Difficulty</span>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                      ${renderDifficultyButtons()}
                    </div>
                  </div>

                  <div style="display:flex; gap:8px; align-items:center;">
                    <button id="sudoku-start" class="btn-primary" style="height:44px; display:flex; align-items:center; justify-content:center;">
                      <i class="fa-solid fa-play"></i> Start
                    </button>
                    <button id="sudoku-next" class="btn-primary" style="height:44px; display:flex; align-items:center; justify-content:center; opacity:.7;">
                      <i class="fa-solid fa-forward"></i> Next Puzzle
                    </button>
                  </div>
                </div>

                <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center;">
                  <div class="glass-panel" style="width:min(100%, 700px); aspect-ratio:1; padding:14px; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                      <div style="font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#6c5ce7;">Board Preview</div>
                      <div style="font-size:.9rem; opacity:.7;">Interactive grid lands in the next step.</div>
                    </div>

                    <div style="flex:1; display:grid; grid-template-columns:repeat(9, 1fr); border:2px solid rgba(108,92,231,.32); border-radius:18px; overflow:hidden; background:rgba(255,255,255,.8);">
                      ${renderBoardPreview()}
                    </div>
                  </div>
                </div>
              </div>

              <div style="width:360px; display:flex; flex-direction:column; gap:12px;">
                <div class="glass-panel" style="padding:14px;">
                  <div style="font-weight:800; margin-bottom:8px;">Room Info</div>
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Player</span>
                    <strong>${nickname}</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <span style="opacity:.75;">Room</span>
                    <strong>${roomId || 'Not joined yet'}</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; gap:8px;">
                    <span style="opacity:.75;">Selected</span>
                    <strong id="sudoku-selected-difficulty">${selectedDifficulty}</strong>
                  </div>
                </div>

                <div class="glass-panel" style="padding:14px; flex:1;">
                  <div style="font-weight:800; margin-bottom:8px;">Planned Controls</div>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                    <span class="status-pill online" style="font-size:.78rem;">Fill Number</span>
                    <span class="status-pill online" style="font-size:.78rem;">Erase</span>
                    <span class="status-pill online" style="font-size:.78rem;">Shared Board</span>
                  </div>
                  <div style="opacity:.76; line-height:1.6; font-size:.95rem;">
                    Phase 1 only wires the menu entry and visual shell. The real puzzle generation, editing, validation, and socket sync will come in the next steps.
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        const selectedEl = document.getElementById('sudoku-selected-difficulty');
        const difficultyButtons = gamesRoot.querySelectorAll('.sudoku-difficulty-btn');
        const startBtn = document.getElementById('sudoku-start');
        const nextBtn = document.getElementById('sudoku-next');
        const backBtn = document.getElementById('sudoku-back');

        difficultyButtons.forEach((button) => {
            button.addEventListener('click', () => {
                selectedDifficulty = button.dataset.level || 'Medium';
                renderSkeleton();
            });
        });

        if (selectedEl) {
            selectedEl.textContent = selectedDifficulty;
        }

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                showToast(`Sudoku ${selectedDifficulty} setup is ready. Interactive play comes in the next step.`);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                showToast('Next puzzle will be enabled once the board logic is in place.');
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (typeof window.initArcadeGames !== 'function') return;
                window.initArcadeGames({ socket, showToast, getCurrentUser, getCurrentRoomId });
            });
        }
    }

    renderSkeleton();
}

window.mountSudokuGame = mountSudokuGame;
