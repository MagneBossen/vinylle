/* ── coin shop ─────────────────────────────────────────────────────────────
   Open in every round with the Settings switch, or in chaos mode's coin shop
   rounds. Players buy on their phone; the DJ's shop window buys for anyone
   (for players without a phone). Every purchase goes through shopWhyNot, so
   the rules live in one place. */

// `who`: 'turn' items are for the player whose song it is; 'others' are the
// sabotage the rest can buy against them. Each player only sees their own.
const SHOP_ITEMS = [
  { id: 'new', who: 'turn', name: 'New song', price: 2, desc: 'Swap your song for a new one.' },
  { id: 'hint', who: 'turn', name: 'Hint', price: 1, desc: 'Show the decade on screen.' },
  { id: 'pass', who: 'turn', name: 'Pass it on', price: 3, desc: 'Another player has to place it. Wrong = they pay you 1 coin.', target: 'player' },
  { id: 'buy', who: 'turn', name: 'Buy the card', price: 3, desc: 'Placed it wrong? Keep the card anyway.' },
  { id: 'steal', who: 'turn', name: 'Steal', price: 5, desc: "Take a card from another player's timeline. Skips your song.", target: 'card' },
  { id: 'trap', who: 'others', name: 'Speed trap', price: 1, desc: 'Cut ' + SPEED_TRAP_CUT + " seconds off {turn}'s clip. Every second trap costs 1 more." },
  { id: 'force', who: 'others', name: 'New song', price: 2, desc: 'Make {turn} play a different song.' }
];

// The items `buyer` gets to see: their own on their turn, sabotage otherwise.
// The shop stays up the whole round: everything can be bought until the
// reveal, and after it Buy the card joins the list (the rest stay, greyed out).
function shopItemsFor(buyer){
  const mine = !!buyer && turnActive() && buyer.name === turnName;
  const phase = shopPhase();
  if(phase === 'none') return [];
  const items = SHOP_ITEMS.filter(i => i.who === (mine ? 'turn' : 'others'));
  if(phase !== 'after') return items.filter(i => i.id !== 'buy');
  const owned = !!shopOwner();
  return items.filter(i => i.id !== 'buy' || !owned).sort((a, b) => (b.id === 'buy') - (a.id === 'buy'));
}

function shopDesc(item){
  return item.desc.replace('{turn}', turnActive() && turnName ? turnName : 'the player');
}

// The shop is built on turns (your items vs. sabotage), so it needs them on.
function shopOpen(){
  return autoTurns && (shopEnabled || chaosActive('shop'));
}

// 'before' the song starts (it waits for Start while the shop is open),
// 'playing', 'after' the reveal (Buy the card), or 'none' (no song, a
// pop-up, a stolen song).
function shopPhase(){
  if(!currentCard || !song || song.event || song.skipped) return 'none';
  if(revealed) return 'after';
  return awaitingStart ? 'before' : 'playing';
}

function shopOwner(){
  return currentCard ? players.find(p => p.timeline.some(e => e.id === currentCard.id && !e.locked)) : null;
}

// Speed traps get pricier on the same song: +1 coin every two (1, 1, 2, 2, 3).
function shopPrice(item){
  const def = SHOP_ITEMS.find(i => i.id === item);
  if(!def) return 0;
  return item === 'trap' ? def.price + Math.floor(((song && song.traps) || 0) / 2) : def.price;
}

// Why `buyer` can't buy `item` right now, or null if they can.
function shopWhyNot(buyer, item, opts){
  opts = opts || {};
  const def = SHOP_ITEMS.find(i => i.id === item);
  if(!shopOpen()) return 'The shop is closed';
  if(!buyer || !def) return 'Pick a player';
  if(bonusCount(buyer) < shopPrice(item)) return 'Needs ' + shopPrice(item) + (shopPrice(item) === 1 ? ' coin' : ' coins');
  const phase = shopPhase();
  const isTurn = turnActive() && buyer.name === turnName;
  const other = players.find(p => p.name === opts.target && p !== buyer);
  if(def.who === 'others'){
    if(!turnActive()) return "When someone's song is on";
    if(isTurn) return "Not on your own turn";
    if(phase !== 'before' && phase !== 'playing') return 'Before the reveal';
    if(item === 'trap'){
      if(untimedMode) return 'Vibe mode has no clip to cut';
      if(clipSeconds() <= CLIP_FLOOR) return 'The clip is as short as it gets';
    }
    return null;
  }
  if(!isTurn) return 'Only on your own turn';
  if(item === 'buy'){
    if(phase !== 'after') return 'After the reveal';
    if(shopOwner()) return 'Someone already has the card';
    return null;
  }
  if(phase !== 'before' && phase !== 'playing') return 'Before the reveal';
  if(item === 'hint'){
    if(song.hint) return 'Hint already shown';
    if(isNaN(parseInt(currentCard.year, 10))) return 'This song has no year';
  }
  if(item === 'pass'){
    if(song.passedFrom) return 'Already passed on';
    if(!other) return 'Pick who gets it';
  }
  if(item === 'steal' && !(other && other.timeline.some(e => e.id === opts.cardId))) return 'Pick a card to steal';
  return null;
}

function shopBuy(buyer, item, opts){
  opts = opts || {};
  if(shopWhyNot(buyer, item, opts)) return false;
  // A phone sends the price it showed; if someone else's trap raised it
  // meanwhile, the buy is off (the phone already shows the new price).
  const price = shopPrice(item);
  if(opts.price !== undefined && opts.price !== price) return false;
  const other = players.find(p => p.name === opts.target);
  let msg = '';
  if(item === 'new' || item === 'force'){
    const pick = pickTrack();
    if(!pick) return false;
    // Same turn, same round count — just a different song.
    showTrack(pick.p, pick.t);
    song.id = pick.t.id;
    song.hint = null;
    song.spot = null;
    renderSpot();
    if(vote) startVote(pick.t, vote.stakes);
    if(song.lockin){
      song.lockin = newLockin(pick.t);
      renderLockin();
    }
    renderTracklist();
    if(!awaitingStart) playSnippet(true);
    msg = item === 'force'
      ? { en: buyer.name + ' forced a new song on ' + turnName + '!', da: buyer.name + ' tvang en ny sang på ' + turnName + '!' }
      : { en: buyer.name + ' bought a new song', da: buyer.name + ' købte en ny sang' };
  }else if(item === 'hint'){
    song.hint = Math.floor(parseInt(currentCard.year, 10) / 10) * 10 + 's';
    msg = { en: buyer.name + ' bought a hint: ' + song.hint, da: buyer.name + ' købte et hint: ' + song.hint.replace(/s$/, '’erne') };
  }else if(item === 'pass'){
    song.passedFrom = buyer.name;
    setTurn(other.name);
    msg = { en: buyer.name + ' passed the song to ' + other.name + '!', da: buyer.name + ' gav sangen videre til ' + other.name + '!' };
  }else if(item === 'trap'){
    song.cut = (song.cut || 0) + SPEED_TRAP_CUT;
    song.traps = (song.traps || 0) + 1;
    // Already playing: pull the end of the clip in now. Otherwise the shorter
    // clip applies when it starts (clipSeconds counts the cut).
    if(clipEndMs){
      clipEndMs = Math.max(clipEndMs - SPEED_TRAP_CUT * 1000, 1);
      if(vinyl.classList.contains('spinning')){
        const left = clipEndMs - lastKnownPosition;
        if(left <= 0) endClip();
        else runClip(left);
      }
    }
    msg = { en: buyer.name + ' cut ' + SPEED_TRAP_CUT + " seconds off " + turnName + "'s clip!", da: buyer.name + ' skar ' + SPEED_TRAP_CUT + ' sekunder af ' + daGen(turnName) + ' klip!' };
  }else if(item === 'buy'){
    giveCardTo(buyer, true);
    msg = { en: buyer.name + ' bought the card', da: buyer.name + ' købte kortet' };
  }else if(item === 'steal'){
    const entry = other.timeline.find(e => e.id === opts.cardId);
    other.timeline.splice(other.timeline.indexOf(entry), 1);
    if(other.lastAdded === entry) other.lastAdded = null;
    entry.locked = true;
    entry.addedAt = Date.now();
    buyer.timeline.push(entry);
    buyer.timeline.sort((a,b) => (a.year - b.year) || ((a.month||1) - (b.month||1)));
    song.skipped = buyer.name + ' stole ' + entry.year + (entry.title ? ' · ' + entry.title : '') + ' from ' + other.name;
    awaitingStart = false;
    stopPlayback();
    msg = { en: song.skipped, da: buyer.name + ' stjal ' + entry.year + (entry.title ? ' · ' + entry.title : '') + ' fra ' + other.name };
  }
  buyer.coinAdj = (buyer.coinAdj || 0) - price;
  tally(sessionChaos.shop, item);
  tally(sessionChaos.spent, buyer.name, price);
  if(item === 'trap' || item === 'force') tally(sessionChaos.sabotage, buyer.name);
  if(item === 'steal') tally(sessionChaos.steals, buyer.name);
  gameEvent(msg);
  renderScoreboard();
  renderShopWindow();
  return true;
}

function renderHint(){
  const show = !!(song && song.hint && !revealed);
  document.getElementById('hintBox').hidden = !show;
  if(show) document.getElementById('hintLine').textContent = "It's from the " + song.hint;
}

function renderShopButton(){
  const btn = document.getElementById('shopBtn');
  btn.hidden = !(shopOpen() && players.length);
  btn.innerHTML = COIN_SVG + '<span>Coin shop</span>';
  renderShopWindow();
}

// The DJ's shop window: the same shop, bought on a player's behalf.
const shopOverlay = document.getElementById('shopOverlay');
const shopBuyerSel = document.getElementById('shopBuyer');
const shopPicks = {};

function renderShopWindow(){
  // Looked up here: syncStage can call this before the page finished loading.
  const shopOverlay = document.getElementById('shopOverlay');
  const shopBuyerSel = document.getElementById('shopBuyer');
  if(!shopOverlay.classList.contains('open')) return;
  if(!shopOpen()){ shopOverlay.classList.remove('open'); return; }
  const wanted = shopBuyerSel.value;
  shopBuyerSel.innerHTML = '';
  players.forEach(p => {
    const o = document.createElement('option');
    o.value = o.textContent = p.name;
    shopBuyerSel.appendChild(o);
  });
  shopBuyerSel.value = players.some(p => p.name === wanted) ? wanted : (turnActive() && turnName) || (players[0] && players[0].name);
  const buyer = players.find(p => p.name === shopBuyerSel.value);
  document.getElementById('shopCoins').textContent = buyer ? bonusCount(buyer) + ' coins' : '';
  const list = document.getElementById('shopItems');
  list.innerHTML = '';
  const items = shopItemsFor(buyer);
  if(!items.length){
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Nothing to buy right now.';
    list.appendChild(p);
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'shop-item';
    const n = document.createElement('div');
    n.className = 'n';
    n.textContent = item.name;
    const cost = shopPrice(item.id);
    const price = document.createElement('small');
    price.textContent = cost + (cost === 1 ? ' coin' : ' coins');
    n.appendChild(price);
    const d = document.createElement('div');
    d.className = 'd';
    d.textContent = shopDesc(item);
    row.append(n, d);
    let sel = null;
    if(item.target && buyer){
      sel = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = item.target === 'card' ? 'Pick a card…' : 'Pick a player…';
      sel.appendChild(blank);
      players.filter(p => p !== buyer).forEach(p => {
        if(item.target === 'card'){
          p.timeline.forEach(e => {
            const o = document.createElement('option');
            o.value = p.name + '|' + e.id;
            o.textContent = p.name + ' — ' + (chaosActive('blind') ? '?' : e.year) + (e.title ? ' · ' + (e.title.length > 28 ? e.title.slice(0, 27) + '…' : e.title) : '');
            sel.appendChild(o);
          });
        }else{
          const o = document.createElement('option');
          o.value = o.textContent = p.name;
          sel.appendChild(o);
        }
      });
      sel.value = shopPicks[item.id] || '';
      if(sel.value !== (shopPicks[item.id] || '')) sel.value = '';
      sel.addEventListener('change', () => { shopPicks[item.id] = sel.value; renderShopWindow(); });
      row.appendChild(sel);
    }
    const opts = shopOptsFrom(item, sel ? sel.value : '');
    const why = shopWhyNot(buyer, item.id, opts);
    if(why){
      const w = document.createElement('div');
      w.className = 'why';
      w.textContent = why;
      row.appendChild(w);
    }
    const buy = document.createElement('button');
    buy.className = 'buy primary';
    buy.textContent = 'Buy';
    buy.disabled = !!why;
    buy.addEventListener('click', () => {
      if(shopBuy(buyer, item.id, opts)) shopPicks[item.id] = '';
      renderShopWindow();
    });
    row.appendChild(buy);
    list.appendChild(row);
  });
}

function shopOptsFrom(item, value){
  if(!value) return {};
  if(item.target === 'card'){
    const [target, cardId] = value.split('|');
    return { target, cardId };
  }
  return { target: value };
}

document.getElementById('shopBtn').addEventListener('click', () => {
  shopOverlay.classList.add('open');
  shopBuyerSel.value = '';
  renderShopWindow();
});
shopBuyerSel.addEventListener('change', renderShopWindow);
document.getElementById('shopClose').addEventListener('click', () => shopOverlay.classList.remove('open'));
shopOverlay.addEventListener('click', (e) => { if(e.target === shopOverlay) shopOverlay.classList.remove('open'); });

// A purchase from a phone.
function phoneBuy(payload){
  if(!payload) return;
  const buyer = players.find(p => p.deviceId && p.deviceId === payload.deviceId);
  if(!buyer) return;
  shopBuy(buyer, payload.item, { target: payload.target, cardId: payload.cardId, price: payload.price });
}

/* ── betster: bets from phones before the song starts ───────────────────── */

function startSong(){
  awaitingStart = false;
  if(song && song.bets) song.bets.open = false;
  renderBets();
  syncStage();
  playSnippet(true);
}

function renderBets(){
  const box = document.getElementById('betBox');
  const line = document.getElementById('betLine');
  const bets = song && song.bets;
  // How last song's bets went — kept here (one place) instead of a notice.
  const last = lastBetResults ? Object.entries(lastBetResults.results).map(([id, r]) =>
    ((players.find(p => p.deviceId === id) || {}).name || '?') + ' ' + (r.delta > 0 ? '+' : '−') + Math.abs(r.delta)) : [];
  document.getElementById('betLast').textContent = last.length ? 'Last song: ' + last.join(' · ') : '';
  const live = !!bets && !song.settled;
  box.hidden = !live && !last.length;
  if(box.hidden){ broadcastState(); return; }
  if(!live){
    document.getElementById('betKicker').textContent = 'Betster · results';
    line.textContent = '';
    broadcastState();
    return;
  }
  const placed = Object.entries(bets.placed).map(([id, b]) => {
    const who = (players.find(p => p.deviceId === id) || {}).name || '?';
    return who + ' ' + b.amount + ' on ' + (b.pick === 'coin' ? 'right + coin' : b.pick);
  });
  document.getElementById('betKicker').textContent = bets.open
    ? 'Betster · bets open on ' + song.turn + "'s turn"
    : 'Betster · bets locked on ' + song.turn + "'s turn";
  line.textContent = placed.length ? placed.join(' · ') : (bets.open ? 'Waiting for bets — press Start when everyone is in.' : 'No bets this time.');
  broadcastState();
}

function placeBet(payload){
  const bets = song && song.bets;
  if(!bets || !bets.open || !payload || payload.betId !== bets.id) return;
  const bettor = players.find(p => p.deviceId && p.deviceId === payload.deviceId);
  if(!bettor || bettor.name === song.turn) return;
  if(!['right', 'coin', 'wrong'].includes(payload.pick)) return;
  const amount = Math.floor(Number(payload.amount));
  if(!(amount >= 1) || amount > bonusCount(bettor)) return;
  bets.placed[payload.deviceId] = { pick: payload.pick, amount };
  renderBets();
}

/* ── lock-in: everyone locks in a year on their phone ─────────────────────
   Year only, even in expert mode. Guesses stay hidden until Reveal, a
   lock-in is final, and the closest wins a coin (ties all win). It takes two
   lock-ins, or there's nobody to beat. */

function newLockin(t){
  if(!chaosActive('lockin') || isNaN(parseInt(t.year, 10))) return null;
  const { min, max } = deckYearSpan();
  return { id: t.id + ':' + Date.now(), open: true, min, max, guesses: {}, results: null };
}

// The phone's slider spans the whole deck, so its ends give nothing away.
// Worked out once per set of playlists rather than on every song.
let deckSpanCache = null;
function deckYearSpan(){
  const key = playlists.map(p => p.id + ':' + p.tracks.length).join('|');
  if(deckSpanCache && deckSpanCache.key === key) return deckSpanCache;
  let min = Infinity, max = -Infinity;
  playlists.forEach(p => p.tracks.forEach(tr => {
    const y = parseInt(tr.year, 10);
    if(y < min) min = y;
    if(y > max) max = y;
  }));
  deckSpanCache = { key, min: Math.floor(min / 10) * 10, max };
  return deckSpanCache;
}

function placeLockin(payload){
  const l = song && song.lockin;
  if(!l || !l.open || !payload || payload.lockId !== l.id || l.guesses[payload.deviceId]) return;
  if(!players.some(p => p.deviceId && p.deviceId === payload.deviceId)) return;
  const year = Math.round(Number(payload.year));
  if(!(year >= l.min && year <= l.max)) return;
  l.guesses[payload.deviceId] = year;
  renderLockin();
}

function settleLockin(){
  const l = song && song.lockin;
  if(!l || !l.open) return;
  l.open = false;
  l.year = parseInt(currentCard.year, 10);
  l.results = Object.entries(l.guesses).map(([deviceId, year]) => ({
    deviceId,
    name: (players.find(p => p.deviceId === deviceId) || {}).name || '?',
    year,
    off: Math.abs(year - l.year)
  })).sort((a, b) => a.off - b.off);
  if(l.results.length >= 2){
    l.results.forEach(r => {
      r.win = r.off === l.results[0].off;
      const p = r.win && players.find(p => p.deviceId === r.deviceId);
      if(!p) return;
      tally(sessionChaos.lockWins, p.name);
      p.coinAdj = (p.coinAdj || 0) + 1;
      statsCoinsWon++;
      sessionCoinsWon++;
    });
  }
  renderLockin();
  renderScoreboard();
}

function renderLockin(){
  const box = document.getElementById('lockBox');
  const line = document.getElementById('lockLine');
  const l = song && song.lockin;
  box.hidden = !l;
  if(l && l.open){
    const phones = players.filter(p => p.deviceId && p.online).length;
    line.textContent = Object.keys(l.guesses).length + ' of ' + phones + ' locked in a year';
  }else if(l){
    line.textContent = !l.results.length ? 'Nobody locked in.'
      : l.results.map(r => r.name + ' ' + r.year + (r.win ? ' ✓ +1' : '')).join(' · ') + (l.results.length < 2 ? ' — a coin takes two lock-ins' : '');
  }
  broadcastState();
}

/* Over/under pop-up (Settings, any game mode): now and then every phone votes
   whether the song is from before or after a year on screen. That year is the
   real one shifted 1–8 years either way, so it never gives the answer away.
   It's a bonus song for everyone: nobody's turn, not a song of the chaos
   round, and nobody places it. After one there's a pause (0%), then the chance
   starts low and rises each song until it's guaranteed — all adjustable in
   Settings. 1 in 4 is high stakes. Votes stay open
   until Reveal. Players without a phone sit it out. */

// Decides whether this song is an over/under pop-up: its stakes, or null.
function rollOverUnder(track){
  const phones = players.some(p => p.deviceId && p.online);
  if(!ouEnabled || !phones || isNaN(parseInt(track.year, 10))) return null;
  // This song, counted from the last pop-up.
  const n = ouSince + 1;
  const chance = n <= ouGap ? 0 : n >= ouMax ? 1 : (ouStart + ouStep * (n - ouGap - 1)) / 100;
  if(Math.random() >= chance){ ouSince++; return null; }
  ouSince = 0;
  return Math.random() < .25 ? 'hard' : 'normal';
}

function startVote(track, stakes){
  vote = null;
  const year = parseInt(track.year, 10);
  if(!stakes || isNaN(year)){ renderVote(); return; }
  const shift = (1 + Math.floor(Math.random() * 8)) * (Math.random() < .5 ? -1 : 1);
  // Hard roof at last year: "before or after 2029" gives the answer away.
  // A song from the roof year itself would be asked about its own year, so
  // that one goes the other way instead.
  const roof = new Date().getFullYear() - 1;
  let pivot = Math.min(year + shift, roof);
  if(pivot === year) pivot = year - shift;
  vote = {
    id: track.id + ':' + Date.now(),
    pivot,
    stakes,
    open: true,
    votes: {},
    // Whoever had a phone when the song started; in high stakes they lose a
    // coin for not voting, or skipping would always be the safe play.
    voters: players.filter(p => p.deviceId).map(p => p.deviceId),
    results: null
  };
  renderVote();
}

function settleVote(){
  if(!vote || !vote.open) return;
  vote.open = false;
  vote.year = parseInt(currentCard.year, 10);
  vote.answer = vote.year < vote.pivot ? 'before' : 'after';
  vote.results = {};
  sessionChaos.ou++;
  players.forEach(p => {
    if(!p.deviceId) return;
    const choice = vote.votes[p.deviceId] || null;
    if(!choice && !vote.voters.includes(p.deviceId)) return;
    const correct = choice === vote.answer;
    if(correct) tally(sessionChaos.ouRight, p.name);
    const delta = vote.stakes === 'hard' ? (correct ? 0 : -1) : (correct ? 1 : 0);
    p.coinAdj = (p.coinAdj || 0) + delta;
    if(delta > 0){ statsCoinsWon++; sessionCoinsWon++; }
    vote.results[p.deviceId] = { choice, correct, delta };
  });
  renderVote();
}

function renderVote(){
  const box = document.getElementById('ouBox');
  const el = document.getElementById('ouLine');
  el.textContent = '';
  box.hidden = !vote;
  if(!vote) return;
  document.getElementById('ouKicker').textContent = vote.stakes === 'hard' ? 'Over/under · high stakes' : 'Over/under';
  if(vote.open){
    const phones = players.filter(p => p.deviceId).length;
    el.append('Before or after ');
    const b = document.createElement('b');
    b.textContent = vote.pivot;
    el.append(b, '? · ' + Object.keys(vote.votes).length + ' of ' + phones + ' voted');
    return;
  }
  const name = id => (players.find(p => p.deviceId === id) || {}).name;
  const ids = Object.keys(vote.results || {});
  const gained = ids.filter(id => vote.results[id].delta > 0).map(name).filter(Boolean);
  const lost = ids.filter(id => vote.results[id].delta < 0).map(name).filter(Boolean);
  let line = 'Answer: ' + vote.year + ' · ';
  if(vote.stakes === 'hard') line += lost.length ? '−1 coin: ' + lost.join(', ') : 'Nobody lost a coin.';
  else line += gained.length ? '+1 coin: ' + gained.join(', ') : 'Nobody got it.';
  el.textContent = line;
}

