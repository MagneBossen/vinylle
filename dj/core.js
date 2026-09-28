const confirmOverlay = document.getElementById('confirmOverlay');
const confirmMessage = document.getElementById('confirmMessage');
const confirmYesBtn = document.getElementById('confirmYesBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

function showConfirm(message){
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmOverlay.classList.add('open');
    function onYes(){ cleanup(true); }
    function onNo(){ cleanup(false); }
    function onBackdrop(e){ if(e.target === confirmOverlay) onNo(); }
    function cleanup(result){
      confirmOverlay.classList.remove('open');
      confirmYesBtn.removeEventListener('click', onYes);
      confirmCancelBtn.removeEventListener('click', onNo);
      confirmOverlay.removeEventListener('click', onBackdrop);
      resolve(result);
    }
    confirmYesBtn.addEventListener('click', onYes);
    confirmCancelBtn.addEventListener('click', onNo);
    confirmOverlay.addEventListener('click', onBackdrop);
  });
}

let playlists = [];
// 'normal' | 'chaos'. In chaos, `chaos` holds the current round's rule card.
let gameMode = 'normal';
let chaos = null;
// Over/under vote on the current song, or null.
let vote = null;
// Over/under pop-ups: on/off, and songs since the last one (the chance grows).
let ouEnabled = false;
let ouSince = 0;
// Whose turn it is — the name of the player the current song belongs to.
let turnName = null;
// The current song's bookkeeping, settled when the next song is drawn:
// { id, turn, don (double or nothing), bets, settled }.
let song = null;
// Betster: the song is loaded but waits for Start, so people can bet first.
let awaitingStart = false;
// Last settled bets, so phones can show how theirs went.
let lastBetResults = null;
// Coin shop open in every round (a setting).
let shopEnabled = false;
// Automatic turns (a setting, on by default): the app tracks whose turn it
// is, and the give row only offers that player.
let autoTurns = true;
// Over/under pop-up odds (settings): a pause after each one (0% for that many
// songs), then a starting chance that rises each song, until it's guaranteed.
// Defaults land on song 5–7 nine times in ten, about every 6 songs.
let ouGap = 2;
let ouStart = 0;
let ouStep = 10;
let ouMax = 7;
let revealAllNames = false;
let loadedPlaylistIds = new Set();
let players = [];

// The saved state holds every track of every playlist (hundreds of KB) and one
// click can save several times, so writes are coalesced; pagehide flushes.
let saveQueued = false;
function saveSession(){
  // Every state change already funnels through here, so this is the one place
  // the phones need to be told about.
  broadcastState();
  if(saveQueued) return;
  saveQueued = true;
  setTimeout(flushSession, 0);
}
window.addEventListener('pagehide', flushSession);

function flushSession(){
  if(!saveQueued) return;
  saveQueued = false;
  try{
    const state = {
      playlists: playlists.map(p => ({name: p.name, tracks: p.tracks, enabled: p.enabled, id: p.id, expanded: p.expanded})),
      loadedPlaylistIds: Array.from(loadedPlaylistIds),
      players: players.map(pl => ({name: pl.name, timeline: pl.timeline, coinAdj: pl.coinAdj || 0, streak: pl.streak || 0, tie: pl.tie})),
      sessionHistory: sessionHistory,
      statsRevealed: statsRevealed,
      statsCardsPlaced: statsCardsPlaced,
      statsCoinsWon: statsCoinsWon,
      sessionCardsLost: sessionCardsLost,
      sessionCardsPlaced: sessionCardsPlaced,
      sessionCoinsWon: sessionCoinsWon,
      sessionChaos: sessionChaos,
      currentSessionId: currentSessionId,
      statsListenSeconds: statsListenSeconds,
      clipSeconds: CLIP_SECONDS,
      winLength: WIN_LENGTH,
      uiScale: parseInt(uiScaleInput.value, 10),
      expertMode: expertMode,
      gameMode: gameMode,
      chaos: chaos,
      turnName: turnName,
      ouEnabled: ouEnabled,
      ouSince: ouSince,
      shopEnabled: shopEnabled,
      autoTurns: autoTurns,
      ouGap: ouGap,
      ouStart: ouStart,
      ouStep: ouStep,
      ouMax: ouMax,
      gameWinner: gameWinner
    };
    try{
      localStorage.setItem('bs_session', JSON.stringify(state));
    }catch(e){
      // Storage full: drop old nights' history (tonight's stays) and try once more.
      state.sessionHistory = sessionHistory = sessionHistory.filter(h => h.sessionId === currentSessionId);
      localStorage.setItem('bs_session', JSON.stringify(state));
    }
    saveWarned = false;
  }catch(e){
    console.error('saveSession failed:', e);
    // A refresh would lose the game, so the DJ needs to know — once, not on every change.
    if(!saveWarned){
      saveWarned = true;
      lobbyToast('Couldn\u2019t save the game on this browser — don\u2019t refresh the page');
    }
  }
}
let saveWarned = false;

function loadSession(){
  try{
    const raw = localStorage.getItem('bs_session');
    if(!raw) return;
    const state = JSON.parse(raw);
    if(state.playlists) playlists = state.playlists;
    if(state.loadedPlaylistIds) loadedPlaylistIds = new Set(state.loadedPlaylistIds);
    // Claims are per-session: socket ids and phones don't survive a reload, so
    // everyone starts unclaimed and re-claims from their phone.
    if(state.players) players = state.players.map(pl => ({name: pl.name, timeline: pl.timeline || [], coinAdj: pl.coinAdj || 0, streak: pl.streak || 0, tie: pl.tie, lastAdded: null, deviceId: null, online: false}));
    if(state.sessionHistory) sessionHistory = state.sessionHistory;
    if(typeof state.statsRevealed === 'number') statsRevealed = state.statsRevealed;
    if(typeof state.statsCardsPlaced === 'number') statsCardsPlaced = state.statsCardsPlaced;
    if(typeof state.statsCoinsWon === 'number') statsCoinsWon = state.statsCoinsWon;
    if(typeof state.sessionCardsLost === 'number') sessionCardsLost = state.sessionCardsLost;
    if(typeof state.sessionCardsPlaced === 'number') sessionCardsPlaced = state.sessionCardsPlaced;
    if(typeof state.sessionCoinsWon === 'number') sessionCoinsWon = state.sessionCoinsWon;
    if(state.sessionChaos) sessionChaos = Object.assign(freshChaosStats(), state.sessionChaos);
    if(typeof state.currentSessionId === 'number') currentSessionId = state.currentSessionId;
    if(typeof state.statsListenSeconds === 'number') statsListenSeconds = state.statsListenSeconds;
    if(typeof state.clipSeconds === 'number'){
      CLIP_SECONDS = state.clipSeconds;
      clipLengthInput.value = CLIP_SECONDS;
      clipLengthValue.textContent = CLIP_SECONDS + 's';
    }
    if(typeof state.winLength === 'number'){
      WIN_LENGTH = state.winLength;
      winLengthInput.value = WIN_LENGTH;
      winLengthValue.textContent = WIN_LENGTH;
    }
    if(typeof state.uiScale === 'number'){
      uiScaleInput.value = state.uiScale;
      uiScaleValue.textContent = state.uiScale + '%';
      applyZoom();
    }
    if(typeof state.expertMode === 'boolean'){
      expertMode = state.expertMode;
      document.querySelectorAll('.expert-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.expertmode === (expertMode ? 'on' : 'off'));
      });
    }
    if(typeof state.turnName === 'string') turnName = state.turnName;
    if(state.gameWinner && state.gameWinner.name) gameWinner = state.gameWinner;
    if(typeof state.shopEnabled === 'boolean'){
      shopEnabled = state.shopEnabled;
      syncShopSetButtons();
    }
    if(typeof state.ouSince === 'number') ouSince = state.ouSince;
    if(typeof state.autoTurns === 'boolean'){
      autoTurns = state.autoTurns;
      syncAutoTurnButtons();
    }
    // Saves from before the pause existed only hold the old defaults: skip them.
    if(typeof state.ouGap === 'number'){
      ouGap = state.ouGap;
      if(typeof state.ouStart === 'number') ouStart = state.ouStart;
      if(typeof state.ouStep === 'number') ouStep = state.ouStep;
      if(typeof state.ouMax === 'number') ouMax = state.ouMax;
    }
    syncOuOdds();
    if(typeof state.ouEnabled === 'boolean'){
      ouEnabled = state.ouEnabled;
      syncOuButtons();
    }
    if(state.gameMode === 'chaos' || state.gameMode === 'normal'){
      gameMode = state.gameMode;
      chaos = gameMode === 'chaos' ? (state.chaos || null) : null;
      syncGameModeButtons();
    }
    if(playlists.length > 0){
      reloadBtn.disabled = false;
      resetBtn.disabled = false;
      drawBtn.disabled = false;
    }
    refreshStatus();
    renderTracklist();
    renderScoreboard();
    renderHistory();
  }catch(e){ console.error('loadSession failed:', e); }
}
let currentCard = null;
let currentPlaylistName = '';
let revealed = false;
let controller = null;
let apiReady = false;
let snippetTimer = null;
let countdownInterval = null;
let remainingSeconds = 0;

function freezeClipBar(){
  const computed = getComputedStyle(clipBar).width;
  clipBar.style.transition = 'none';
  clipBar.style.width = computed;
}

function animateClipBar(seconds){
  clipBar.style.transition = 'none';
  clipBar.style.width = '100%';
  void clipBar.offsetWidth;
  clipBar.style.transition = 'width ' + seconds + 's linear';
  clipBar.style.width = '0%';
}

function tickCountdown(){
  countdownInterval = setInterval(() => {
    remainingSeconds -= 1;
    statsListenSeconds += 1;
    if(remainingSeconds <= 0){
      remainingSeconds = 0;
      timerLine.textContent = '0s';
      clearInterval(countdownInterval);
    }else{
      timerLine.textContent = remainingSeconds + 's';
    }
  }, 1000);
}

// Song position (ms) at which the current clip ends; 0 = no clip running.
let clipEndMs = 0;
// The clip's countdown as the phones see it: ms left as of `at`, and whether
// it's running (their record gets the same ring as the DJ's).
let clipRun = null;
function setClipRun(left, running){
  clipRun = left == null ? null : { left: Math.max(0, left), at: Date.now(), total: clipSeconds() * 1000, running };
  broadcastState();
}

function endClip(){
  clearTimeout(snippetTimer);
  clipEndMs = 0;
  setClipRun(null);
  if(controller) controller.pause();
  setPlayingVisual(false);
}

// Wall-clock backup only — playback updates re-aim it at the song position.
function armAutoStop(seconds){
  clearTimeout(snippetTimer);
  snippetTimer = setTimeout(endClip, seconds * 1000);
}

// Run the ring/countdown for the time left in the clip and arm the stop.
function runClip(leftMs){
  clearInterval(countdownInterval);
  remainingSeconds = Math.ceil(leftMs / 1000);
  timerLine.textContent = remainingSeconds + 's';
  clipBar.style.transition = 'none';
  clipBar.style.width = Math.min(100, leftMs / (clipSeconds() * 1000) * 100) + '%';
  void clipBar.offsetWidth;
  clipBar.style.transition = 'width ' + (leftMs / 1000) + 's linear';
  clipBar.style.width = '0%';
  tickCountdown();
  armAutoStop(leftMs / 1000);
  setClipRun(leftMs, true);
}

function startCountdown(seconds, exact){
  clearInterval(countdownInterval);
  remainingSeconds = seconds;
  timerLine.textContent = remainingSeconds + 's';
  animateClipBar(exact || seconds);
  tickCountdown();
  armAutoStop(exact || seconds);
}

function pauseCountdown(){
  clearInterval(countdownInterval);
  clearTimeout(snippetTimer);
  freezeClipBar();
  if(clipRun && clipRun.running) setClipRun(clipRun.left - (Date.now() - clipRun.at), false);
}

function resumeCountdown(){
  if(remainingSeconds <= 0) return;
  clipBar.style.transition = 'none';
  void clipBar.offsetWidth;
  clipBar.style.transition = 'width ' + remainingSeconds + 's linear';
  clipBar.style.width = '0%';
  tickCountdown();
  armAutoStop(remainingSeconds);
}

/* Fit to screen: the layout is drawn for a 1440×800 window and the whole
   page is zoomed to fit the actual one, so a half-size window shows the same
   screen at half size, a TV shows it bigger. Display size (settings)
   multiplies on top. --vw is 1% of the zoomed layout width, used in place of
   vw so vw-based sizes scale with everything else. */
function fitScale(){
  const DESIGN_W = 1440, DESIGN_H = 800;
  const w = window.innerWidth, h = window.innerHeight;
  return Math.min(3, Math.max(0.25, Math.min(w / DESIGN_W, h / DESIGN_H)));
}
function applyZoom(){
  const el = document.getElementById('uiScaleInput');
  const user = el ? parseInt(el.value, 10) / 100 : 1;
  const z = Math.round(fitScale() * user * 1000) / 1000;
  document.documentElement.style.zoom = z;
  document.documentElement.style.setProperty('--z', z);
  document.documentElement.style.setProperty('--vw', (window.innerWidth / z / 100) + 'px');
}
window.addEventListener('resize', applyZoom);
applyZoom();
// html2canvas is ~200 KB and only the "save as image" buttons use it, so it's
// fetched on the first export instead of holding up every page load.
let html2canvasLoading = null;
function loadHtml2canvas(){
  if(window.html2canvas) return Promise.resolve(window.html2canvas);
  if(!html2canvasLoading){
    html2canvasLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = () => resolve(window.html2canvas);
      s.onerror = () => {
        html2canvasLoading = null; // let the next click try again
        s.remove();
        reject(new Error('html2canvas failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return html2canvasLoading;
}
// Exports are laid out at fixed pixel sizes, so snapshot them un-zoomed.
function snapshot(el, opts){
  return loadHtml2canvas().then(h2c => {
    document.documentElement.style.zoom = 1;
    return h2c(el, opts).finally(applyZoom);
  }, err => {
    alert('Image export library failed to load — check your connection and try again.');
    throw err;
  });
}

const vinyl = document.getElementById('vinylSvg');
const tonearm = document.getElementById('tonearm');
const vinylLabel = document.getElementById('vinylLabel');
const deckStatus = document.getElementById('deckStatus');
const offStatus = document.getElementById('offStatus');
const nowTitle = document.getElementById('nowTitle');
const nowArtist = document.getElementById('nowArtist');
const nowYear = document.getElementById('nowYear');
const tracklistEl = document.getElementById('tracklist');
const revealAllBtn = document.getElementById('revealAllBtn');
const scoreboardEl = document.getElementById('scoreboard');
const playerNameInput = document.getElementById('playerNameInput');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const resetScoresBtn = document.getElementById('resetScoresBtn');
const clearPlayersBtn = document.getElementById('clearPlayersBtn');

const loadPlaylistBtn = document.getElementById('loadPlaylistBtn');
const playlistStatus = document.getElementById('playlistStatus');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectStatus = document.getElementById('connectStatus');
const connectPill = document.getElementById('connectPill');
const redirectUriField = document.getElementById('redirectUri');
const reloadBtn = document.getElementById('reloadBtn');
const resetBtn = document.getElementById('resetBtn');
const drawBtn = document.getElementById('drawBtn');
const replayBtn = document.getElementById('replayBtn');
const newPointBtn = document.getElementById('newPointBtn');
const debugInfo = document.getElementById('debugInfo');
const scrubSlider = document.getElementById('scrubSlider');
const scrubPlayBtn = document.getElementById('scrubPlayBtn');
const scrubSeekBtn = document.getElementById('scrubSeekBtn');
const continueBtn = document.getElementById('continueBtn');
const revealBtn = document.getElementById('revealBtn');
const stopBtn = document.getElementById('stopBtn');
const timerLine = document.getElementById('timerLine');
const clipBar = document.getElementById('clipBar');
const audioEngine = document.getElementById('audioEngine');

let accessToken = null;
let isScrubbing = false;
let lastKnownPaused = true;
let lastKnownPosition = 0;
let lastKnownDuration = 0;
let pausedAtMs = 0;
let pendingCountdownStart = false;
let countdownStartFallback = null;
let timerSyncTimeout = null;
let untimedMode = false;
let CLIP_SECONDS = 30;
// Each speed trap cuts this much off the current song's clip, down to the floor.
const SPEED_TRAP_CUT = 5;
const CLIP_FLOOR = 5;
// The clip for the current song: the setting, minus any speed traps.
function clipSeconds(){
  const cut = (song && song.cut) || 0;
  return Math.max(Math.min(CLIP_SECONDS, CLIP_FLOOR), CLIP_SECONDS - cut);
}
const TIMER_SYNC_DELAY = 800;

function fmtMs(ms){
  const totalSec = Math.floor(ms/1000);
  const m = Math.floor(totalSec/60);
  const s = totalSec % 60;
  return m + ':' + String(s).padStart(2,'0');
}

const CONNECT_SLOW_MS = 3000;
function setConnState(state, text){
  connectPill.classList.remove('connected','pending','error');
  if(state) connectPill.classList.add(state);
  connectStatus.textContent = text;
  // Disconnect when connected. While connecting it stays out of the way,
  // and only turns up as Stop if it's taking a while.
  const stop = document.getElementById('disconnectBtn');
  if(stop){
    clearTimeout(setConnState.slowTimer);
    stop.textContent = state === 'pending' ? 'Stop' : 'Disconnect';
    stop.hidden = state !== 'connected';
    if(state === 'pending') setConnState.slowTimer = setTimeout(() => { stop.hidden = false; }, CONNECT_SLOW_MS);
  }
  // Can run while the page is still loading, before dj/stage.js (where the
  // pill is drawn) exists: then it waits until every script has loaded.
  if(typeof renderRecordsPill === 'function') queueMicrotask(renderRecordsPill);
  else document.addEventListener('DOMContentLoaded', () => renderRecordsPill(), { once: true });
}

