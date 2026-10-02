function totalTracks(){
  return playlists.reduce((sum,p) => sum + p.tracks.length, 0);
}
function drawnTracks(){
  return playlists.reduce((sum,p) => sum + p.tracks.filter(t=>t.drawn).length, 0);
}

function refreshStatus(){
  queueMicrotask(renderRecordsPill);
  const total = totalTracks();
  if(total === 0){
    deckStatus.textContent = 'no deck yet';
    offStatus.textContent = '';
    return;
  }
  const enabledPlaylists = playlists.filter(p => p.enabled);
  const offPlaylists = playlists.filter(p => !p.enabled);
  const activeTotal = enabledPlaylists.reduce((sum,p) => sum + p.tracks.length, 0);
  const offTotal = offPlaylists.reduce((sum,p) => sum + p.tracks.length, 0);
  deckStatus.textContent = activeTotal + ' tracks across ' + enabledPlaylists.length + ' playlist' + (enabledPlaylists.length===1?'':'s') + ' — ' + drawnTracks() + ' drawn';
  offStatus.textContent = offPlaylists.length
    ? offPlaylists.length + ' playlist' + (offPlaylists.length===1?'':'s') + ' off (' + offTotal + ' tracks)'
    : '';
}

// Thousands of rows in a usually-closed drawer tab: while hidden, just mark it
// stale and build it when the tab is shown.
let tracklistStale = false;
function tracklistVisible(){
  const panel = tracklistEl.closest('.dr-panel');
  return document.getElementById('recordsDrawer').classList.contains('open') && !(panel && panel.hidden);
}

function renderTracklist(){
  queueMicrotask(renderCrates);
  if(!tracklistVisible()){
    tracklistStale = true;
    saveSession();
    return;
  }
  tracklistStale = false;
  tracklistEl.innerHTML = '';
  if(playlists.length === 0){
    tracklistEl.innerHTML = '<div class="empty">Build a deck above to see your tracks here.</div>';
    saveSession();
    return;
  }
  playlists.forEach((p, pIndex) => {
    const group = document.createElement('details');
    group.className = 'plist-group';
    group.open = p.expanded !== false;
    group.addEventListener('toggle', () => { p.expanded = group.open; });

    const summary = document.createElement('summary');
    summary.className = 'plist-summary';

    const revealedCount = p.tracks.filter(t => t.revealedOnce).length;
    const label = document.createElement('span');
    label.className = 'plist-name';
    label.innerHTML = escapeHtml(p.name) + '<span class="plist-meta">' + revealedCount + ' / ' + p.tracks.length + ' tracks revealed' + (p.enabled ? '' : ' · off') + '</span>';
    summary.appendChild(label);

    const controls = document.createElement('span');
    controls.className = 'plist-controls';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'plist-btn' + (p.enabled ? '' : ' off');
    toggleBtn.textContent = p.enabled ? 'On' : 'Off';
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePlaylist(p);
    });
    controls.appendChild(toggleBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'plist-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removePlaylist(p);
    });
    controls.appendChild(removeBtn);

    summary.appendChild(controls);
    group.appendChild(summary);

    const trackList = document.createElement('ul');
    trackList.className = 'plist-tracks';
    p.tracks.forEach((card, i) => {
      const li = document.createElement('li');
      const showName = card.revealedOnce || revealAllNames;
      const nameText = showName
        ? (card.title + (card.artist ? ' — ' + card.artist : ''))
        : 'in the deck';
      li.innerHTML = `
        <span class="num">${String(i+1).padStart(2,'0')}</span>
        <span class="tname ${showName ? '' : 'pending'}" title="${showName ? escapeHtml(nameText) : ''}">${escapeHtml(nameText)}</span>
        <span class="tyear">${showName ? escapeHtml(String(card.year)) : ''}</span>
        <span class="badge ${card.revealedOnce ? 'drawn' : ''}">${card.revealedOnce ? 'drawn' : 'deck'}</span>
      `;
      trackList.appendChild(li);
    });
    const closeLi = document.createElement('li');
    closeLi.className = 'plist-close-row-inline';
    closeLi.innerHTML = `<span class="num close-arrow" title="Collapse playlist"><svg width="10" height="8" viewBox="0 0 10 8" xmlns="http://www.w3.org/2000/svg"><polygon points="5,0 10,8 0,8" fill="currentColor"/></svg></span>`;
    closeLi.addEventListener('click', () => {
      group.open = false;
      group.scrollIntoView({ block: 'nearest' });
    });
    trackList.appendChild(closeLi);
    group.appendChild(trackList);
    tracklistEl.appendChild(group);
  });
  saveSession();
}

revealAllBtn.addEventListener('click', () => {
  revealAllNames = !revealAllNames;
  revealAllBtn.textContent = revealAllNames ? 'Hide names again' : 'Reveal all names';
  renderTracklist();
});

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let WIN_LENGTH = 10;

const COIN_SVG = '<svg viewBox="0 0 20 20" width="13" height="13" style="display:block;"><circle cx="10" cy="10" r="9" fill="var(--gold)" stroke="#8C6F3B" stroke-width="1.5"/><circle cx="10" cy="10" r="5" fill="none" stroke="#241A0B" stroke-width="1.2"/></svg>';
const CARD_ICON_SVG = '<svg viewBox="0 0 16 20" width="12" height="15" style="display:block;"><rect x="1" y="1" width="14" height="18" rx="2.5" fill="none" stroke="var(--gold)" stroke-width="1.5"/><circle cx="8" cy="10" r="2" fill="var(--gold)"/></svg>';

function medalSVG(rank){
  const fills = {1: 'var(--gold)', 2: '#C9C9C9', 3: '#C98A4B'};
  const rings = {1: '#8C6F3B', 2: '#8A8A8A', 3: '#8C5A2E'};
  return '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="' + fills[rank] + '" stroke="' + rings[rank] + '" stroke-width="2"/><circle cx="22" cy="22" r="11" fill="none" stroke="#241A0B" stroke-width="1.6"/></svg>';
}

// Coins a card carries: 0, 1, or 2 when it was won in a double-coins round.
// The title/artist coin on a card: 0, 1, or 2 in a double-coins round.
function titleCoins(entry){
  return entry.bonus ? (entry.coins || 1) : 0;
}

// Every coin a card carries: its title coin plus the one a double-or-nothing
// win comes with.
function coinValue(entry){
  return titleCoins(entry) + (entry.donCoin ? 2 : 0) + (entry.streakCoin ? 1 : 0);
}

// Coins on cards, plus coins won or lost outside them (over/under). Can go
// below zero.
function bonusCount(player){
  return player.timeline.reduce((sum, e) => sum + coinValue(e), 0) + (player.coinAdj || 0);
}

function toggleCoin(entry){
  const before = coinValue(entry);
  entry.bonus = !entry.bonus;
  if(entry.bonus) entry.coins = chaosCoinValue();
  else delete entry.coins;
  const diff = coinValue(entry) - before;
  statsCoinsWon = Math.max(0, statsCoinsWon + diff);
  sessionCoinsWon = Math.max(0, sessionCoinsWon + diff);
}

function uncountCoins(entry){
  statsCoinsWon = Math.max(0, statsCoinsWon - coinValue(entry));
  sessionCoinsWon = Math.max(0, sessionCoinsWon - coinValue(entry));
}

function playerGaps(player){
  let values;
  if(expertMode){
    values = player.timeline.map(e => e.year * 12 + ((e.month || 1) - 1));
  }else{
    values = player.timeline.map(e => e.year);
  }
  values = values.slice().sort((a,b) => a - b);
  const gaps = [];
  for(let i = 0; i < values.length - 1; i++) gaps.push(values[i+1] - values[i]);
  gaps.sort((a,b) => a - b);
  return gaps;
}

function comparePlayers(a, b){
  if(b.timeline.length !== a.timeline.length) return b.timeline.length - a.timeline.length;
  const bonusDiff = bonusCount(b) - bonusCount(a);
  if(bonusDiff !== 0) return bonusDiff;
  const gapsA = playerGaps(a);
  const gapsB = playerGaps(b);
  const len = Math.min(gapsA.length, gapsB.length);
  for(let i = 0; i < len; i++){
    if(gapsA[i] !== gapsB[i]) return gapsA[i] - gapsB[i];
  }
  if(gapsA.length !== gapsB.length) return gapsA.length - gapsB.length;
  // Still level: a coin toss, tossed once per player so the order doesn't
  // flicker — not the alphabet, which always favoured Andrea over William.
  return tieToss(a) - tieToss(b);
}
function tieToss(p){
  if(typeof p.tie !== 'number') p.tie = Math.random();
  return p.tie;
}
// Whoever's lowest (or highest) by `score`, a random one of them on a tie.
function pickRandom(list){
  return list[Math.floor(Math.random() * list.length)];
}

function renderScoreboard(){
  checkWinner();
  scoreboardEl.innerHTML = '';
  if(players.length === 0){
    scoreboardEl.innerHTML = '<p class="empty">No players yet — add someone above. When they guess a card\'s spot right, tap the add-card tile to drop it into their timeline.</p>';
    afterScoreboardRender();
    saveSession();
    return;
  }
  const sorted = players.slice().sort(comparePlayers);
  const leader = sorted[0];
  const leaderLen = leader.timeline.length;
  const canAdd = revealed && currentCard && currentCard.year && !isNaN(parseInt(currentCard.year, 10)) && !(song && song.event);

  players.forEach((player) => {
    const isTrueLeader = comparePlayers(player, leader) === 0;
    const block = document.createElement('div');
    block.className = 'player-block' + (leaderLen > 0 && isTrueLeader ? ' leader' : '');

    const header = document.createElement('div');
    header.className = 'player-header';

    const rankEl = document.createElement('span');
    rankEl.className = 'player-rank';
    rankEl.textContent = String(sorted.indexOf(player) + 1).padStart(2, '0');
    header.appendChild(rankEl);

    const claimDot = document.createElement('span');
    claimDot.className = 'player-claim' + (player.online ? '' : ' off');
    claimDot.title = player.online
      ? player.name + "'s phone is connected"
      : player.deviceId ? player.name + "'s phone dropped out" : 'no phone claimed this name yet';
    header.appendChild(claimDot);

    // Editable in place so the DJ can fix a typo (or rename a self-registered
    // player) without wiping their timeline.
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'player-name-input';
    name.value = player.name;
    name.size = Math.max(4, player.name.length);
    name.title = 'Click to rename';
    name.addEventListener('input', () => { name.size = Math.max(4, name.value.length); });
    name.addEventListener('keydown', (e) => { if(e.key === 'Enter') name.blur(); });
    name.addEventListener('blur', () => {
      const next = capitalizeFirst(name.value.trim());
      if(!next || next === player.name){ name.value = player.name; return; }
      if(nameTaken(next, player)){
        lobbyToast('“' + next + '” is already on the board');
        name.value = player.name;
        name.size = Math.max(4, player.name.length);
        return;
      }
      if(turnName === player.name) turnName = next;
      player.name = next;
      renderScoreboard();
    });
    header.appendChild(name);
    header.appendChild(buildPips(player.timeline.length, WIN_LENGTH));

    const badge = winBadge(player, isTrueLeader);
    if(badge){
      const win = document.createElement('span');
      win.className = 'player-win-badge';
      win.textContent = badge;
      win.title = badge === 'WON' ? 'First to ' + gameWinner.target + ' cards' : 'Leading now, past the target';
      header.appendChild(win);
    }

    const bonusWrap = document.createElement('span');
    bonusWrap.className = 'player-bonus';
    bonusWrap.innerHTML = COIN_SVG;
    const bonusLabel = document.createElement('span');
    bonusLabel.textContent = bonusCount(player);
    bonusWrap.appendChild(bonusLabel);
    header.appendChild(bonusWrap);

    const count = document.createElement('span');
    count.className = 'player-count';
    count.textContent = player.timeline.length;
    header.appendChild(count);

    const actions = document.createElement('span');
    actions.className = 'player-actions';

    const saveTimelineBtn = document.createElement('button');
    saveTimelineBtn.className = 'icon-btn';
    saveTimelineBtn.title = "Save " + player.name + "'s timeline as an image";
    saveTimelineBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    saveTimelineBtn.addEventListener('click', () => saveTimelineAsImage(player));
    actions.appendChild(saveTimelineBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove player';
    removeBtn.addEventListener('click', async () => {
      const ok = await showConfirm('Remove ' + player.name + ' and their timeline? This can\'t be undone.');
      if(!ok) return;
      evictPhone(player, 'kicked');
      const idx = players.indexOf(player);
      if(idx > -1) players.splice(idx, 1);
      if(players.length === 0) resetDeckProgress();
      renderScoreboard();
      renderPhones();
    });
    actions.appendChild(removeBtn);

    header.appendChild(actions);
    block.appendChild(header);

    const timelineRow = document.createElement('div');
    timelineRow.className = 'player-timeline';
    timelineRow.addEventListener('dragover', (e) => {
      if(!draggedEntry) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      timelineRow.classList.add('drag-over');
    });
    timelineRow.addEventListener('dragleave', () => {
      timelineRow.classList.remove('drag-over');
    });
    timelineRow.addEventListener('drop', (e) => {
      e.preventDefault();
      timelineRow.classList.remove('drag-over');
      if(!draggedEntry || !draggedFromPlayer || draggedFromPlayer === player) return;
      const idx = draggedFromPlayer.timeline.indexOf(draggedEntry);
      if(idx > -1) draggedFromPlayer.timeline.splice(idx, 1);
      player.timeline.push(draggedEntry);
      player.timeline.sort((a,b) => (a.year - b.year) || ((a.month||1) - (b.month||1)));
      if(draggedFromPlayer.lastAdded === draggedEntry) draggedFromPlayer.lastAdded = null;
      draggedEntry = null;
      draggedFromPlayer = null;
      renderScoreboard();
    });

    const gapInfo = timelineGaps(player.timeline);
    const blind = chaosActive('blind');
    player.timeline.forEach((entry, i) => {
      const isNew = player.lastAdded === entry;
      const card = document.createElement('div');
      card.className = 'vinyl-card' + (entry.bonus ? ' has-bonus' : '') + (isNew ? ' is-new' : '');
      card.draggable = true;
      if(i > 0) card.appendChild(buildGapEl(blind ? null : gapInfo[i]));
      if(isNew){
        const tag = document.createElement('span');
        tag.className = 'card-new-tag';
        tag.textContent = 'just in';
        card.appendChild(tag);
      }
      card.addEventListener('dragstart', (e) => {
        draggedEntry = entry;
        draggedFromPlayer = player;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        startAutoScroll();
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedEntry = null;
        draggedFromPlayer = null;
        stopAutoScroll();
      });
      if(blind){
        const yearEl = document.createElement('div');
        yearEl.className = 'vinyl-card-year blind';
        yearEl.textContent = '?';
        card.appendChild(yearEl);
      }else{
        appendCardYear(card, entry);
      }
      if(entry.title){
        const titleEl = document.createElement('div');
        titleEl.className = 'vinyl-card-title';
        titleEl.textContent = entry.title;
        card.appendChild(titleEl);
      }
      if(entry.artist){
        const artistEl = document.createElement('div');
        artistEl.className = 'vinyl-card-artist';
        artistEl.textContent = entry.artist;
        card.appendChild(artistEl);
      }
      if(coinValue(entry) > 0){
        const badge = document.createElement('div');
        badge.className = 'card-bonus-badge';
        badge.innerHTML = COIN_SVG.repeat(coinValue(entry));
        card.appendChild(badge);
      }
      if(!entry.locked && !entry.sang){
        const bonusToggle = document.createElement('button');
        bonusToggle.className = 'card-bonus-toggle';
        bonusToggle.innerHTML = COIN_SVG;
        bonusToggle.title = entry.bonus ? 'Remove title + artist bonus' : 'Mark title + artist guessed correctly (bonus point)';
        bonusToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleCoin(entry);
          renderScoreboard();
        });
        card.appendChild(bonusToggle);
      }
      {
        const removeCardBtn = document.createElement('button');
        removeCardBtn.className = 'card-remove-btn';
        removeCardBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>';
        removeCardBtn.setAttribute('aria-label', 'Remove this card');
        removeCardBtn.title = 'Remove this card';
        removeCardBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          // Earlier rounds' cards are settled, so taking one away asks first.
          if(entry.locked && !(await showConfirm('Remove ' + entry.year + (entry.title ? ' — ' + entry.title : '') + ' from ' + player.name + "'s timeline?"))) return;
          const idx = player.timeline.indexOf(entry);
          if(idx > -1) player.timeline.splice(idx, 1);
          if(player.lastAdded === entry) player.lastAdded = null;
          statsCardsPlaced = Math.max(0, statsCardsPlaced - 1);
          sessionCardsPlaced = Math.max(0, sessionCardsPlaced - 1);
          uncountCoins(entry);
          if(!entry.locked) forgetCardEvent(entry.id);
          renderScoreboard();
        });
        card.appendChild(removeCardBtn);
      }
      timelineRow.appendChild(card);
    });

    const claimedBy = canAdd ? players.find(p => p.timeline.some(e => e.id === currentCard.id && !e.locked)) : null;
    const claimedByThisPlayer = claimedBy === player;
    const canAddForPlayer = canAdd && !claimedBy;

    const addSlot = document.createElement('button');
    addSlot.className = 'vinyl-card add-slot';
    addSlot.disabled = !canAddForPlayer;
    if(player.timeline.length > 0) addSlot.appendChild(buildGapEl(null));
    addSlot.title = !canAdd
      ? 'Reveal a card first'
      : claimedByThisPlayer
        ? 'Already added — remove it first to re-add'
        : claimedBy
          ? 'Already claimed by ' + claimedBy.name + ' this round'
          : 'Add ' + currentCard.year + ' to this player\'s timeline';
    const plusIcon = document.createElement('div');
    plusIcon.className = 'plus-icon';
    plusIcon.textContent = '+';
    addSlot.appendChild(plusIcon);
    const addLabel = document.createElement('div');
    addLabel.className = 'add-slot-label';
    addLabel.textContent = !canAdd ? 'no card' : claimedByThisPlayer ? 'added' : claimedBy ? 'taken' : currentCard.year;
    addSlot.appendChild(addLabel);
    addSlot.addEventListener('click', () => {
      if(!canAddForPlayer) return;
      giveCardTo(player);
    });
    timelineRow.appendChild(addSlot);


    block.appendChild(timelineRow);
    scoreboardEl.appendChild(block);
  });
  afterScoreboardRender();
  saveSession();
}

// The revealed card goes into this player's timeline. Shared by the add-tile
// in the timelines panel and the "Who placed it right?" chips on the stage.
// `bought`: paid for in the coin shop rather than won, so no double-or-nothing coin.
// The game's winner: the first player to reach the target. It stays theirs
// if you play on and someone passes them (that player "WINS" — leads — but
// this one "WON"). Raising the target reopens the win; lowering it keeps it.
// { name, target, cardId } — cardId is the winning card: take it back and the
// win goes with it.
let gameWinner = null;
// Settle who won. True when a new winner was just crowned.
function checkWinner(){
  if(gameWinner){
    const w = players.find(p => p.name === gameWinner.name);
    if(w && (!gameWinner.cardId || w.timeline.some(e => e.id === gameWinner.cardId))) return false;
    gameWinner = null;
  }
  const leader = players.slice().sort(comparePlayers)[0];
  if(!leader || leader.timeline.length < WIN_LENGTH) return false;
  const card = leader.lastAdded || latestCard(leader);
  gameWinner = { name: leader.name, target: WIN_LENGTH, cardId: card ? card.id : null };
  return true;
}
// 'WON' for the winner, 'WINS' for someone else leading past the target.
function winBadge(player, isLeader){
  if(gameWinner && gameWinner.name === player.name) return 'WON';
  return isLeader && player.timeline.length >= WIN_LENGTH ? 'WINS' : null;
}

function announceWinner(){
  gameEvent({
    en: '🏆 ' + gameWinner.name + ' wins — first to ' + gameWinner.target + ' cards!',
    da: '🏆 ' + gameWinner.name + ' vinder — først til ' + gameWinner.target + ' kort!'
  });
}

// The streak as it stands right now: the settled run, plus this song's card
// if they've just been given it on their own turn.
function liveStreak(p){
  const s = p.streak || 0;
  if(!autoTurns || !song || song.settled || song.event || song.turn !== p.name) return s;
  return p.timeline.some(e => e.id === song.id && !e.locked && !e.bought) ? s + 1 : s;
}

// Hot streak: cards won on your own turn in a row (automatic turns only).
// `player.streak` counts the settled ones; bought cards don't count.
const STREAK_FROM = 3;
function ownTurnCard(player, bought){
  return !bought && autoTurns && !!song && !song.event && song.id === currentCard.id && song.turn === player.name;
}

function giveCardTo(player, bought){
  if(!currentCard) return;
  const entry = {
    id: currentCard.id,
    year: parseInt(currentCard.year, 10),
    month: currentCard.month || null,
    title: currentCard.title || '',
    artist: currentCard.artist || '',
    bonus: false,
    locked: false,
    addedAt: Date.now()
  };
  if(bought) entry.bought = true;
  // Double or nothing, won on your own turn: the card comes with 2 coins.
  if(!bought && chaosActive('don') && turnActive() && player.name === turnName){
    entry.donCoin = true;
    statsCoinsWon += 2;
    sessionCoinsWon += 2;
  }
  // Hot streak: from the STREAK_FROM-th card in a row on your own turns,
  // every card comes with a coin.
  const streak = ownTurnCard(player, bought) ? (player.streak || 0) + 1 : 0;
  if(streak >= STREAK_FROM){
    entry.streakCoin = true;
    statsCoinsWon++;
    sessionCoinsWon++;
    gameEvent({ en: '🔥 ' + player.name + ': ' + streak + ' in a row, +1 coin', da: '🔥 ' + player.name + ': ' + streak + ' i træk, +1 mønt' }, entry.id);
  }
  player.timeline.push(entry);
  player.timeline.sort((a,b) => (a.year - b.year) || ((a.month||1) - (b.month||1)));
  player.lastAdded = entry;
  statsCardsPlaced++;
  sessionCardsPlaced++;
  if(checkWinner()) announceWinner();
  renderScoreboard();
}

const scoreboardOverlay = document.getElementById('scoreboardOverlay');
const closeScoreboardBtn = document.getElementById('closeScoreboardBtn');

// view: 'list' | 'podium' | 'recap' — jumps straight to that tab when given.
function openScoreboard(view){
  if(typeof view === 'string'){
    const btn = document.querySelector('.scoreboard-panel-header .sb-view-btn[data-sbview="' + view + '"]');
    if(btn) btn.click();
  }
  scoreboardOverlay.classList.add('open');
  menuTrigger.classList.add('hidden');
  closeRecords();
  requestAnimationFrame(markRowStarts);
}
function closeScoreboard(){
  scoreboardOverlay.classList.remove('open');
  if(!recordsDrawer.classList.contains('open')) menuTrigger.classList.remove('hidden');
}

document.querySelectorAll('.scoreboard-panel-header .sb-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.scoreboard-panel-header .sb-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    positionToggleSlider(btn.closest('.sb-view-toggle'));
    const view = btn.dataset.sbview;
    document.getElementById('sbListView').style.display = (view === 'list') ? 'block' : 'none';
    document.getElementById('sbPodiumView').style.display = (view === 'podium') ? 'block' : 'none';
    document.getElementById('sbRecapView').style.display = (view === 'recap') ? 'block' : 'none';
    if(view === 'podium') renderPodium();
    if(view === 'recap') renderRecap();
  });
});

document.getElementById('openTimelinesBtn').addEventListener('click', () => openScoreboard('list'));
document.querySelectorAll('[data-open-sb]').forEach(btn => {
  btn.addEventListener('click', () => openScoreboard(btn.dataset.openSb));
});
closeScoreboardBtn.addEventListener('click', closeScoreboard);
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    // One layer per press, top-most first: the confirm dialog, then the
    // hamburger dropdown, then whichever panel is open.
    if(confirmOverlay.classList.contains('open')){ confirmCancelBtn.click(); return; }
    if(recapCardOverlay.classList.contains('open')){ recapCardOverlay.classList.remove('open'); return; }
    if(menuTrigger.classList.contains('open')){ menuTrigger.classList.remove('open'); return; }
    closeScoreboard();
    closeMenu();
    closeRecords();
    return;
  }
  // Tab toggles the scoreboard — the DJ opens it constantly and it's otherwise
  // an unused key here. It never does the browser's focus-jumping, which only
  // ever landed on a button and left a focus ring on it. In a text field it
  // moves to the next/previous field instead.
  if(e.key === 'Tab'){
    e.preventDefault();
    const a = document.activeElement;
    if(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)){
      // Same panel only: the closed drawer is slid off-screen, not hidden.
      const scope = a.closest('#recordsDrawer, #scoreboardOverlay, #menuOverlay') || document;
      const fields = Array.from(scope.querySelectorAll('input:not([type=range]):not([type=hidden]):not([type=checkbox]), textarea'))
        .filter(f => !f.disabled && f.offsetParent !== null);
      const i = fields.indexOf(a);
      const next = fields[i + (e.shiftKey ? -1 : 1)];
      if(i > -1 && next) next.focus();
      return;
    }
    const role = document.getElementById('roleOverlay');
    if(role && role.classList.contains('open')) return;
    if(confirmOverlay.classList.contains('open')) return;
    menuTrigger.classList.remove('open');
    if(scoreboardOverlay.classList.contains('open')) closeScoreboard();
    else { closeMenu(); openScoreboard(); }
  }
});

const menuTrigger = document.getElementById('menuTrigger');
const menuHamburger = menuTrigger.querySelector('.menu-hamburger');
const menuOverlay = document.getElementById('menuOverlay');
const menuTitle = document.getElementById('menuTitle');
const closeMenuBtn = document.getElementById('closeMenuBtn');
const clipLengthInput = document.getElementById('clipLengthInput');
const clipLengthValue = document.getElementById('clipLengthValue');
const winLengthInput = document.getElementById('winLengthInput');
const winLengthValue = document.getElementById('winLengthValue');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const clearHistoryRow = document.getElementById('clearHistoryRow');
const resetStatsBtn = document.getElementById('resetStatsBtn');
let sessionHistory = [];
const HISTORY_MAX = 2000;
let currentSessionId = 0;
let statsRevealed = 0;
let statsCardsPlaced = 0;
let statsCoinsWon = 0;
let sessionCardsLost = 0;
let sessionCardsPlaced = 0;
let sessionCoinsWon = 0;
// This session's chaos, coin shop and over/under numbers, for the recap.
// Per-player tallies are keyed by name.
function freshChaosStats(){
  return { rounds: {}, shop: {}, spent: {}, ou: 0, ouRight: {}, lockWins: {}, bets: {}, robin: 0, donLost: 0, streaks: {},
    turns: {}, turnWins: {}, robinGot: {}, robinGave: {}, sabotage: {}, steals: {} };
}
let sessionChaos = freshChaosStats();
function tally(obj, key, n){
  obj[key] = (obj[key] || 0) + (n === undefined ? 1 : n);
}
let draggedEntry = null;
let draggedFromPlayer = null;
let autoScrollY = null;
let autoScrollInterval = null;

document.addEventListener('dragover', (e) => {
  if(!draggedEntry) return;
  autoScrollY = e.clientY;
});

function startAutoScroll(){
  stopAutoScroll();
  autoScrollInterval = setInterval(() => {
    if(autoScrollY === null) return;
    const edgeZone = 80;
    const scrollAmount = 18;
    if(autoScrollY < edgeZone){
      scoreboardOverlay.scrollTop -= scrollAmount;
    }else if(autoScrollY > window.innerHeight - edgeZone){
      scoreboardOverlay.scrollTop += scrollAmount;
    }
  }, 16);
}

function stopAutoScroll(){
  clearInterval(autoScrollInterval);
  autoScrollInterval = null;
  autoScrollY = null;
}
