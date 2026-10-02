/* ── chaos mode ───────────────────────────────────────────────────────────
   Each round is one song per player. It opens with a random rule card that
   applies to everyone until the round's songs are used up. Most cards are
   judged out loud by the DJ; double coins, the month, clip length and the
   playlist are applied here, and undone when the round ends. */

const CHAOS_CARDS = [
  { id: 'double', title: 'Double coins', desc: 'Name the title or one of the artists and win 2 gold coins instead of 1.', da: { title: 'Dobbelte mønter', desc: 'Nævn titlen eller en af kunstnerne og vind 2 guldmønter i stedet for 1.' } },
  { id: 'month', title: 'Guess the month', desc: 'Expert mode this round: place it by year and month.', da: { title: 'Gæt måneden', desc: 'Ekspert-tilstand denne runde: placer den efter år og måned.' } },
  // Stands in for 'month' when expert mode is already on: the easy round.
  { id: 'nomonth', title: 'Year only', desc: 'Expert mode is off this round: just the year counts, not the month.', da: { title: 'Kun år', desc: 'Ekspert-tilstand er slået fra denne runde: kun året tæller, ikke måneden.' } },
  { id: 'within', title: 'Within {x} years', xs: [3, 5, 10], desc: 'Forget the timeline: say the year out loud. Within {x} years of the real one wins the card.', da: { title: 'Inden for {x} år', desc: 'Glem tidslinjen: sig året højt. Højst {x} år fra det rigtige vinder kortet.' } },
  { id: 'swap', title: 'Swap', desc: "Win the card and you may swap it for any card in an opponent's timeline.", da: { title: 'Byt', desc: 'Vind kortet, og du må bytte det med et hvilket som helst kort i en modstanders tidslinje.' } },
  { id: 'speed', title: 'Speed round', xs: [5, 10], desc: 'Every clip this round is only {x} seconds.', da: { title: 'Speedrunde', desc: 'Hvert klip denne runde er kun {x} sekunder.' } },
  { id: 'playlist', title: 'Playlist round', desc: 'Every song this round is from “{playlist}”.', da: { title: 'Playliste-runde', desc: 'Alle sange denne runde er fra “{playlist}”.' } },
  { id: 'don', title: 'Double or nothing', desc: 'Get it right: the card plus 2 gold coins (3 with the title or artist too). Get it wrong: lose your most recently won card.', da: { title: 'Dobbelt eller intet', desc: 'Gæt rigtigt: kortet plus 2 guldmønter (3 med titel eller kunstner). Gæt forkert: mist dit senest vundne kort.' } },
  { id: 'shop', title: 'Coin shop', desc: 'The shop is open: spend gold coins on a new song, a hint, passing it on, a speed trap, buying the card or a steal.', da: { title: 'Møntbutik', desc: 'Butikken er åben: brug guldmønter på en ny sang, et hint, at give videre, en fartfælde, at købe kortet eller at stjæle.' } },
  { id: 'catchup', title: 'Catch-up', desc: "Get it wrong and the card goes to whoever has the fewest cards (then fewest coins) — unless it's their own turn.", da: { title: 'Indhentning', desc: 'Gæt forkert, og kortet går til den med færrest kort (derefter færrest mønter) — medmindre det er deres egen tur.' } },
  { id: 'sing', title: 'Sing-along', desc: "Sing along to it and win the card plus a gold coin. Can't? Play it as normal.", da: { title: 'Syng med', desc: 'Syng med på den og vind kortet plus en guldmønt. Kan du ikke? Spil den som normalt.' } },
  { id: 'betster', title: 'Betster', desc: 'Before each song starts, bet gold coins on your phone: right ×2, right + coin ×3, wrong ×2. Lose and you lose your bet.', da: { title: 'Betster', desc: 'Før hver sang starter, satser I guldmønter på telefonen: rigtigt ×2, rigtigt + mønt ×3, forkert ×2. Taber du, mister du din indsats.' } },
  { id: 'lockin', title: 'Lock-in', desc: 'Before the reveal, everyone locks in a year on their phone. Closest wins a gold coin.', da: { title: 'Lås fast', desc: 'Før afsløringen låser alle et år på telefonen. Tættest på vinder en guldmønt.' } },
  { id: 'robin', title: 'Robin Hood', desc: 'After every song this round, whoever has the most gold coins gives one to whoever has the fewest.', da: { title: 'Robin Hood', desc: 'Efter hver sang denne runde giver den med flest guldmønter én til den med færrest.' } },
  { id: 'blind', title: 'Blindfold', desc: 'Every timeline loses its years this round. Place it from memory.', da: { title: 'Bind for øjnene', desc: 'Alle tidslinjer mister deres årstal denne runde. Placer den efter hukommelsen.' } }
];

const chaosChip = document.getElementById('chaosChip');
const chaosAnnounce = document.getElementById('chaosAnnounce');

function chaosOn(){
  return gameMode === 'chaos' && !!chaos;
}

function chaosActive(id){
  return chaosOn() && !chaos.pending && chaos.card.id === id;
}

function chaosCoinValue(){
  return chaosActive('double') ? 2 : 1;
}

function shortName(name){
  return name.length > 20 ? name.slice(0, 20).trimEnd() + '…' : name;
}

function playlistKey(p){
  return p.id || p.name;
}

// Playlists (that are on) with enough undrawn songs to fill a round. Needs at
// least two in play, or "only this playlist" changes nothing.
function chaosPlaylists(needed){
  const live = playlists.filter(p => p.enabled && p.tracks.some(t => !t.drawn));
  if(live.length < 2) return [];
  return live.filter(p => p.tracks.filter(t => !t.drawn).length >= needed);
}

// 'month' and 'nomonth' are one card in the bag: whichever fits expert mode.
const chaosSlot = id => id === 'nomonth' ? 'month' : id;

// Cards come from a shuffled bag: each one is played once before any comes
// back, so a long night sees all of them. A card that can't be played right
// now (no phones for betster, one playlist) stays in the bag for later. On
// top of that, the last two cards never come straight back — not even
// across a reshuffle — so any card is at least three rounds apart.
const CHAOS_SPACING = 2;

function pickChaosCard(len, recent, usedPlaylists, bag){
  usedPlaylists = (usedPlaylists || []).slice();
  bag = (bag || []).slice();
  recent = (recent || []).slice(-CHAOS_SPACING);
  const allowed = CHAOS_CARDS.filter(c => {
    if(c.id === 'month') return !expertMode;
    if(c.id === 'nomonth') return expertMode;
    if(c.id === 'speed') return c.xs.some(x => x < CLIP_SECONDS);
    if(c.id === 'playlist') return chaosPlaylists(len).length > 0;
    // These are all about the turn player, so they need automatic turns.
    if(!autoTurns && ['don', 'sing', 'catchup', 'betster', 'shop'].includes(c.id)) return false;
    if(c.id === 'catchup') return players.length > 2;
    // Betting happens on phones, so it needs at least one in the game.
    if(c.id === 'betster') return players.some(p => p.deviceId && p.online);
    // Lock-ins too, and a lone lock-in has nobody to beat.
    if(c.id === 'lockin') return players.filter(p => p.deviceId && p.online).length >= 2;
    if(c.id === 'robin') return players.length > 1;
    return true;
  });
  // Only relax the spacing if nothing else is playable at all.
  const spaced = allowed.filter(c => !recent.includes(chaosSlot(c.id)));
  const playable = spaced.length ? spaced : allowed;
  let eligible = playable.filter(c => bag.includes(chaosSlot(c.id)));
  if(!eligible.length){
    bag = Array.from(new Set(CHAOS_CARDS.map(c => chaosSlot(c.id))));
    eligible = playable;
  }
  const def = eligible[Math.floor(Math.random() * eligible.length)];
  bag = bag.filter(id => id !== chaosSlot(def.id));
  recent = recent.concat(chaosSlot(def.id)).slice(-CHAOS_SPACING);
  const card = { id: def.id, title: def.title, desc: def.desc, titleDa: def.da.title, descDa: def.da.desc };
  if(def.xs){
    const xs = def.id === 'speed' ? def.xs.filter(x => x < CLIP_SECONDS) : def.xs;
    card.x = xs[Math.floor(Math.random() * xs.length)];
  }
  if(def.id === 'playlist'){
    // Every eligible playlist gets a playlist round before any repeats.
    let options = chaosPlaylists(len).filter(p => !usedPlaylists.includes(playlistKey(p)));
    if(!options.length){
      // New cycle, but not straight back to the one we just played.
      const last = usedPlaylists[usedPlaylists.length - 1];
      usedPlaylists = [];
      options = chaosPlaylists(len);
      if(options.length > 1) options = options.filter(p => playlistKey(p) !== last);
    }
    const pick = options[Math.floor(Math.random() * options.length)];
    card.playlist = playlistKey(pick);
    usedPlaylists.push(card.playlist);
    card.playlistName = shortName(pick.name);
  }
  const fill = str => str.replace('{x}', card.x).replace('{playlist}', card.playlistName);
  card.title = fill(card.title);
  card.desc = fill(card.desc);
  card.titleDa = fill(card.titleDa);
  card.descDa = fill(card.descDa);
  return { card, usedPlaylists, bag, recent };
}

// Called by Draw before it picks a song. Returns true when it put up a new
// round's card instead, so the draw stops there.
function chaosBeforeDraw(){
  if(gameMode !== 'chaos') return false;
  if(chaos && chaos.pending){
    chaos.pending = false;
    applyChaosCard();
    tally(sessionChaos.rounds, chaos.card.id);
    renderChaos();
    return false;
  }
  if(chaos && chaos.left > 0) return false;
  endChaosCard();
  const len = Math.max(1, players.length);
  // Older saves only kept the last card, not the last two.
  const recent = chaos ? (chaos.recent || [chaosSlot(chaos.card.id)]) : [];
  const card = pickChaosCard(len, recent, chaos && chaos.usedPlaylists, chaos && chaos.bag);
  chaos = {
    round: (chaos ? chaos.round : 0) + 1,
    card: card.card,
    usedPlaylists: card.usedPlaylists,
    bag: card.bag,
    recent: card.recent,
    len,
    left: len,
    pending: true,
    saved: {}
  };
  // A blindfold round just ended: years back on the timelines.
  renderScoreboard();
  renderChaos();
  syncStage();
  saveSession();
  return true;
}

function chaosAfterDraw(){
  if(!chaosOn() || chaos.pending) return;
  chaos.left = Math.max(0, chaos.left - 1);
  renderChaos();
}

// Songs from the playlist round's playlist that are still in the deck. Empty
// (so a normal draw happens) if the DJ switched that playlist off meanwhile.
function chaosPlaylistPool(){
  if(!chaosActive('playlist')) return [];
  const p = playlists.find(p => p.enabled && playlistKey(p) === chaos.card.playlist);
  return p ? p.tracks.filter(t => !t.drawn).map(t => ({ p, t })) : [];
}

function applyChaosCard(){
  if(!chaosOn()) return;
  const card = chaos.card;
  if(card.id === 'month' && !expertMode){
    chaos.saved.expert = false;
    setExpertMode(true);
  }
  if(card.id === 'nomonth' && expertMode){
    chaos.saved.expert = true;
    setExpertMode(false);
  }
  if(card.id === 'speed'){
    chaos.saved.clip = CLIP_SECONDS;
    setClipSeconds(card.x);
  }
}

// Put back whatever the current card changed.
function endChaosCard(){
  if(!chaos || !chaos.saved) return;
  if(typeof chaos.saved.expert === 'boolean') setExpertMode(chaos.saved.expert);
  if(typeof chaos.saved.clip === 'number') setClipSeconds(chaos.saved.clip);
  chaos.saved = {};
}

function renderChaos(){
  const on = chaosOn();
  chaosAnnounce.hidden = !(on && chaos.pending);
  chaosChip.hidden = !(on && !chaos.pending);
  if(on){
    const c = chaos.card;
    document.getElementById('chaosAnnounceKicker').textContent = 'Chaos card · round ' + chaos.round;
    document.getElementById('chaosAnnounceTitle').textContent = c.title;
    document.getElementById('chaosAnnounceDesc').textContent = c.desc;
    document.getElementById('chaosAnnounceLen').textContent = chaos.len === 1 ? 'Lasts 1 song' : 'Lasts ' + chaos.len + ' songs — one each';
    const played = chaos.len - chaos.left;
    document.getElementById('chaosChipKicker').textContent = 'Chaos · round ' + chaos.round + ' · song ' + Math.max(1, played) + ' of ' + chaos.len;
    document.getElementById('chaosChipTitle').textContent = c.title;
    document.getElementById('chaosChipDesc').textContent = c.desc;
  }
  broadcastState();
}

document.getElementById('chaosStartBtn').addEventListener('click', () => heroBtn.click());

/* ── turns ────────────────────────────────────────────────────────────────
   One player per song, in scoreboard order. The DJ can click the turn line to
   hand it to the next player (someone left, or they're out of order). */

function advanceTurn(){
  if(!players.length){ turnName = null; return; }
  // A passed song doesn't move the rotation: carry on from whoever passed it.
  const i = players.findIndex(p => p.name === ((song && song.passedFrom) || turnName));
  turnName = players[(i + 1) % players.length].name;
}

function renderTurn(){
  renderShopButton();
  renderHint();
}

// Is this song someone's turn? Not before the first draw, and not during an
// over/under pop-up, which everyone plays.
function turnActive(){
  return autoTurns && !!currentCard && !(song && song.event);
}

function setTurn(name){
  turnName = name;
  if(song && !song.settled && !song.event){
    song.turn = name;
    // A pick was about the old turn player's timeline.
    song.spot = null;
    // Nobody bets on their own turn.
    const p = players.find(p => p.name === name);
    if(song.bets && p && p.deviceId) delete song.bets.placed[p.deviceId];
  }
  renderScoreboard();
  renderBets();
  renderSpot();
}

/* ── point to your spot ──────────────────────────────────────────────────
   With automatic turns, the turn player taps the gap in their own timeline
   where they think the song goes. The DJ sees the pick, and after the reveal
   whether it was right — the DJ still gives the card as usual. Slot i is the
   gap before their i-th card (0 = before the oldest, n = after the newest). */

// The turn player's cards as they were before this song.
function spotTimeline(){
  const p = song && players.find(p => p.name === song.turn);
  return p ? p.timeline.filter(e => e.locked || e.id !== song.id) : [];
}
function spotValue(e){
  return expertMode ? e.year * 12 + (e.month || 1) - 1 : e.year;
}
function spotRight(slot){
  const vals = spotTimeline().map(spotValue);
  const v = spotValue({ year: parseInt(currentCard.year, 10), month: currentCard.month });
  return (slot === 0 || vals[slot - 1] <= v) && (slot === vals.length || v <= vals[slot]);
}
// "1983 – 2000", "before 1953", "after 2024" — titles in a blindfold round.
function spotLabel(tl, slot){
  const name = e => chaosActive('blind') ? '“' + (e.title || '?') + '”' : String(e.year);
  if(!tl.length) return 'anywhere';
  if(slot === 0) return 'before ' + name(tl[0]);
  if(slot === tl.length) return 'after ' + name(tl[tl.length - 1]);
  return name(tl[slot - 1]) + ' – ' + name(tl[slot]);
}
function spotOn(){
  return autoTurns && !!song && !song.event && !!currentCard && song.id === currentCard.id && !song.skipped;
}
function placeSpot(payload){
  if(!spotOn() || revealed || !payload || payload.songId !== song.id) return;
  const p = players.find(p => p.deviceId && p.deviceId === payload.deviceId);
  if(!p || p.name !== song.turn) return;
  // null: the player took their pick back (turned pointing off on the phone).
  if(payload.slot === null){
    song.spot = null;
    renderSpot();
    return;
  }
  const slot = Math.floor(Number(payload.slot));
  if(!(slot >= 0 && slot <= spotTimeline().length)) return;
  song.spot = slot;
  renderSpot();
}
function renderSpot(){
  const box = document.getElementById('spotBox');
  const has = spotOn() && song.spot != null;
  box.hidden = !has;
  if(has){
    let line = song.turn + ' points to ' + spotLabel(spotTimeline(), song.spot);
    if(revealed && !isNaN(parseInt(currentCard.year, 10))) line += spotRight(song.spot) ? ' · ✓ right, card given' : ' · ✗ wrong spot';
    document.getElementById('spotLine').textContent = line;
  }
  broadcastState();
}

/* ── settling a song when the next one is drawn ─────────────────────────── */

// The card a player won most recently (before this song). Cards from before
// this was tracked have no time; the last one stands in.
function latestCard(player){
  const settled = player.timeline.filter(e => e.locked);
  if(!settled.length) return null;
  return settled.reduce((a, e) => (e.addedAt || 0) >= (a.addedAt || 0) ? e : a);
}

function restoreCard(player, entry){
  player.timeline.push(entry);
  player.timeline.sort((a,b) => (a.year - b.year) || ((a.month||1) - (b.month||1)));
  statsCardsPlaced++;
  sessionCardsPlaced++;
  statsCoinsWon += coinValue(entry);
  sessionCoinsWon += coinValue(entry);
}

function loseLatestCard(player){
  const latest = latestCard(player);
  if(!latest) return null;
  player.timeline.splice(player.timeline.indexOf(latest), 1);
  if(player.lastAdded === latest) player.lastAdded = null;
  statsCardsPlaced = Math.max(0, statsCardsPlaced - 1);
  sessionCardsPlaced = Math.max(0, sessionCardsPlaced - 1);
  uncountCoins(latest);
  return latest;
}

// Robin Hood: after every song of the round, the player with the most coins
// gives one to the player with the fewest. Ties: more cards counts as richer,
// fewer as poorer, then a random pick. Nothing moves when everyone has the
// same. It fires once per song, when the song is settled at the next draw,
// so that song's own coins are already counted.
function robinSong(){
  if(!chaosActive('robin') || !song || song.event || song.robin) return null;
  const coins = p => bonusCount(p);
  // Most coins, then most cards — and a random pick if that's still a tie.
  const key = p => coins(p) * 1000 + p.timeline.length;
  const top = Math.max(...players.map(key));
  const bottom = Math.min(...players.map(key));
  const rich = pickRandom(players.filter(p => key(p) === top));
  const poor = pickRandom(players.filter(p => key(p) === bottom && p !== rich));
  if(!rich || !poor || rich === poor || coins(rich) <= 0 || coins(rich) === coins(poor)) return null;
  rich.coinAdj = (rich.coinAdj || 0) - 1;
  poor.coinAdj = (poor.coinAdj || 0) + 1;
  song.robin = { rich: rich.name, poor: poor.name };
  sessionChaos.robin++;
  tally(sessionChaos.robinGave, rich.name);
  tally(sessionChaos.robinGot, poor.name);
  return { en: 'Robin Hood: ' + rich.name + ' gives ' + poor.name + ' 1 coin', da: 'Robin Hood: ' + rich.name + ' giver ' + poor.name + ' 1 mønt' };
}

function settleSong(){
  if(!song || song.settled) return;
  song.settled = true;
  // Skipped without a reveal: nothing to judge, bets are off. Robin Hood
  // still takes its coin — it does after every song.
  if(!revealed || !currentCard || currentCard.id !== song.id){
    const robin = robinSong();
    if(robin){
      gameEvent(robin);
      renderScoreboard();
    }
    return;
  }
  const turnPlayer = players.find(p => p.name === song.turn);
  const won = turnPlayer ? turnPlayer.timeline.find(e => e.id === song.id && !e.locked) : null;
  const notes = [];

  // Won on your own turn: the streak goes on. Missed (or bought it): it's over.
  if(turnPlayer && autoTurns){
    tally(sessionChaos.turns, turnPlayer.name);
    if(won && !won.bought) tally(sessionChaos.turnWins, turnPlayer.name);
    turnPlayer.streak = won && !won.bought ? (turnPlayer.streak || 0) + 1 : 0;
    if(turnPlayer.streak > (sessionChaos.streaks[turnPlayer.name] || 0)) sessionChaos.streaks[turnPlayer.name] = turnPlayer.streak;
  }

  if(song.passedFrom && turnPlayer && !won){
    const passer = players.find(p => p.name === song.passedFrom);
    if(passer){
      turnPlayer.coinAdj = (turnPlayer.coinAdj || 0) - 1;
      passer.coinAdj = (passer.coinAdj || 0) + 1;
      notes.push({ en: turnPlayer.name + ' pays ' + passer.name + ' 1 coin', da: turnPlayer.name + ' betaler ' + passer.name + ' 1 mønt' });
    }
  }

  if(song.bets && turnPlayer){
    const results = {};
    Object.entries(song.bets.placed).forEach(([deviceId, bet]) => {
      const bettor = players.find(p => p.deviceId === deviceId);
      if(!bettor) return;
      const hit = bet.pick === 'wrong' ? !won : bet.pick === 'coin' ? !!(won && won.bonus) : !!won;
      // Like any bet: ×2 pays back double your stake, so you're up by the
      // stake (×3: up by twice the stake). Lose, and the stake is gone.
      const delta = hit ? bet.amount * (bet.pick === 'coin' ? 2 : 1) : -bet.amount;
      bettor.coinAdj = (bettor.coinAdj || 0) + delta;
      tally(sessionChaos.bets, bettor.name, delta);
      if(delta > 0){ statsCoinsWon += delta; sessionCoinsWon += delta; }
      results[deviceId] = { pick: bet.pick, amount: bet.amount, delta };
    });
    lastBetResults = { id: song.bets.id, turn: song.turn, results };
  }

  // Double or nothing: the turn player didn't get the card, so their latest
  // one goes now, unless the DJ already took it. Needs automatic turns (the
  // only time we know whose turn it was).
  if(chaosActive('don') && autoTurns && !song.event && turnPlayer && !won && !song.donLost){
    const lost = loseLatestCard(turnPlayer);
    if(lost){
      song.donLost = lost;
      sessionChaos.donLost++;
      notes.push({ en: turnPlayer.name + ' lost ' + lost.year + ' — double or nothing', da: turnPlayer.name + ' mistede ' + lost.year + ' — dobbelt eller intet' });
    }
  }

  // Robin Hood last, so this song's own coins (and bets) are counted.
  const robin = robinSong();
  if(robin) notes.push(robin);

  const both = n => typeof n === 'object' ? n : { en: n, da: n };
  if(notes.length) gameEvent({ en: notes.map(n => both(n).en).join(' · '), da: notes.map(n => both(n).da).join(' · ') });
  renderScoreboard();
}

