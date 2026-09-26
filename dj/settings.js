const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Spotify has no release month for some (mostly older) albums: those count
// as January, and show as January.
function formatHistoryYear(entry){
  if(!entry.year) return '—';
  if(expertMode) return MONTH_NAMES[(entry.month || 1) - 1] + ' ' + entry.year;
  return entry.year;
}

function appendCardYear(card, entry){
  const yearEl = document.createElement('div');
  yearEl.className = 'vinyl-card-year';
  yearEl.textContent = entry.year;
  if(expertMode){
    const monthEl = document.createElement('div');
    monthEl.className = 'vinyl-card-month';
    monthEl.textContent = MONTH_NAMES[(entry.month || 1) - 1];
    yearEl.appendChild(monthEl);
  }
  card.appendChild(yearEl);
}

let expertMode = false;
function setExpertMode(on){
  expertMode = on;
  document.querySelectorAll('.expert-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.expertmode === (on ? 'on' : 'off'));
  });
  document.querySelectorAll('.expert-mode-btn').forEach(b => positionToggleSlider(b.closest('.filter-toggle')));
  refreshNowYearDisplay();
  renderScoreboard();
  renderHistory();
  if(document.getElementById('sbRecapView').style.display !== 'none') renderRecap();
  saveSession();
}
document.querySelectorAll('.expert-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => setExpertMode(btn.dataset.expertmode === 'on'));
});

function setClipSeconds(sec){
  CLIP_SECONDS = sec;
  clipLengthInput.value = sec;
  clipLengthValue.textContent = sec + 's';
  saveSession();
}

// Presets flip the four game switches at once; the one that matches the
// current switches lights up.
function presetDefs(){
  return {
    classic: { mode: 'normal', ou: 'off', shop: 'off', turns: 'on' },
    casual: { mode: 'normal', ou: 'on', shop: 'on', turns: 'on' },
    party: { mode: 'chaos', ou: 'on', shop: 'off', turns: 'on' }
  };
}
function syncPresetButtons(){
  const defs = presetDefs();
  document.querySelectorAll('.preset-btn').forEach(b => {
    const p = defs[b.dataset.preset];
    b.classList.toggle('active', gameMode === p.mode && ouEnabled === (p.ou === 'on') && shopEnabled === (p.shop === 'on') && autoTurns === (p.turns === 'on'));
  });
}
document.querySelectorAll('.preset-btn').forEach(btn => btn.addEventListener('click', () => {
  const p = presetDefs()[btn.dataset.preset];
  document.querySelector('.game-mode-btn[data-gamemode="' + p.mode + '"]').click();
  document.querySelector('.ou-btn[data-ou="' + p.ou + '"]').click();
  document.querySelector('.shopset-btn[data-shopset="' + p.shop + '"]').click();
  document.querySelector('.autoturn-btn[data-autoturn="' + p.turns + '"]').click();
  syncPresetButtons();
}));

function syncAutoTurnButtons(){
  document.querySelectorAll('.autoturn-btn').forEach(b => b.classList.toggle('active', b.dataset.autoturn === (autoTurns ? 'on' : 'off')));
  document.querySelectorAll('.autoturn-btn').forEach(b => positionToggleSlider(b.closest('.filter-toggle')));
  syncPresetButtons();
}
document.querySelectorAll('.autoturn-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    autoTurns = btn.dataset.autoturn === 'on';
    syncAutoTurnButtons();
    renderShopButton();
    renderScoreboard();
    saveSession();
  });
});

function syncShopSetButtons(){
  document.querySelectorAll('.shopset-btn').forEach(b => b.classList.toggle('active', b.dataset.shopset === (shopEnabled ? 'on' : 'off')));
  document.querySelectorAll('.shopset-btn').forEach(b => positionToggleSlider(b.closest('.filter-toggle')));
  syncPresetButtons();
}
document.querySelectorAll('.shopset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    shopEnabled = btn.dataset.shopset === 'on';
    syncShopSetButtons();
    renderShopButton();
    saveSession();
  });
});

const ouGapInput = document.getElementById('ouGapInput');
const ouStartInput = document.getElementById('ouStartInput');
const ouStepInput = document.getElementById('ouStepInput');
const ouMaxInput = document.getElementById('ouMaxInput');
function syncOuOdds(){
  ouGapInput.value = ouGap;
  document.getElementById('ouGapValue').textContent = ouGap === 0 ? 'none' : ouGap === 1 ? '1 song' : ouGap + ' songs';
  ouStartInput.value = ouStart;
  ouStepInput.value = ouStep;
  ouMaxInput.value = ouMax;
  document.getElementById('ouStartValue').textContent = ouStart + '%';
  document.getElementById('ouStepValue').textContent = '+' + ouStep + '%';
  document.getElementById('ouMaxValue').textContent = ouMax === 1 ? 'every song' : ouMax + ' songs';
  document.getElementById('ouOdds').hidden = !ouEnabled;
}
[ouGapInput, ouStartInput, ouStepInput, ouMaxInput].forEach(input => input.addEventListener('input', () => {
  ouGap = parseInt(ouGapInput.value, 10);
  ouStart = parseInt(ouStartInput.value, 10);
  ouStep = parseInt(ouStepInput.value, 10);
  ouMax = parseInt(ouMaxInput.value, 10);
  syncOuOdds();
  saveSession();
}));

function syncOuButtons(){
  syncOuOdds();
  document.querySelectorAll('.ou-btn').forEach(b => b.classList.toggle('active', b.dataset.ou === (ouEnabled ? 'on' : 'off')));
  document.querySelectorAll('.ou-btn').forEach(b => positionToggleSlider(b.closest('.filter-toggle')));
  syncPresetButtons();
}
document.querySelectorAll('.ou-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    ouEnabled = btn.dataset.ou === 'on';
    syncOuButtons();
    saveSession();
  });
});

function syncGameModeButtons(){
  document.querySelectorAll('.game-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.gamemode === gameMode));
  document.querySelectorAll('.game-mode-btn').forEach(b => positionToggleSlider(b.closest('.filter-toggle')));
  syncPresetButtons();
}
document.querySelectorAll('.game-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if(gameMode === btn.dataset.gamemode) return;
    gameMode = btn.dataset.gamemode;
    // Switching either way starts clean: the next draw opens round 1.
    endChaosCard();
    chaos = null;
    vote = null;
    syncGameModeButtons();
    renderScoreboard();
    renderChaos();
    syncStage();
    saveSession();
  });
});

let historyFilterMode = 'all';

function renderHistory(){
  const filtered = historyFilterMode === 'session'
    ? sessionHistory.filter(e => e.sessionId === currentSessionId)
    : sessionHistory;
  historyList.innerHTML = '';
  clearHistoryRow.style.display = historyFilterMode === 'all' ? '' : 'none';
  if(filtered.length === 0){
    historyList.innerHTML = historyFilterMode === 'session'
      ? '<p class="empty">Nothing revealed yet this session.</p>'
      : '<p class="empty">Nothing revealed yet.</p>';
    return;
  }
  filtered.slice().reverse().forEach(entry => {
    const row = document.createElement('div');
    row.className = 'history-entry';
    row.innerHTML = `
      <span class="history-year">${formatHistoryYear(entry)}</span>
      <span class="history-title">${entry.title ? escapeHtml(entry.title) + (entry.artist ? ' — ' + escapeHtml(entry.artist) : '') : 'Unknown track'}</span>
      <span class="history-meta">${entry.playlist ? escapeHtml(entry.playlist) : ''}</span>
    `;
    historyList.appendChild(row);
  });
  saveSession();
}

document.querySelectorAll('.history-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    positionToggleSlider(btn.closest('.filter-toggle'));
    historyFilterMode = btn.dataset.historyfilter;
    renderHistory();
  });
});

clearHistoryBtn.addEventListener('click', async () => {
  if(sessionHistory.length > 0 && !(await showConfirm('Clear the session history? This can\'t be undone.'))) return;
  sessionHistory = [];
  renderHistory();
  saveSession();
});

resetStatsBtn.addEventListener('click', async () => {
  const hasStats = statsRevealed > 0 || statsListenSeconds > 0 || statsCardsPlaced > 0 || statsCoinsWon > 0;
  if(hasStats && !(await showConfirm('Reset songs listened, cards placed, gold coins won, and listening time back to zero? This can\'t be undone.'))) return;
  statsRevealed = 0;
  statsListenSeconds = 0;
  statsCardsPlaced = 0;
  statsCoinsWon = 0;
  renderStats();
  saveSession();
});

function capitalizeFirst(str){
  if(!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Names are unique on the board (case-insensitive) — a phone claims a slot by
// name, so two "Ingrid"s would be ambiguous.
function nameTaken(name, except){
  const norm = s => (s || '').trim().toLowerCase();
  return players.some(p => p !== except && norm(p.name) === norm(name));
}

addPlayerBtn.addEventListener('click', () => {
  const name = capitalizeFirst(playerNameInput.value.trim());
  if(!name) return;
  if(nameTaken(name)){
    lobbyToast('“' + name + '” is already on the board — pick another name');
    playerNameInput.select();
    return;
  }
  players.push({name, timeline: [], lastAdded: null, deviceId: null, online: false});
  playerNameInput.value = '';
  renderScoreboard();
});

playerNameInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') addPlayerBtn.click();
});

function resetDeckProgress(){
  playlists.forEach(p => p.tracks.forEach(t => { t.drawn = false; t.revealedOnce = false; t.loggedToHistory = false; }));
  currentCard = null;
  currentPlaylistName = null;
  revealed = false;
  sessionCardsLost = 0;
  sessionCardsPlaced = 0;
  sessionCoinsWon = 0;
  sessionChaos = freshChaosStats();
  currentSessionId++;
  endChaosCard();
  chaos = null;
  vote = null;
  song = null;
  awaitingStart = false;
  lastBetResults = null;
  turnName = null;
  lastEvent = null;
  gameWinner = null;
  renderChaos();
  clearTimeout(snippetTimer);
  clearInterval(countdownInterval);
  clearTimeout(countdownStartFallback);
  clearTimeout(timerSyncTimeout);
  pendingCountdownStart = false;
  freezeClipBar();
  if(controller) controller.pause();
  setPlayingVisual(false);
  setDeckLabel(null);
  nowTitle.textContent = '—';
  nowArtist.textContent = '';
  nowYear.textContent = '';
  replayBtn.disabled = true;
  newPointBtn.disabled = true;
  revealBtn.disabled = true;
  stopBtn.disabled = true;
  refreshStatus();
  renderTracklist();
  renderStats();
}

resetScoresBtn.addEventListener('click', async () => {
  const hasProgress = players.some(p => p.timeline.length > 0);
  if(hasProgress && !(await showConfirm('Reset every player\'s timeline and start a fresh deck? All songs become drawable again — this can\'t be undone.'))) return;
  players.forEach(p => { p.timeline = []; p.lastAdded = null; p.coinAdj = 0; p.streak = 0; });
  gameWinner = null;
  resetDeckProgress();
  renderScoreboard();
});

clearPlayersBtn.addEventListener('click', async () => {
  if(players.length > 0 && !(await showConfirm('Clear all players and start a fresh deck? All songs become drawable again — this can\'t be undone.'))) return;
  evictAllPhones('cleared');
  players = [];
  resetDeckProgress();
  renderScoreboard();
  renderPhones();
});

