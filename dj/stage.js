/* ── the stage: hero button, ring, label flip, standings, give chips ───── */

const stageEl = document.getElementById('stage');
const deckEl = document.getElementById('deck');
const turntableEl = document.getElementById('turntable');
const deckLabel = document.getElementById('deckLabel');
const deckLabelYear = document.getElementById('deckLabelYear');
const deckLabelMonth = document.getElementById('deckLabelMonth');
const stageStateEl = document.getElementById('stageState');
const heroBtn = document.getElementById('heroBtn');
const heroLabel = document.getElementById('heroLabel');
const ringProg = document.getElementById('ringProg');
const giveRow = document.getElementById('giveRow');
const giveChips = document.getElementById('giveChips');
const giveLabel = document.getElementById('giveLabel');
const standingsEl = document.getElementById('standings');
const railTarget = document.getElementById('railTarget');
const startGameBtn = document.getElementById('startGameBtn');
const lobbyDeckHint = document.getElementById('lobbyDeckHint');
const recordsDrawer = document.getElementById('recordsDrawer');
const drawerScrim = document.getElementById('drawerScrim');
const recordsDot = document.getElementById('recordsDot');
const recordsPillText = document.getElementById('recordsPillText');
const spotifyFields = document.getElementById('spotifyFields');
const cratesEl = document.getElementById('crates');
const cratesMeta = document.getElementById('cratesMeta');

// Join screen vs turntable. The join screen shows until the DJ starts (or
// draws), and the corner chip brings it back any time.
function setStageMode(mode){
  stageEl.dataset.mode = mode;
  syncLobbyHint();
  wakeRing(); // the ring can't be measured while the deck is hidden
}
startGameBtn.addEventListener('click', () => setStageMode('deck'));
joinChip.addEventListener('click', () => setStageMode(stageEl.dataset.mode === 'lobby' ? 'deck' : 'lobby'));
drawBtn.addEventListener('click', () => setStageMode('deck'));

function syncLobbyHint(){
  if(playlists.length === 0){
    lobbyDeckHint.innerHTML = 'No records loaded yet — <button type="button">load a playlist</button> before you start.';
  }else{
    lobbyDeckHint.textContent = totalTracks() + ' tracks ready across ' + playlists.length + ' playlist' + (playlists.length === 1 ? '' : 's') + '.';
  }
}
lobbyDeckHint.addEventListener('click', (e) => { if(e.target.closest('button')) openRecords('load'); });

// One button for the whole loop: it stands in for whichever of Draw / Reveal
// is next. The real buttons stay (hidden) so all their logic is untouched.
function heroTarget(){
  return (currentCard && !revealed && !(song && song.skipped)) ? revealBtn : drawBtn;
}
heroBtn.addEventListener('click', () => {
  if(awaitingStart){ startSong(); return; }
  heroTarget().click();
});

// Writing identical text still counts as a mutation, which re-runs the ticker
// fit (a forced layout) and can restart a running ticker.
function setText(el, text){
  if(el.textContent !== text) el.textContent = text;
}

function syncStage(){
  const target = heroTarget();
  setText(heroLabel, awaitingStart ? 'Start'
    : target === revealBtn ? 'Reveal'
    : (gameMode === 'chaos' && chaos && chaos.pending) ? 'Start round'
    : (currentCard ? 'Next record' : 'Drop the needle'));
  heroBtn.disabled = target.disabled;
  const playing = vinyl.classList.contains('spinning');
  deckEl.classList.toggle('playing', playing);
  deckEl.classList.toggle('skipped', !!(song && song.skipped && !revealed));
  turntableEl.classList.toggle('revealed', !!(currentCard && revealed));
  if(!currentCard){
    setText(stageStateEl, playlists.length ? 'Ready' : 'No records loaded');
    setText(nowTitle, playlists.length ? 'Ready when you are' : 'Load a playlist to start');
    setText(nowArtist, playlists.length ? 'Drop the needle to play a mystery record.' : 'Open the Spotify pill in the top bar.');
  }else if(!revealed && song && song.skipped){
    setText(stageStateEl, 'Skipped');
    setText(nowTitle, 'Card stolen');
    setText(nowArtist, song.skipped);
  }else if(!revealed){
    setText(stageStateEl, awaitingStart ? (song && song.bets ? 'Place your bets' : 'Shop is open') : (song && song.event) ? 'Over/under — everyone votes' : playing ? 'Now playing' : (awaitingSound ? 'Dropping the needle…' : 'Mystery record'));
    setText(nowTitle, 'Mystery record');
    setText(nowArtist, 'Where does it fit in your timeline?');
  }else{
    setText(stageStateEl, 'Revealed' + (currentPlaylistName ? ' · ' + currentPlaylistName : ''));
  }
  renderTurn();
}
new MutationObserver(syncStage).observe(drawBtn, { attributes: true, attributeFilter: ['disabled'] });
new MutationObserver(syncStage).observe(revealBtn, { attributes: true, attributeFilter: ['disabled'] });

// Enter = the hero button, from anywhere that isn't a field or another button
// (Space is already play/pause, Tab the timelines).
// A button, link or collapsible keeps focus after a click, and Enter/Space
// would press it again. Only the keys we designed do anything: they never
// press whatever was clicked last (the confirm dialog keeps Enter = OK).
function clickedControl(){
  const a = document.activeElement;
  return a && ['BUTTON', 'SUMMARY', 'A'].includes(a.tagName) && !a.closest('#confirmOverlay') ? a : null;
}
['keydown', 'keyup'].forEach(type => document.addEventListener(type, (e) => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const a = clickedControl();
  if(!a) return;
  e.preventDefault();
  a.blur();
}, true));

document.addEventListener('keydown', (e) => {
  if(e.key !== 'Enter' || e.repeat) return;
  const a = document.activeElement;
  const tag = a && a.tagName;
  if(['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (a && a.isContentEditable)) return;
  if(a && a.closest && a.closest('#confirmOverlay')) return;
  const blocking = [roleOverlay, scoreboardOverlay, menuOverlay, recordsDrawer, confirmOverlay, shopOverlay];
  if(blocking.some(el => el.classList.contains('open'))) return;
  if(stageEl.dataset.mode !== 'deck' || heroBtn.disabled) return;
  e.preventDefault();
  heroBtn.click();
});

// Letter keys: N nobody, C coin, R replay, B coin shop (B again closes it).
// Only on the stage — never in a field, over a panel, or with a modifier.
document.addEventListener('keydown', (e) => {
  if(e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if(!['n', 'c', 'r', 'b'].includes(key)) return;
  const a = document.activeElement;
  if(a && (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable)) return;
  if(key === 'b' && shopOverlay.classList.contains('open')){
    e.preventDefault();
    shopOverlay.classList.remove('open');
    return;
  }
  const blocking = [roleOverlay, scoreboardOverlay, menuOverlay, recordsDrawer, confirmOverlay, shopOverlay, recapCardOverlay];
  if(blocking.some(el => el.classList.contains('open'))) return;
  const shopBtn = document.getElementById('shopBtn');
  const target = key === 'r' ? replayBtn
    : key === 'b' ? (shopBtn.hidden ? null : shopBtn)
    : (giveRow.hidden ? null : giveChips.querySelector('[data-key="' + key + '"]'));
  if(!target || target.disabled) return;
  e.preventDefault();
  target.click();
});

// Title and artist are one line each. Anything wider runs as a ticker:
// the span carries a second copy of its text (::after) and scrolls by exactly
// one copy's width, so the loop is seamless.
function fitTicker(span){
  const box = span.parentElement;
  box.classList.remove('run');
  const textW = span.offsetWidth;
  if(textW <= box.clientWidth + 1) return;
  const gap = 3.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
  span.dataset.text = span.textContent;
  span.style.setProperty('--tk-dist', (textW + gap) + 'px');
  span.style.setProperty('--tk-dur', Math.max(7, (textW + gap) / 55 / .82) + 's');
  box.classList.add('run');
}
[nowTitle, nowArtist].forEach(el => {
  new MutationObserver(() => fitTicker(el)).observe(el, { childList: true, characterData: true, subtree: true });
});
window.addEventListener('resize', () => { fitTicker(nowTitle); fitTicker(nowArtist); });
document.fonts && document.fonts.ready.then(() => { fitTicker(nowTitle); fitTicker(nowArtist); });

// The ring copies the (invisible) clip bar, so every code path that drives the
// bar drives the ring. It only runs while the bar moves: a style change wakes
// it, and it sleeps once the bar has sat still for RING_IDLE_FRAMES.
const RING_C = 1118.4;
const RING_IDLE_FRAMES = 20;
const clipTrack = clipBar.parentElement;
let ringRunning = false;
let ringStill = 0;
let ringLastFrac = -1;
function ringLoop(){
  const w = clipTrack.getBoundingClientRect().width;
  if(w > 0){
    const frac = Math.max(0, Math.min(1, clipBar.getBoundingClientRect().width / w));
    ringStill = Math.abs(frac - ringLastFrac) < 1e-4 ? ringStill + 1 : 0;
    ringLastFrac = frac;
    ringProg.style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(1);
  }else{
    ringStill++;
  }
  // A running transition counts as moving even if this frame measured the same.
  const moving = clipBar.getAnimations && clipBar.getAnimations().some(a => a.playState === 'running');
  if(ringStill >= RING_IDLE_FRAMES && !moving){ ringRunning = false; return; }
  requestAnimationFrame(ringLoop);
}
function wakeRing(){
  ringStill = 0;
  if(ringRunning) return;
  ringRunning = true;
  requestAnimationFrame(ringLoop);
}
new MutationObserver(wakeRing).observe(clipBar, { attributes: true, attributeFilter: ['style', 'class'] });
window.addEventListener('resize', wakeRing);
// Frames stop while the tab is in the background; catch up when it's back.
document.addEventListener('visibilitychange', wakeRing);
wakeRing();

// Front of the label is "?", the back carries the year; revealing flips it.
function setDeckLabel(card){
  vinylLabel.textContent = '?';
  if(card){
    deckLabelYear.textContent = card.year || '★';
    deckLabelMonth.textContent = (expertMode && card.year) ? MONTH_NAMES[(card.month || 1) - 1] : '';
  }
  syncStage();
}

// Instead of freezing mid-turn, the record coasts to a stop — and always on a
// whole turn, so the label (and the year on its back) ends up the right way up.
function coastToStop(){
  let angle = 0;
  const m = getComputedStyle(vinyl).transform;
  const v = m && m.match(/matrix\(([^)]+)\)/);
  if(v){
    const [a, b] = v[1].split(',').map(Number);
    angle = Math.atan2(b, a) * 180 / Math.PI;
  }
  vinyl.classList.remove('spinning');
  vinyl.style.transition = 'none';
  vinyl.style.transform = 'rotate(' + angle + 'deg)';
  void vinyl.offsetWidth;
  const end = Math.ceil((angle + 150) / 360) * 360;
  vinyl.style.transition = 'transform 2s cubic-bezier(.25,.5,.35,1)';
  vinyl.style.transform = 'rotate(' + end + 'deg)';
}
function releaseCoast(){
  vinyl.style.transition = '';
  vinyl.style.transform = '';
}

function afterScoreboardRender(){
  renderStandings();
  renderGive();
  syncStage();
  requestAnimationFrame(markRowStarts);
}

function renderStandings(){
  railTarget.textContent = 'first to ' + WIN_LENGTH;
  standingsEl.innerHTML = '';
  if(players.length === 0){
    standingsEl.innerHTML = '<p class="empty">No players yet. They show up here as phones join, or add them under Open timelines.</p>';
    return;
  }
  const sorted = players.slice().sort(comparePlayers);
  const leader = sorted[0];
  const STANDINGS_MAX = 10;
  sorted.slice(0, STANDINGS_MAX).forEach((p, i) => {
    const isLead = leader.timeline.length > 0 && comparePlayers(p, leader) === 0;
    const wins = winBadge(p, isLead);
    const pct = Math.min(100, Math.round(p.timeline.length / Math.max(1, WIN_LENGTH) * 100));
    const row = document.createElement('div');
    row.className = 'st' + (isLead ? ' lead' : '') + (turnActive() ? ' pickable' : '');
    if(turnActive()){
      row.title = p.name === turnName ? p.name + "'s turn" : 'Make it ' + p.name + "'s turn";
      row.addEventListener('click', () => setTurn(p.name));
    }
    row.innerHTML =
      '<span class="st-rk">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="st-nm"><i class="st-on' + (p.online ? '' : ' off') + '"></i><span>' + escapeHtml(p.name) + '</span>' + (wins ? '<b class="st-win">' + wins + '</b>' : '') + (turnActive() && p.name === turnName ? '<b class="st-turn">TURN</b>' : '') + (liveStreak(p) >= 2 ? '<b class="st-fire" title="' + liveStreak(p) + ' in a row on their own turns">🔥' + liveStreak(p) + '</b>' : '') + '</span>' +
      '<span class="st-sc"><span>' + CARD_ICON_SVG + p.timeline.length + '</span><span>' + COIN_SVG + bonusCount(p) + '</span></span>' +
      '<span class="st-bar"><i style="width:' + pct + '%"></i></span>';
    standingsEl.appendChild(row);
  });
  if(sorted.length > STANDINGS_MAX){
    const more = document.createElement('p');
    more.className = 'st-more';
    more.textContent = '+ ' + (sorted.length - STANDINGS_MAX) + ' more in the timelines';
    standingsEl.appendChild(more);
  }
}

// The hamburger is position:fixed (to float above the menu panel), so centre
// it on the bar by measurement; the bar's height varies with chip, wrap, scale.
const topbarEl = document.getElementById('topbar');
function alignMenuTrigger(){
  const h = topbarEl.offsetHeight; // layout px — unaffected by the page zoom
  menuTrigger.style.top = Math.max(6, Math.round((h - menuHamburger.offsetHeight) / 2)) + 'px';
}
if(window.ResizeObserver) new ResizeObserver(alignMenuTrigger).observe(topbarEl);
alignMenuTrigger();

// After a reveal: one tap hands the card to whoever got it, a second tap on
// the same chip takes it back, and the coin chip marks the title/artist bonus.
let giveDismissedFor = null;

function renderGive(){
  const canAdd = revealed && currentCard && currentCard.year && !isNaN(parseInt(currentCard.year, 10)) && !(song && song.event);
  if(!canAdd || players.length === 0 || giveDismissedFor === currentCard.id){
    giveRow.hidden = true;
    return;
  }
  giveRow.hidden = false;
  giveChips.innerHTML = '';
  let ownerEntry = null;
  const owner = players.find(p => p.timeline.some(e => {
    if(e.id === currentCard.id && !e.locked){ ownerEntry = e; return true; }
    return false;
  }));
  giveLabel.textContent = owner ? 'Given to ' + owner.name : 'Who placed it right?';
  // Catch-up rounds: the card can only go to the turn player or, if they got
  // it wrong, to the catch-up player — so only those two are offered.
  const catchUpRound = chaosActive('catchup') && turnActive();
  const catchUp = catchUpRound ? catchUpPlayer() : null;
  // With automatic turns only the turn player is offered — plus the catch-up
  // player in catch-up rounds, and whoever already has it. Turn player first.
  const turnOnly = turnActive() && players.some(p => p.name === turnName);
  const offered = turnOnly
    ? players.filter(p => p.name === turnName || p === catchUp || p === owner)
        .sort((a, b) => (b.name === turnName) - (a.name === turnName))
    : players;
  offered.forEach(p => {
    const b = document.createElement('button');
    b.className = 'give' + (owner === p ? ' given' : '');
    b.textContent = (owner === p ? '✓ ' : '') + (p === catchUp && owner !== p ? 'Catch-up → ' : '') + p.name;
    b.disabled = !!owner && owner !== p;
    b.title = owner === p ? 'Take it back' : 'Give ' + currentCard.year + ' to ' + p.name;
    b.addEventListener('click', () => {
      if(owner === p) takeCardBack(p, ownerEntry);
      else if(!owner) giveCardTo(p);
    });
    giveChips.appendChild(b);
  });
  const turnPlayer = turnActive() ? players.find(p => p.name === turnName) : null;
  // Double or nothing: a miss costs the turn player their latest card, so the
  // lose button (or its undo) stands in for "nobody".
  const donRound = chaosActive('don') && turnPlayer && song && !song.event;
  const donLatest = donRound && !song.donLost && owner !== turnPlayer ? latestCard(turnPlayer) : null;
  const extra = document.createElement('button');
  extra.className = 'give muted';
  // Catch-up: a card handed to the catch-up player earns no title coin, and
  // there's no "nobody" — a missed card always goes to them. Sang it: the
  // coin comes with the card, so there's nothing to toggle.
  const showExtra = owner
    ? !(catchUpRound && owner.name !== turnName) && !ownerEntry.sang
    : !(catchUpRound && catchUp) && !(donRound && (donLatest || song.donLost));
  if(owner){
    const titled = titleCoins(ownerEntry);
    extra.innerHTML = '<span style="display:inline-flex;align-items:center;gap:.35rem;">' + COIN_SVG + (titled ? (titled > 1 ? titled + ' coins ✓' : 'coin ✓') : (chaosCoinValue() > 1 ? '+ 2 coins' : '+ coin')) + '<kbd>C</kbd></span>';
    extra.dataset.key = 'c';
    extra.title = 'Title + artist guessed too (gold coin)';
    extra.addEventListener('click', () => {
      toggleCoin(ownerEntry);
      renderScoreboard();
    });
  }else{
    extra.innerHTML = 'nobody<kbd>N</kbd>';
    extra.dataset.key = 'n';
    extra.title = 'Nobody got it — hide these';
    extra.addEventListener('click', () => {
      giveDismissedFor = currentCard.id;
      renderScoreboard();
    });
  }
  if(showExtra) giveChips.appendChild(extra);

  // Double or nothing: the DJ takes the turn player's latest card when they
  // got it wrong — named on the button so everyone sees which one goes.
  if(donRound){
    if(song.donLost){
      const lost = song.donLost;
      const back = document.createElement('button');
      back.className = 'give muted';
      back.textContent = '↺ give ' + lost.year + ' back to ' + turnPlayer.name;
      back.addEventListener('click', () => {
        restoreCard(turnPlayer, lost);
        song.donLost = null;
        sessionChaos.donLost = Math.max(0, sessionChaos.donLost - 1);
        renderScoreboard();
      });
      giveChips.appendChild(back);
    }else if(donLatest){
      const latest = donLatest;
      // Cut long titles so it stays one line, the size of the other chips.
      const title = latest.title && latest.title.length > 20 ? latest.title.slice(0, 19).replace(/[\s(\[\-–·,]+$/, '') + '…' : latest.title;
      const lose = document.createElement('button');
      lose.className = 'give';
      lose.textContent = '✗ ' + turnPlayer.name + ' loses ' + latest.year + (title ? ' · ' + title : '');
      lose.title = 'Double or nothing: wrong, so ' + latest.year + (latest.title ? ' · ' + latest.title : '') + ' goes';
      lose.addEventListener('click', () => {
        song.donLost = loseLatestCard(turnPlayer);
        sessionChaos.donLost++;
        gameEvent({ en: turnPlayer.name + ' lost ' + latest.year + ' — double or nothing', da: turnPlayer.name + ' mistede ' + latest.year + ' — dobbelt eller intet' });
        renderScoreboard();
      });
      giveChips.appendChild(lose);
    }
  }

  // Chaos shortcuts, only while nobody has the card yet.
  if(!owner && chaosActive('sing') && turnPlayer){
    const sang = document.createElement('button');
    sang.className = 'give';
    sang.textContent = '♪ ' + turnPlayer.name + ' sang it';
    sang.title = 'Card plus a gold coin';
    sang.addEventListener('click', () => {
      giveCardTo(turnPlayer);
      const entry = turnPlayer.timeline.find(e => e.id === currentCard.id && !e.locked);
      if(entry){
        if(!entry.bonus) toggleCoin(entry);
        entry.sang = true;
      }
      renderScoreboard();
    });
    giveChips.appendChild(sang);
  }
}

// Catch-up goes to whoever has the fewest cards, then the fewest coins, then
// comes first alphabetically — counted without this song's card, so giving it
// doesn't change who it was meant for. Never the turn player themselves.
function catchUpPlayer(){
  const settled = p => p.timeline.filter(e => e.locked || !currentCard || e.id !== currentCard.id);
  const cards = p => settled(p).length;
  const coins = p => settled(p).reduce((sum, e) => sum + coinValue(e), 0) + (p.coinAdj || 0);
  const key = p => cards(p) * 100000 + coins(p);
  const low = Math.min(...players.map(key));
  // The card never goes to the player whose turn it was. If they're the only
  // one at the bottom, nobody gets it; if they share it, the others do.
  const tied = players.filter(p => key(p) === low && p.name !== turnName);
  // A tie is settled by a random pick, kept for the rest of the song so the
  // chip doesn't jump around.
  let last = song && tied.find(p => p.name === song.catchUpPick);
  if(!last){
    last = pickRandom(tied);
    if(song && last) song.catchUpPick = last.name;
  }
  return last || null;
}

// Catch-up: going to the next song without handing out the card gives it to
// the catch-up player — the app already knows who that is.
function autoCatchUp(){
  if(!chaosActive('catchup') || !turnActive() || !revealed || !currentCard || !song || song.event || song.id !== currentCard.id) return;
  if(isNaN(parseInt(currentCard.year, 10))) return;
  if(players.some(p => p.timeline.some(e => e.id === currentCard.id && !e.locked))) return;
  const who = catchUpPlayer();
  if(!who) return;
  giveCardTo(who);
  gameEvent({ en: who.name + ' gets the card — catch-up', da: who.name + ' får kortet — indhentning' });
}

function takeCardBack(player, entry){
  const idx = player.timeline.indexOf(entry);
  if(idx < 0) return;
  player.timeline.splice(idx, 1);
  if(player.lastAdded === entry) player.lastAdded = null;
  statsCardsPlaced = Math.max(0, statsCardsPlaced - 1);
  sessionCardsPlaced = Math.max(0, sessionCardsPlaced - 1);
  uncountCoins(entry);
  forgetCardEvent(entry.id);
  renderScoreboard();
}

// Gap labels between sleeves. Same units the tiebreaker uses: years, or
// months in expert mode. The tightest gap is marked once there are 3+ cards.
function timelineGaps(timeline){
  const vals = timeline.map(e => expertMode ? e.year * 12 + ((e.month || 1) - 1) : e.year * 12);
  const diffs = [null];
  for(let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1]);
  const min = timeline.length >= 3 ? Math.min(...diffs.slice(1)) : null;
  return diffs.map(d => d === null ? null : { months: d, tight: d === min });
}

// [above the line, below the line] — the gap is only ~2rem wide, so a
// "+9y 10m" split over both sides of the connector instead of spilling onto
// the neighbouring cards.
function gapLabel(months){
  if(months <= 0) return ['±0', ''];
  if(!expertMode) return ['+' + Math.round(months / 12) + 'y', ''];
  const y = Math.floor(months / 12);
  const m = months % 12;
  if(!y) return ['+' + m + 'm', ''];
  return ['+' + y + 'y', m ? m + 'm' : ''];
}

function buildGapEl(info){
  const g = document.createElement('span');
  g.className = 'card-gap' + (info && info.tight ? ' tight' : '');
  if(info){
    const [over, under] = gapLabel(info.months);
    const label = document.createElement('span');
    label.textContent = over;
    g.appendChild(label);
    if(under){
      const u = document.createElement('span');
      u.className = 'under';
      u.textContent = under;
      g.appendChild(u);
    }
  }
  return g;
}

// A connector at the start of a wrapped row points at nothing — hide it.
function markRowStarts(){
  document.querySelectorAll('.player-timeline').forEach(row => {
    let prevBottom = null;
    row.querySelectorAll(':scope > .vinyl-card').forEach(card => {
      const bottom = card.offsetTop + card.offsetHeight;
      card.classList.toggle('row-start', prevBottom === null || bottom > prevBottom + 4);
      prevBottom = bottom;
    });
  });
}
window.addEventListener('resize', () => requestAnimationFrame(markRowStarts));
// Also whenever the timelines change size or become visible — marking them
// while the overlay was closed measured nothing and left stale connectors.
if(window.ResizeObserver) new ResizeObserver(() => markRowStarts()).observe(scoreboardEl);

// Progress toward the win: one little record per card up to 15, a bar beyond.
function buildPips(count, target){
  const wrap = document.createElement('span');
  wrap.title = count + ' of ' + target + ' cards';
  if(target > 15){
    wrap.className = 'pips-bar';
    wrap.innerHTML = '<i style="width:' + Math.min(100, count / target * 100) + '%"></i>';
    return wrap;
  }
  wrap.className = 'pips';
  for(let i = 0; i < target; i++){
    const d = document.createElement('i');
    d.className = 'pip' + (i < count ? ' f' : '');
    wrap.appendChild(d);
  }
  return wrap;
}

/* ── records drawer: Connect & Load + Tracklist ────────────────────────── */

function selectRecordsPanel(name){
  document.querySelectorAll('#recordsDrawer .seg button').forEach(b => b.classList.toggle('on', b.dataset.panel === name));
  document.querySelectorAll('#recordsDrawer .dr-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
  if(tracklistStale && tracklistVisible()) renderTracklist();
}
function openRecords(panel){
  if(panel) selectRecordsPanel(panel);
  recordsDrawer.classList.add('open');
  drawerScrim.classList.add('open');
  menuTrigger.classList.add('hidden');
  if(tracklistStale && tracklistVisible()) renderTracklist();
}
function closeRecords(){
  recordsDrawer.classList.remove('open');
  drawerScrim.classList.remove('open');
  if(!scoreboardOverlay.classList.contains('open')) menuTrigger.classList.remove('hidden');
}
document.getElementById('recordsPill').addEventListener('click', () => openRecords());
document.getElementById('drawerClose').addEventListener('click', closeRecords);
drawerScrim.addEventListener('click', closeRecords);
document.querySelectorAll('#recordsDrawer .seg button').forEach(b => {
  b.addEventListener('click', () => selectRecordsPanel(b.dataset.panel));
});

let lastPillConnState = null;
function renderRecordsPill(){
  const state = ['connected', 'pending', 'error'].find(c => connectPill.classList.contains(c)) || '';
  recordsDot.className = 'dot' + (state ? ' ' + state : '');
  const total = totalTracks();
  const left = playlists.filter(p => p.enabled).reduce((s, p) => s + p.tracks.filter(t => !t.drawn).length, 0);
  if(playlists.length === 0){
    recordsPillText.innerHTML = state === 'connected' ? 'Spotify · <b>add playlists</b>' : '<b>Connect Spotify</b>';
  }else{
    recordsPillText.innerHTML = (state === 'connected' ? 'Spotify · ' : '') +
      '<b>' + playlists.length + ' playlist' + (playlists.length === 1 ? '' : 's') + '</b> · ' + left + ' left';
  }
  document.getElementById('stepSpotify').classList.toggle('done', state === 'connected');
  document.getElementById('stepPlaylists').classList.toggle('done', playlists.length > 0);
  cratesMeta.textContent = total ? total + ' tracks · ' + left + ' left' : '';
  // Fold the client-id fields away once connected; open them again if it drops.
  if(state !== lastPillConnState && state !== 'pending'){
    spotifyFields.open = state !== 'connected';
    lastPillConnState = state;
  }
  syncLobbyHint();
  syncStage();
}

function togglePlaylist(p){
  p.enabled = !p.enabled;
  refreshStatus();
  renderTracklist();
}

function removePlaylist(p){
  const idx = playlists.indexOf(p);
  if(idx < 0) return;
  playlists.splice(idx, 1);
  if(p.id) loadedPlaylistIds.delete(p.id);
  refreshStatus();
  renderTracklist();
  if(playlists.length === 0){
    reloadBtn.disabled = true;
    resetBtn.disabled = true;
    drawBtn.disabled = true;
  }
}

function renderCrates(){
  cratesEl.innerHTML = '';
  if(playlists.length === 0){
    cratesEl.innerHTML = '<p class="crates-empty">Nothing loaded yet.</p>';
    return;
  }
  playlists.forEach(p => {
    const left = p.tracks.filter(t => !t.drawn).length;
    const row = document.createElement('div');
    row.className = 'crate' + (p.enabled ? '' : ' off');
    row.innerHTML = '<span class="crate-disc"></span><span class="crate-name"><b></b><small></small></span>';
    row.querySelector('b').textContent = p.name;
    row.querySelector('small').textContent = p.tracks.length + ' tracks · ' + (p.enabled ? left + ' left' : 'paused');
    const sw = document.createElement('button');
    sw.className = 'switch';
    sw.setAttribute('aria-pressed', String(p.enabled));
    sw.setAttribute('aria-label', (p.enabled ? 'Pause ' : 'Resume ') + p.name);
    sw.title = p.enabled ? 'In the draw — click to pause' : 'Paused — click to put it back in the draw';
    sw.addEventListener('click', () => togglePlaylist(p));
    const rm = document.createElement('button');
    rm.className = 'crate-rm';
    rm.textContent = '✕';
    rm.title = 'Remove ' + p.name;
    rm.addEventListener('click', () => removePlaylist(p));
    row.append(sw, rm);
    cratesEl.appendChild(row);
  });
}

/* ── role picker ──────────────────────────────────────────────────────── */

const roleDjBtn = document.getElementById('roleDjBtn');
const roleDjWarning = document.getElementById('roleDjWarning');

function refuseDj(){
  sessionStorage.removeItem('vl_role');
  roleOverlay.classList.add('open');
  liftNeedle();
  document.body.style.overflow = 'hidden';
  roleDjWarning.classList.add('show');
  roleDjBtn.classList.add('blocked');
  roleDjWarning.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function chooseDj(){
  if(!canBeDj()){ refuseDj(); return false; }
  sessionStorage.setItem('vl_role', 'dj');
  roleOverlay.classList.remove('open');
  document.body.style.overflow = '';
  hostLobby();
  // Only when coming straight back from Spotify's login — the DJ is mid-setup
  // in the drawer. A normal page load never opens it; settings are remembered.
  if(new URLSearchParams(window.location.search).has('code')) openRecords('load');
  return true;
}

// Tapping the wordmark drops back to the role picker. Always confirms here —
// the DJ has a lobby and a game in progress to lose.
document.getElementById('djHomeTitle').addEventListener('click', async () => {
  if(roleOverlay.classList.contains('open')) return;
  const ok = await showConfirm('Back to the start screen? The lobby closes and every phone gets kicked out. Players, scores and playlists are kept on this device.');
  if(!ok) return;
  if(lobbySocket && lobbyCode) lobbySocket.emit('lobby:end');
  sessionStorage.removeItem('vl_role');
  sessionStorage.removeItem('vl_dj_code');
  sessionStorage.removeItem('vl_dj_secret');
  window.location.href = '/';
});

/* The start screen is a record: Side A = DJ, Side B = player. Flip it (tap,
   swipe, or the toggle) to choose, then drop the needle to go. */
const rolePlayerBtn = document.getElementById('rolePlayerBtn');
const homeFlipper = document.getElementById('homeFlipper');
const dropNeedleBtn = document.getElementById('dropNeedleBtn');
const homeReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const homeDiscs = Array.from(roleOverlay.querySelectorAll('.hs-disc')).map(el =>
  el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 1800, iterations: Infinity }));
let homeSpin = 0, homeSpinTarget = 0, homeSpinRaf = 0, homeDropping = false;

// Ease the platter between idle (a lazy crawl) and 33rpm without a jump.
function setSpin(target){
  homeSpinTarget = homeReduced.matches ? 0 : target;
  cancelAnimationFrame(homeSpinRaf);
  const step = () => {
    homeSpin += (homeSpinTarget - homeSpin) * 0.06;
    if(Math.abs(homeSpinTarget - homeSpin) < 0.002) homeSpin = homeSpinTarget;
    homeDiscs.forEach(a => { a.playbackRate = homeSpin || 0.0001; if(!homeSpin) a.pause(); else a.play(); });
    if(homeSpin !== homeSpinTarget) homeSpinRaf = requestAnimationFrame(step);
  };
  step();
}
setSpin(0.22);

function setSide(side){
  roleOverlay.dataset.side = side;
  roleDjBtn.classList.toggle('on', side === 'dj');
  rolePlayerBtn.classList.toggle('on', side === 'player');
  roleDjBtn.setAttribute('aria-pressed', side === 'dj');
  rolePlayerBtn.setAttribute('aria-pressed', side === 'player');
  if(side === 'player'){
    roleDjWarning.classList.remove('show');
    roleDjBtn.classList.remove('blocked');
  }
}
function flipSide(){
  if(homeDropping) return;
  setSide(roleOverlay.dataset.side === 'dj' ? 'player' : 'dj');
}

// A brief surface crackle and a soft thump when the needle lands. Started from
// a click, so the browser lets it play; skipped quietly anywhere it can't.
function needleSound(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    const ctx = new AC();
    const len = Math.floor(ctx.sampleRate * 1.1);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < len; i++){
      d[i] = (Math.random() < 0.0012 ? (Math.random() * 2 - 1) : 0) + (Math.random() * 2 - 1) * 0.01;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.setValueAtTime(0.35, ctx.currentTime + 0.6);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.1);
    noise.connect(hp).connect(g).connect(ctx.destination);
    noise.start();
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(110, ctx.currentTime + 0.62);
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.8);
    og.gain.setValueAtTime(0.0001, ctx.currentTime);
    og.gain.setValueAtTime(0.25, ctx.currentTime + 0.62);
    og.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.85);
    o.connect(og).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.9);
    setTimeout(() => ctx.close(), 1500);
  } catch(e){}
}

function liftNeedle(){
  homeDropping = false;
  roleOverlay.classList.remove('playing');
  setSpin(0.22);
}
function dropNeedle(){
  if(homeDropping) return;
  homeDropping = true;
  roleOverlay.classList.add('playing');
  setSpin(1);
  if(!homeReduced.matches) needleSound();
  setTimeout(() => {
    if(roleOverlay.dataset.side === 'player'){ window.location.href = '/player'; return; }
    if(chooseDj()) liftNeedle();
  }, homeReduced.matches ? 150 : 1150);
}

roleDjBtn.addEventListener('click', () => setSide('dj'));
rolePlayerBtn.addEventListener('click', () => setSide('player'));
dropNeedleBtn.addEventListener('click', dropNeedle);
document.getElementById('homeArm').addEventListener('click', dropNeedle);
homeFlipper.addEventListener('keydown', e => {
  if(e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); flipSide(); }
});
// Tap flips; a horizontal swipe flips too.
let homePressX = null;
homeFlipper.addEventListener('pointerdown', e => { homePressX = e.clientX; });
homeFlipper.addEventListener('pointerup', e => {
  if(homePressX === null) return;
  const dx = Math.abs(e.clientX - homePressX);
  homePressX = null;
  if(dx < 8 || dx > 30) flipSide();
});
homeFlipper.addEventListener('pointercancel', () => { homePressX = null; });
// Back from /player restores this page as it was left, needle down.
window.addEventListener('pageshow', e => { if(e.persisted) liftNeedle(); });

(function pickRole(){
  const params = new URLSearchParams(window.location.search);
  // Coming back from Spotify's OAuth redirect is a DJ mid-setup — don't make
  // them pick a role again and interrupt the token exchange.
  const midAuth = params.has('code') || params.has('error');
  if(midAuth || sessionStorage.getItem('vl_role') === 'dj'){
    chooseDj();
    return;
  }
  roleOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
})();

loadSession();
renderChaos();

document.querySelectorAll('.sb-view-toggle').forEach(positionToggleSlider);
document.querySelectorAll('#settingsView .filter-toggle').forEach(positionToggleSlider);
