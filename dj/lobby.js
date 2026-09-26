/* ────────────────────────────────────────────────────────────────────────
   Multiplayer lobby — DJ side. This screen is the authority on game state;
   the server just relays the state blob to the phones. Nothing below changes
   the game except players claiming a name.
   ──────────────────────────────────────────────────────────────────────── */

const roleOverlay = document.getElementById('roleOverlay');
const lobbyCard = document.getElementById('lobbyCard');
const lobbyCodeEl = document.getElementById('lobbyCode');
const lobbyUrlEl = document.getElementById('lobbyUrl');
const lobbyStatusEl = document.getElementById('lobbyStatus');
const lobbyStatusText = document.getElementById('lobbyStatusText');
const lobbyPhonesEl = document.getElementById('lobbyPhones');
const joinChip = document.getElementById('joinChip');
const joinChipCode = document.getElementById('joinChipCode');
const joinChipCount = document.getElementById('joinChipCount');
const joinChipQr = document.getElementById('joinChipQr');
const lobbyHostEl = document.getElementById('lobbyHost');
const lobbyQrEl = document.getElementById('lobbyQr');
const lobbyQrImg = document.getElementById('lobbyQrImg');
const lobbyQrUrlEl = document.getElementById('lobbyQrUrl');
const qrLobbyBtn = document.getElementById('qrLobbyBtn');
const copyLobbyBtn = document.getElementById('copyLobbyBtn');
const newLobbyBtn = document.getElementById('newLobbyBtn');
const endLobbyBtn = document.getElementById('endLobbyBtn');

const MAX_LOBBY_PLAYERS = 12;
const lobbyAvailable = typeof io !== 'undefined';

let lobbySocket = null;
let lobbyCode = null;
let lobbySecret = sessionStorage.getItem('vl_dj_secret') || null;
let broadcastQueued = false;
let pendingNewLobby = false;

function setLobbyStatus(kind, text){
  lobbyStatusEl.className = 'lobby-status' + (kind ? ' ' + kind : '');
  lobbyStatusText.textContent = text;
}

// Strip the state down to what phones actually need. Note the unrevealed card
// is sent as a bare flag — no title, artist or year — so nobody can peek at
// the answer from their own device.
function buildStateBlob(){
  let card = null;
  if(currentCard){
    card = revealed
      ? {
          revealed: true,
          id: currentCard.id,
          title: currentCard.title || '',
          artist: currentCard.artist || '',
          year: currentCard.year || null,
          month: currentCard.month || 1
        }
      : { revealed: false };
  }
  return {
    players: players.map(p => ({
      name: p.name,
      coinAdj: p.coinAdj || 0,
      streak: liveStreak(p),
      tie: tieToss(p),
      deviceId: p.deviceId || null,
      online: !!p.online,
      lastAddedId: p.lastAdded ? p.lastAdded.id : null,
      timeline: (p.timeline || []).map(e => ({
        id: e.id,
        year: e.year,
        month: e.month || 1,
        title: e.title || '',
        artist: e.artist || '',
        bonus: !!e.bonus,
        coins: coinValue(e)
      }))
    })),
    currentCard: card,
    revealed: revealed,
    playing: vinyl.classList.contains('spinning'),
    clip: clipRun ? {
      left: clipRun.running ? Math.max(0, clipRun.left - (Date.now() - clipRun.at)) : clipRun.left,
      total: clipRun.total,
      running: clipRun.running
    } : null,
    winLength: WIN_LENGTH,
    expertMode: expertMode,
    chaos: (gameMode === 'chaos' && chaos) ? {
      round: chaos.round,
      title: chaos.card.title,
      desc: chaos.card.desc,
      titleI18n: { en: chaos.card.title, da: chaos.card.titleDa || chaos.card.title },
      descI18n: { en: chaos.card.desc, da: chaos.card.descDa || chaos.card.desc },
      pending: !!chaos.pending,
      song: chaos.len - chaos.left,
      of: chaos.len
    } : null,
    turn: turnActive() ? turnName : null,
    bets: (song && song.bets && !song.settled) ? {
      id: song.bets.id,
      turn: song.turn,
      open: song.bets.open,
      placed: song.bets.placed
    } : null,
    betResults: lastBetResults,
    lockin: (song && song.lockin) ? {
      id: song.lockin.id,
      open: song.lockin.open,
      min: song.lockin.min,
      max: song.lockin.max,
      locked: Object.keys(song.lockin.guesses),
      year: song.lockin.year || null,
      results: song.lockin.results
    } : null,
    blind: chaosActive('blind'),
    event: eventText() ? { text: lastEvent.text, id: lastEvent.shownAt } : null,
    winner: gameWinner ? { name: gameWinner.name, target: gameWinner.target } : null,
    spot: spotOn() ? {
      songId: song.id,
      turn: song.turn,
      slot: song.spot != null ? song.spot : null,
      right: revealed && song.spot != null && !isNaN(parseInt(currentCard.year, 10)) ? spotRight(song.spot) : null
    } : null,
    // Tonight's revealed songs, newest first, so phones can open them in Spotify.
    songs: sessionHistory.filter(e => e.sessionId === currentSessionId).slice(-60).reverse()
      .map(e => ({ id: e.id || null, title: e.title || '', artist: e.artist || '', year: e.year || '' })),
    shop: shopOpen() ? {
      phase: shopPhase(),
      turn: turnActive() ? turnName : null,
      owned: !!(revealed && shopOwner()),
      hint: (song && song.hint) || null,
      passed: !!(song && song.passedFrom),
      clip: clipSeconds(),
      vibe: untimedMode,
      prices: { trap: shopPrice('trap') }
    } : null,
    hint: (song && song.hint && !revealed) ? song.hint : null,
    vote: vote ? {
      id: vote.id,
      pivot: vote.pivot,
      stakes: vote.stakes,
      open: vote.open,
      voted: Object.keys(vote.votes),
      year: vote.year || null,
      answer: vote.answer || null,
      results: vote.results
    } : null
  };
}

// One interaction can trigger several syncs; send a single blob.
function broadcastState(){
  if(!lobbySocket || !lobbyCode || broadcastQueued) return;
  broadcastQueued = true;
  setTimeout(() => {
    broadcastQueued = false;
    if(lobbySocket && lobbyCode) lobbySocket.emit('state:sync', buildStateBlob());
  }, 0);
}

// The address bar says "localhost" when the DJ is on their own machine, and no
// phone can reach that — the server tells us the LAN address to hand out
// instead. Falls back to our own origin if it can't work one out.
let shareOrigin = window.location.origin;
let shareOriginReady = false;

function loadShareOrigin(){
  return fetch('/share-origin')
    .then(r => r.json())
    .then(data => {
      if(data && data.origin) shareOrigin = data.origin;
      shareOriginReady = true;
    })
    .catch(() => { shareOriginReady = true; });
}

function playerLink(){
  return shareOrigin + '/player?code=' + lobbyCode;
}

let phoneCount = 0;
let awayCount = 0;

// The corner chip is the lobby's compact form once the game is running: code,
// phone count and a thumbnail QR, and a click brings the big join screen back.
function renderLobbySummary(){
  if(!lobbyCode){
    joinChipCode.textContent = '······';
    joinChipCount.textContent = '';
    joinChipQr.hidden = true;
    joinChipQr.removeAttribute('src');
    return;
  }
  joinChipCode.textContent = lobbyCode;
  const phones = (phoneCount === 1 ? '1 phone' : phoneCount + ' phones');
  joinChipCount.textContent = phones + (awayCount > 0 ? ' · ' + awayCount + ' away' : '');
  const qrPath = '/qr/' + lobbyCode + '.svg';
  if(!joinChipQr.src || !joinChipQr.src.includes(qrPath)){
    joinChipQr.src = qrPath;
  }
  joinChipQr.hidden = false;
}
joinChipQr.addEventListener('error', () => { joinChipQr.hidden = true; });

// Big per-character boxes on the join screen. Only for a live code — the
// "connecting…" / "lobby ended" states stay plain text.
function renderCodeBoxes(){
  if(!lobbyCode || lobbyCodeEl.classList.contains('pending')) return;
  lobbyCodeEl.innerHTML = lobbyCode.split('').map(c => '<span class="ch">' + escapeHtml(c) + '</span>').join('');
}

function renderLobby(){
  if(!lobbyCode){
    lobbyCodeEl.textContent = 'connecting…';
    lobbyCodeEl.classList.add('pending');
    lobbyUrlEl.innerHTML = '&nbsp;';
    copyLobbyBtn.disabled = true;
    endLobbyBtn.disabled = true;
    qrLobbyBtn.disabled = true;
    closeQr();
  }else{
    lobbyCodeEl.classList.remove('pending');
    renderCodeBoxes();
    lobbyHostEl.textContent = shareOrigin.replace(/^https?:\/\//, '') + '/player';
    lobbyUrlEl.textContent = 'click the code to copy it';
    copyLobbyBtn.disabled = false;
    endLobbyBtn.disabled = false;
    qrLobbyBtn.disabled = false;
    // The QR is always up on the join screen. Repoint it when the code changes
    // (New lobby, or a resume that minted a fresh one) — but don't reload an
    // image that already shows the right code, or it flickers.
    if(!lobbyQrImg.src || !lobbyQrImg.src.includes('/qr/' + lobbyCode + '.svg')) openQr();
  }
  newLobbyBtn.disabled = !lobbySocket || !lobbySocket.connected;
  renderLobbySummary();
}

// Minting a lobby invalidates the code everyone just typed in, so it gets a
// short lockout — enough to stop a double-click wiping the room twice. Silent
// by design: the button looks normal, the click just doesn't land.
const NEW_LOBBY_COOLDOWN_MS = 10000;
let newLobbyCooldownUntil = 0;

function closeQr(){
  lobbyQrEl.classList.remove('open');
  qrLobbyBtn.textContent = 'Show QR';
  lobbyQrImg.removeAttribute('src');
}

function openQr(){
  lobbyQrImg.src = '/qr/' + lobbyCode + '.svg';
  lobbyQrUrlEl.textContent = playerLink();
  lobbyQrEl.classList.add('open');
  qrLobbyBtn.textContent = 'Hide QR';
}

// Chips come from our own player list, not the server roster — that way a
// phone that drops out stays on show as "away" instead of vanishing.
let armedKickDevice = null;

function renderPhones(){
  lobbyPhonesEl.innerHTML = '';
  const claimed = players.filter(p => p.deviceId);
  phoneCount = claimed.length;
  awayCount = claimed.filter(p => !p.online).length;
  renderLobbySummary();

  if(claimed.length === 0){
    lobbyPhonesEl.innerHTML = '<span class="lobby-sub">no phones connected yet</span>';
    armedKickDevice = null;
    return;
  }

  claimed.forEach(player => {
    const armed = armedKickDevice === player.deviceId;
    const chip = document.createElement('button');
    chip.className = 'phone-chip' + (armed ? ' armed' : '');
    chip.title = armed ? 'Click again to remove ' + player.name : 'Click to remove ' + player.name;

    const dot = document.createElement('span');
    dot.className = 'dot' + (player.online ? '' : ' away');
    dot.title = player.online ? 'connected' : 'away — phone disconnected';
    chip.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = armed ? 'Kick' : player.name;
    chip.appendChild(label);

    chip.addEventListener('click', () => {
      if(armed){ kickPlayer(player); return; }
      armedKickDevice = player.deviceId;
      renderPhones();
    });
    // Wandering off cancels it, so a stray click never becomes a kick.
    chip.addEventListener('mouseleave', () => {
      if(armedKickDevice !== player.deviceId) return;
      armedKickDevice = null;
      renderPhones();
    });

    lobbyPhonesEl.appendChild(chip);
  });
}

// Dropping someone from the board has to boot their phone too, or it sits
// there "in the game" with no slot on the scoreboard. Sends them back to pick
// a name — the lobby itself stays open.
function evictPhone(player, reason){
  if(!lobbySocket || !lobbyCode || !player || !player.deviceId) return;
  lobbySocket.emit('lobby:kick', { deviceId: player.deviceId, reason: reason || 'kicked' });
  player.deviceId = null;
  player.online = false;
}

function evictAllPhones(reason){
  players.filter(p => p.deviceId).forEach(p => evictPhone(p, reason));
}

function kickPlayer(player){
  armedKickDevice = null;
  evictPhone(player, 'kicked');
  const idx = players.indexOf(player);
  if(idx > -1) players.splice(idx, 1);
  if(players.length === 0) resetDeckProgress();
  lobbyToast(player.name + ' was kicked');
  renderScoreboard();
  renderPhones();
}

let toastTimer = null;
// Game events (coins moving, cards lost, shop buys) toast like everything
// else, and also stay on the stage — and the phones — through the next song,
// so nobody has to catch the toast.
let lastEvent = null; // { text, at: draw count }
// The big screen shows a notice this long; phones keep it through the next song.
const EVENT_DJ_MS = 10000;
let eventTimer = null;
let drawCount = 0;
// `cardId`: the event is about that card (a streak coin) — taking the card
// back takes the event with it.
// `message`: a string, or { en, da } — the DJ screen shows English, each
// phone picks its own language.
function gameEvent(message, cardId){
  lobbyToast(enText(message));
  lastEvent = { text: message, at: drawCount, cardId: cardId || null, shownAt: Date.now() };
  renderEvent();
  clearTimeout(eventTimer);
  eventTimer = setTimeout(renderEvent, EVENT_DJ_MS + 50);
}

function forgetCardEvent(cardId){
  if(!lastEvent || lastEvent.cardId !== cardId) return;
  lastEvent = null;
  const toast = document.querySelector('.join-toast');
  if(toast) toast.remove();
  renderEvent();
}

function eventText(){
  return lastEvent && drawCount - lastEvent.at <= 1 ? lastEvent.text : null;
}
function enText(text){
  return text && typeof text === 'object' ? text.en : text;
}
// Danish possessive: "Idas", "Lars’".
function daGen(name){
  return /[sxz]$/i.test(name) ? name + '’' : name + 's';
}

function renderEvent(){
  const fresh = lastEvent && Date.now() - lastEvent.shownAt < EVENT_DJ_MS;
  const text = fresh ? enText(eventText()) : null;
  document.getElementById('eventBox').hidden = !text;
  document.getElementById('eventLine').textContent = text || '';
  broadcastState();
}

function lobbyToast(message){
  const existing = document.querySelector('.join-toast');
  if(existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'join-toast';
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

// A phone asked to join. Two ways in: claim a name the DJ already created, or
// register a brand new one. Same device coming back always gets its slot back.
function handleJoinRequest(req){
  const norm = s => (s || '').trim().toLowerCase();
  const accept = (player) => {
    player.online = true;
    lobbySocket.emit('player:join-result', { socketId: req.socketId, ok: true, name: player.name });
    renderScoreboard();
    renderPhones();
  };
  const reject = (reason) => {
    lobbySocket.emit('player:join-result', { socketId: req.socketId, ok: false, reason });
  };

  const returning = players.find(p => p.deviceId && p.deviceId === req.deviceId);
  // The phone picked the wrong name and asked to switch: free its old slot
  // (the cards stay on the board) and carry on as a fresh claim below.
  if(returning && req.switch && norm(returning.name) !== norm(req.name)){
    const wanted = players.find(p => norm(p.name) === norm(req.name));
    if(wanted && wanted.deviceId){
      reject('“' + wanted.name + '” is already taken by another phone.');
      return;
    }
    if(!wanted && players.length >= MAX_LOBBY_PLAYERS){
      reject('This game is full (' + MAX_LOBBY_PLAYERS + ' players).');
      return;
    }
    returning.deviceId = null;
    returning.online = false;
    lobbyToast(returning.name + ' switched to ' + (wanted ? wanted.name : capitalizeFirst(req.name)));
  }else if(returning){
    accept(returning);
    lobbyToast(returning.name + ' reconnected');
    return;
  }

  const claimed = players.find(p => norm(p.name) === norm(req.name));
  if(claimed){
    if(claimed.deviceId){
      reject('“' + claimed.name + '” is already taken by another phone.');
      return;
    }
    claimed.deviceId = req.deviceId;
    accept(claimed);
    lobbyToast(claimed.name + ' joined from a phone');
    return;
  }

  if(players.length >= MAX_LOBBY_PLAYERS){
    reject('This game is full (' + MAX_LOBBY_PLAYERS + ' players).');
    return;
  }

  const created = {
    name: capitalizeFirst(req.name),
    timeline: [],
    lastAdded: null,
    deviceId: req.deviceId,
    online: true
  };
  players.push(created);
  accept(created);
  lobbyToast(created.name + ' joined the game');
}

function hostLobby(){
  if(!lobbyAvailable){
    lobbyCard.style.display = 'none';
    joinChip.hidden = true;
    setStageMode('deck');
    return;
  }
  loadShareOrigin().then(() => { if(lobbyCode) renderLobby(); });
  lobbySocket = io({ transports: ['websocket', 'polling'] });

  // Passing the saved code + secret resumes that lobby; passing nothing mints
  // a fresh one.
  function openLobby(resume){
    const payload = resume
      ? { code: sessionStorage.getItem('vl_dj_code'), djSecret: lobbySecret }
      : {};
    lobbySocket.emit('lobby:create', payload, (res) => {
      if(!res || !res.ok){
        setLobbyStatus('down', res && res.error === 'rate-limited' ? 'too many lobbies — try later' : 'lobby failed');
        return;
      }
      lobbyCode = res.code;
      lobbySecret = res.djSecret;
      sessionStorage.setItem('vl_dj_code', lobbyCode);
      sessionStorage.setItem('vl_dj_secret', lobbySecret);
      setLobbyStatus('live', 'live');
      renderLobby();
      renderPhones();
      broadcastState();
    });
  }

  lobbySocket.on('connect', () => openLobby(true));
  lobbySocket.openLobby = openLobby;

  lobbySocket.on('disconnect', () => {
    setLobbyStatus('down', 'offline');
    newLobbyBtn.disabled = true;
  });

  lobbySocket.on('player:join-request', handleJoinRequest);

  lobbySocket.on('player:bet', placeBet);
  lobbySocket.on('player:lockin', placeLockin);
  lobbySocket.on('player:spot', placeSpot);
  lobbySocket.on('player:buy', phoneBuy);
  // A phone opened its recap card: send just that player's numbers.
  lobbySocket.on('player:recap-get', (payload) => {
    const p = payload && players.find(p => p.deviceId && p.deviceId === payload.deviceId);
    lobbySocket.emit('recap:reply', { reqId: payload && payload.reqId, data: p ? recapCardData(p) : null });
  });

  lobbySocket.on('player:vote', (payload) => {
    if(!vote || !vote.open || !payload || payload.voteId !== vote.id) return;
    if(payload.choice !== 'before' && payload.choice !== 'after') return;
    if(!players.some(p => p.deviceId && p.deviceId === payload.deviceId)) return;
    vote.votes[payload.deviceId] = payload.choice;
    renderVote();
    broadcastState();
  });

  lobbySocket.on('player:left', (payload) => {
    const player = players.find(p => p.deviceId && p.deviceId === payload.deviceId);
    if(!player) return;
    player.online = false;
    lobbyToast(player.name + ' disconnected');
    renderScoreboard();
    renderPhones();
  });

  // Server roster changes are just a nudge — the chips read from our own list.
  lobbySocket.on('lobby:roster', () => renderPhones());

  lobbySocket.on('lobby:end', () => {
    lobbyCode = null;
    lobbySecret = null;
    sessionStorage.removeItem('vl_dj_code');
    sessionStorage.removeItem('vl_dj_secret');
    players.forEach(p => { p.deviceId = null; p.online = false; });
    renderPhones();
    renderScoreboard();

    if(pendingNewLobby){
      pendingNewLobby = false;
      openLobby(false);
      return;
    }
    // renderLobby's no-lobby branch does the whole teardown — greys out every
    // button and folds the QR away. Only the headline text differs.
    renderLobby();
    setLobbyStatus('', 'ended');
    lobbyCodeEl.textContent = 'lobby ended';
  });
}

// Clicking the big code copies the code itself — the link lives on its own
// button. Feedback goes in the sub-line so the code stays readable while
// someone's still typing it in.
let codeCopyTimer = null;
lobbyCodeEl.addEventListener('click', async () => {
  if(!lobbyCode) return;
  let message = 'code copied';
  try{
    await navigator.clipboard.writeText(lobbyCode);
  }catch(e){
    message = 'press ⌘C to copy';
    const range = document.createRange();
    range.selectNodeContents(lobbyCodeEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  lobbyUrlEl.textContent = message;
  clearTimeout(codeCopyTimer);
  codeCopyTimer = setTimeout(renderLobby, 1600);
});

qrLobbyBtn.addEventListener('click', () => {
  if(!lobbyCode) return;
  if(lobbyQrEl.classList.contains('open')) closeQr(); else openQr();
});

// A QR that resolves to localhost would silently fail on every phone that
// scans it, so say so rather than showing a dud code.
lobbyQrImg.addEventListener('error', () => {
  lobbyQrUrlEl.innerHTML = '<span class="lobby-qr-warn">Couldn\'t build a QR — this machine has no network address phones can reach. Get everyone on the same wifi, or deploy the site.</span>';
});

copyLobbyBtn.addEventListener('click', async () => {
  if(!lobbyCode) return;
  const original = copyLobbyBtn.textContent;
  try{
    await navigator.clipboard.writeText(playerLink());
    copyLobbyBtn.textContent = 'Copied';
  }catch(e){
    copyLobbyBtn.textContent = playerLink();
  }
  setTimeout(() => { copyLobbyBtn.textContent = original; }, 1600);
});

endLobbyBtn.addEventListener('click', async () => {
  if(!lobbyCode) return;
  const ok = await showConfirm('End the lobby? Every phone gets kicked out and the code stops working. The game on this screen carries on.');
  if(!ok) return;
  lobbySocket.emit('lobby:end');
});

newLobbyBtn.addEventListener('click', async () => {
  if(!lobbySocket || !lobbySocket.connected) return;
  if(newLobbyCooldownUntil > Date.now()) return;
  if(lobbyCode){
    const ok = await showConfirm('Start a new lobby? The current code stops working and everyone has to rejoin with the new one. Scores and timelines stay put.');
    if(!ok) return;
    // The server closes the old lobby first; we mint the new one once it
    // confirms, so we never hold two at once.
    pendingNewLobby = true;
    newLobbyCooldownUntil = Date.now() + NEW_LOBBY_COOLDOWN_MS;
    lobbySocket.emit('lobby:end');
  }else{
    newLobbyCooldownUntil = Date.now() + NEW_LOBBY_COOLDOWN_MS;
    lobbySocket.openLobby(false);
  }
});

