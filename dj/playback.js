function addPlaylist(name, tracks, id){
  playlists.push({name, tracks, enabled: true, id: id || null, expanded: false});
  if(id) loadedPlaylistIds.add(id);
  currentCard = null;
  revealed = false;
  nowTitle.textContent = '—';
  nowArtist.textContent = '';
  nowYear.textContent = '';
  setDeckLabel(null);
  reloadBtn.disabled = false;
  resetBtn.disabled = false;
  drawBtn.disabled = false;
  refreshStatus();
  renderTracklist();
}

function extractPlaylistId(url){
  const m = url.match(/playlist[\/:]([a-zA-Z0-9]{10,})/);
  if(m) return m[1].split('?')[0];
  if(/^[a-zA-Z0-9]{10,}$/.test(url.trim())) return url.trim();
  return null;
}

async function fetchPlaylistName(playlistId){
  try{
    const res = await fetch('https://api.spotify.com/v1/playlists/' + playlistId + '?fields=name', {headers:{'Authorization':'Bearer ' + accessToken}});
    if(!res.ok) throw new Error();
    const data = await res.json();
    return data.name || 'Playlist';
  }catch(e){
    return 'Playlist';
  }
}

async function fetchPlaylistTracks(playlistId){
  let items = [];
  let url = 'https://api.spotify.com/v1/playlists/' + playlistId + '/items?limit=100';
  while(url){
    const res = await fetch(url, {headers:{'Authorization':'Bearer ' + accessToken}});
    if(!res.ok){
      let detail = '';
      try{
        const errData = await res.json();
        detail = errData.error && errData.error.message ? errData.error.message : '';
      }catch(e){}
      const err = new Error('playlist request failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
      if(res.status === 403) err.isForbidden = true;
      throw err;
    }
    const data = await res.json();
    for(const entry of data.items){
      const t = entry.item || entry.track;
      if(!t || !t.id) continue;
      const releaseDate = (t.album && t.album.release_date) ? t.album.release_date : '';
      const precision = (t.album && t.album.release_date_precision) || '';
      const hasMonth = releaseDate.length >= 7 && (precision === 'month' || precision === 'day');
      items.push({
        id: t.id,
        uri: t.uri,
        title: t.name,
        artist: (t.artists || []).map(a => a.name).join(', '),
        year: releaseDate ? releaseDate.slice(0,4) : '',
        month: hasMonth ? parseInt(releaseDate.slice(5,7), 10) : null,
        drawn:false
      });
    }
    url = data.next;
  }
  return items;
}

loadPlaylistBtn.addEventListener('click', async () => {
  if(!accessToken){
    playlistStatus.textContent = 'connect your Spotify account first';
    return;
  }
  const urls = document.getElementById('playlistUrls').value.split('\n').map(l=>l.trim()).filter(Boolean);
  const allIds = urls.map(extractPlaylistId).filter(Boolean);
  if(allIds.length === 0){
    playlistStatus.textContent = 'no valid playlist links found';
    return;
  }
  const seenThisBatch = new Set();
  const ids = [];
  let skippedCount = 0;
  for(const id of allIds){
    if(loadedPlaylistIds.has(id) || seenThisBatch.has(id)){
      skippedCount++;
      continue;
    }
    seenThisBatch.add(id);
    ids.push(id);
  }
  if(ids.length === 0){
    playlistStatus.textContent = 'already loaded — remove it first if you want to reload it';
    return;
  }
  loadPlaylistBtn.disabled = true;
  try{
    let loadedCount = 0;
    const forbiddenNames = [];
    const otherErrors = [];
    for(let i=0; i<ids.length; i++){
      playlistStatus.textContent = 'loading playlist ' + (i+1) + ' of ' + ids.length + '…';
      const name = await fetchPlaylistName(ids[i]);
      try{
        const tracks = await fetchPlaylistTracks(ids[i]);
        if(tracks.length > 0){
          addPlaylist(name, tracks, ids[i]);
          loadedCount++;
        }
      }catch(err){
        if(err.isForbidden){
          forbiddenNames.push(name);
        }else{
          otherErrors.push(name + ': ' + err.message);
        }
      }
    }
    document.getElementById('playlistUrls').value = '';
    let msg = loadedCount > 0
      ? 'loaded ' + loadedCount + ' playlist' + (loadedCount===1?'':'s')
      : 'no playable tracks found in those playlists';
    if(skippedCount > 0) msg += ' — skipped ' + skippedCount + ' already loaded';
    if(otherErrors.length > 0) msg += ' — ' + otherErrors.join('; ');
    playlistStatus.textContent = msg;
    const notOwnedBanner = document.getElementById('notOwnedWarningBanner');
    if(forbiddenNames.length > 0){
      notOwnedBanner.innerHTML = '<strong>Heads up:</strong> Spotify blocked access to ' + (forbiddenNames.length === 1 ? 'this playlist' : 'these playlists') + ' — <strong>' + forbiddenNames.map(escapeHtml).join('</strong>, <strong>') + '</strong> (403 Forbidden). This almost always means the connected account doesn\'t own it. Copy it to your own account first (see the setup guide above) and use that link instead.';
      notOwnedBanner.style.display = 'block';
    }else{
      notOwnedBanner.style.display = 'none';
    }
  }catch(err){
    playlistStatus.textContent = err.message || 'something went wrong loading the playlists';
  }
  loadPlaylistBtn.disabled = false;
});

reloadBtn.addEventListener('click', async () => {
  if(!accessToken){
    playlistStatus.textContent = 'connect your Spotify account first';
    return;
  }
  reloadBtn.disabled = true;
  const originalLabel = reloadBtn.textContent;
  try{
    for(let i = 0; i < playlists.length; i++){
      const p = playlists[i];
      reloadBtn.textContent = 'Reloading ' + (i + 1) + ' of ' + playlists.length + '…';
      if(!p.id) continue;
      const [name, tracks] = await Promise.all([
        fetchPlaylistName(p.id),
        fetchPlaylistTracks(p.id)
      ]);
      const prevStateById = new Map(p.tracks.map(t => [t.id, { drawn: t.drawn, revealedOnce: t.revealedOnce }]));
      tracks.forEach(t => {
        const prev = prevStateById.get(t.id);
        if(prev){
          t.drawn = prev.drawn;
          t.revealedOnce = prev.revealedOnce;
        }
      });
      p.name = name;
      p.tracks = tracks;
    }
    currentCard = null;
    revealed = false;
    nowTitle.textContent = '—';
    nowArtist.textContent = '';
    nowYear.textContent = '';
    setDeckLabel(null);
    refreshStatus();
    renderTracklist();
    playlistStatus.textContent = 'playlists reloaded';
  }catch(err){
    playlistStatus.textContent = err.message || 'something went wrong reloading the playlists';
  }
  reloadBtn.textContent = originalLabel;
  reloadBtn.disabled = false;
});

resetBtn.addEventListener('click', async () => {
  if(playlists.length > 0 && !(await showConfirm('Reset the whole deck? This removes all loaded playlists and clears progress.'))) return;
  playlists = [];
  loadedPlaylistIds.clear();
  currentCard = null;
  revealed = false;
  document.getElementById('playlistUrls').value = '';
  playlistStatus.textContent = '';
  deckStatus.textContent = 'no deck yet';
  offStatus.textContent = '';
  nowTitle.textContent = '—';
  nowArtist.textContent = '';
  nowYear.textContent = '';
  setDeckLabel(null);
  reloadBtn.disabled = true;
  resetBtn.disabled = true;
  drawBtn.disabled = true;
  replayBtn.disabled = true;
  newPointBtn.disabled = true;
  revealBtn.disabled = true;
  stopBtn.disabled = true;
  renderTracklist();
});

window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const el = document.getElementById('sp-frame-holder');
  IFrameAPI.createController(el, {uri:''}, (c) => {
    controller = c;
    apiReady = true;
    controller.addListener('playback_update', e => {
      lastKnownPaused = e.data.isPaused;
      lastKnownPosition = e.data.position || 0;
      lastKnownDuration = e.data.duration || 0;
      // Safety net: Spotify playing while the deck isn't — a play that landed
      // after its pause, say, while a song waits for Start. The DJ can't see
      // or stop that, so pause it. Only once the position is really moving
      // (a stale "playing" update right after a pause doesn't count), and at
      // most every 2s.
      if(!e.data.isPaused && !awaitingSound && !vinyl.classList.contains('spinning')){
        if(strayPrevPos !== null && lastKnownPosition > strayPrevPos + 50 && Date.now() - strayPausedAt > 2000){
          strayPausedAt = Date.now();
          controller.pause();
        }
        strayPrevPos = lastKnownPosition;
      }else{
        strayPrevPos = null;
      }
      // The clip is measured in song time, not wall time: it ends when the
      // song itself reaches clipEndMs. Nothing (spin, ring, countdown) starts
      // until the song is really moving — Spotify often sends a stale
      // "playing" update with the old position first, so it takes two
      // updates with the position going up.
      if(awaitingSound){
        const pos = lastKnownPosition;
        const inWindow = !e.data.isPaused && pos >= soundFromMs && pos < soundFromMs + 5000;
        if(inWindow && cuePrevPos !== null && pos > cuePrevPos + 50){
          setPlayingVisual(true);
          if(clipEndMs && !untimedMode){
            pendingCountdownStart = false;
            if(clipEndMs - pos <= 0) endClip();
            else runClip(clipEndMs - pos);
          }
        }
        cuePrevPos = inWindow ? pos : null;
      }else if(clipEndMs && !untimedMode && !e.data.isPaused && vinyl.classList.contains('spinning')){
        const left = clipEndMs - lastKnownPosition;
        if(left <= 0){
          endClip();
        }else if(lastKnownPosition >= clipEndMs - clipSeconds() * 1000){
          // Re-aim the stop at the real song position on every update, and
          // put the ring back in step if buffering let it drift.
          clearTimeout(snippetTimer);
          snippetTimer = setTimeout(endClip, left);
          if(Math.abs(remainingSeconds * 1000 - left) > 1500) runClip(left);
        }
      }
      if(!isScrubbing){
        scrubSlider.max = lastKnownDuration || 100;
        scrubSlider.value = lastKnownPosition;
      }
      debugInfo.textContent = fmtMs(lastKnownPosition) + ' / ' + (revealed ? fmtMs(lastKnownDuration) : '?:??') + (e.data.isPaused ? ' — paused' : ' — playing') + (lastStartMs ? ' — clip start used: ' + fmtMs(lastStartMs) : '');
    });
  });
};

document.getElementById('debugDetails').addEventListener('toggle', function(){
  if(this.open){
    scrubSlider.max = lastKnownDuration || 100;
    scrubSlider.value = lastKnownPosition;
  }
});

scrubSlider.addEventListener('mousedown', () => isScrubbing = true);
scrubSlider.addEventListener('touchstart', () => isScrubbing = true);

scrubPlayBtn.addEventListener('click', () => {
  if(!controller || !currentCard) return;
  // A song waiting for Start (betster, coin shop) isn't paused — Start plays it.
  if(awaitingStart) return;
  // Decide from our own state, not Spotify's last report — a late "playing"
  // update right after a pause would make the next Space pause again.
  const running = awaitingSound || vinyl.classList.contains('spinning');
  if(!running){
    // Resume only within what's left of the clip; once it's used up Space
    // does nothing (Vibe mode has no limit).
    if(!untimedMode && (!clipEndMs || clipEndMs - pausedAtMs <= 0)) return;
    const resumeAtSeconds = Math.floor(pausedAtMs / 1000);
    // Spotify only seeks to whole seconds, so up to a second gets replayed.
    // Push the clip's end back by exactly that much: a resume can repeat a
    // little, but never cuts the clip short.
    if(clipEndMs) clipEndMs += pausedAtMs - resumeAtSeconds * 1000;
    controller.loadUri(currentCard.uri, false, resumeAtSeconds);
    controller.play();
    cueNeedle(resumeAtSeconds * 1000);
  }else{
    // Paused before the sound even started: resume from the cue point, not
    // from whatever position Spotify last reported.
    pausedAtMs = awaitingSound ? soundFromMs : lastKnownPosition;
    controller.pause();
    setPlayingVisual(false);
    clearTimeout(timerSyncTimeout);
    pauseCountdown();
  }
  if(document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
});

scrubSeekBtn.addEventListener('click', () => {
  if(!controller || !currentCard) return;
  playSnippet(false, Number(scrubSlider.value));
  isScrubbing = false;
});

continueBtn.addEventListener('click', () => {
  untimedMode = !untimedMode;
  continueBtn.textContent = untimedMode ? 'Vibe mode: on' : 'Vibe mode: off';
  if(untimedMode){
    clipEndMs = 0;
    clearTimeout(snippetTimer);
    clearInterval(countdownInterval);
    clearTimeout(countdownStartFallback);
    clearTimeout(timerSyncTimeout);
    pendingCountdownStart = false;
    timerLine.textContent = '∞';
    clipBar.style.transition = 'none';
    clipBar.style.width = '100%';
  }else{
    timerLine.textContent = clipSeconds() + 's';
    clipBar.style.transition = 'none';
    clipBar.style.width = '100%';
  }
});

// Like a real deck: the needle drops first (cueNeedle), the record only
// spins once Spotify's song position is actually moving, and the needle
// lifts again on stop, clip end or reveal.
let awaitingSound = false;
let cuePrevPos = null;
// Stray playback (see the playback listener): last position seen, last pause.
let strayPrevPos = null;
let strayPausedAt = 0;
let soundFromMs = 0;
let soundFallback = null;

function setPlayingVisual(isPlaying){
  awaitingSound = false;
  clearTimeout(soundFallback);
  if(isPlaying) releaseCoast();
  else if(vinyl.classList.contains('spinning')) coastToStop();
  vinyl.classList.toggle('spinning', isPlaying);
  tonearm.classList.toggle('down', isPlaying);
  audioEngine.classList.toggle('playing', isPlaying);
  syncStage();
  broadcastState();
}

function cueNeedle(fromMs){
  if(vinyl.classList.contains('spinning')) coastToStop();
  vinyl.classList.remove('spinning');
  tonearm.classList.add('down');
  awaitingSound = true;
  soundFromMs = fromMs;
  cuePrevPos = null;
  clearTimeout(soundFallback);
  // If Spotify never reports the song moving, start anyway rather than hang.
  soundFallback = setTimeout(() => {
    if(!awaitingSound) return;
    setPlayingVisual(true);
    if(clipEndMs && !untimedMode){ pendingCountdownStart = false; runClip(clipEndMs - fromMs); }
  }, 12000);
  syncStage();
}

let lastStartMs = 0;

function playSnippet(useNewPoint, overrideStartMs){
  if(!controller || !currentCard) return;
  clearTimeout(snippetTimer);
  clearInterval(countdownInterval);
  clearTimeout(countdownStartFallback);
  clearTimeout(timerSyncTimeout);
  if(overrideStartMs !== undefined){
    lastStartMs = overrideStartMs;
  }else if(useNewPoint || !lastStartMs){
    lastStartMs = (15 + Math.random()*30) * 1000;
  }
  const startAtSeconds = Math.floor(lastStartMs / 1000);
  clipEndMs = untimedMode ? 0 : (startAtSeconds + clipSeconds()) * 1000;
  setClipRun(untimedMode ? null : clipSeconds() * 1000, false);
  controller.loadUri(currentCard.uri, false, startAtSeconds);
  controller.play();
  cueNeedle(startAtSeconds * 1000);
  if(untimedMode){
    timerLine.textContent = '∞';
    clipBar.style.transition = 'none';
    clipBar.style.width = '100%';
    return;
  }
  timerLine.textContent = clipSeconds() + 's';
  freezeClipBar();
  clipBar.style.width = '100%';
  pendingCountdownStart = true;
}

drawBtn.addEventListener('click', () => {
  if(!apiReady){
    deckStatus.textContent = 'audio engine still loading, try again in a second';
    return;
  }
  const availablePlaylists = playlists.filter(p => p.enabled && p.tracks.some(t => !t.drawn));
  if(availablePlaylists.length === 0){
    const anyEnabled = playlists.some(p => p.enabled);
    deckStatus.textContent = anyEnabled ? 'deck is empty — shuffle to go again' : 'all playlists are off — toggle one on';
    return;
  }
  // Moving on settles the last song: double or nothing, bets. Bet results
  // from the song before that have had their moment.
  lastBetResults = null;
  autoCatchUp();
  settleSong();
  // A new chaos round shows its card first; the next press starts the song.
  if(chaosBeforeDraw()) return;
  const { p, t } = pickTrack();
  t.drawn = true;
  // An over/under pop-up is a bonus song: it doesn't use up anyone's turn or
  // a song of the chaos round.
  const ouStakes = rollOverUnder(t);
  if(!ouStakes) chaosAfterDraw();
  startVote(t, ouStakes);
  if(currentCard && !(song && song.event)){
    const wasPlaced = players.some(pl => pl.timeline.some(e => e.id === currentCard.id));
    if(!wasPlaced) sessionCardsLost++;
  }
  players.forEach(pl => {
    pl.timeline.forEach(entry => { entry.locked = true; });
    pl.lastAdded = null;
  });
  if(!ouStakes) advanceTurn();
  drawCount++;
  renderEvent();
  showTrack(p, t);
  song = ouStakes ? { id: t.id, event: true, settled: false } : {
    id: t.id,
    turn: turnName,
    bets: chaosActive('betster') ? { id: t.id + ':' + Date.now(), open: true, placed: {} } : null,
    lockin: newLockin(t),
    settled: false
  };
  // Betster and the coin shop: load it but wait for Start, so everyone can
  // bet or shop first.
  awaitingStart = !!song.bets || (!song.event && shopOpen());
  renderTracklist();
  renderScoreboard();
  renderBets();
  renderLockin();
  renderSpot();
  // A song waiting for Start — silence the last one meanwhile, and put the
  // ring back to a full clip now rather than when Start is pressed.
  if(awaitingStart){
    stopPlayback();
    resetClipVisual();
  }
  else playSnippet(true);
});

// A fresh, untouched clip: full bar and ring, full time on the label.
function resetClipVisual(){
  clipBar.style.transition = 'none';
  clipBar.style.width = '100%';
  timerLine.textContent = untimedMode ? '∞' : clipSeconds() + 's';
  setClipRun(untimedMode ? null : clipSeconds() * 1000, false);
}

// A random undrawn song: from the playlist round's playlist when one is on.
function pickTrack(){
  const playlistPool = chaosPlaylistPool();
  if(playlistPool.length) return playlistPool[Math.floor(Math.random() * playlistPool.length)];
  const available = playlists.filter(p => p.enabled && p.tracks.some(t => !t.drawn));
  if(!available.length) return null;
  const p = available[Math.floor(Math.random() * available.length)];
  const tracks = p.tracks.filter(t => !t.drawn);
  return { p, t: tracks[Math.floor(Math.random() * tracks.length)] };
}

function showTrack(p, t){
  t.drawn = true;
  currentCard = t;
  currentPlaylistName = p.name;
  revealed = false;
  setDeckLabel(null);
  nowTitle.textContent = 'mystery track';
  nowArtist.textContent = '';
  nowYear.textContent = '';
  refreshStatus();
  replayBtn.disabled = false;
  newPointBtn.disabled = false;
  revealBtn.disabled = false;
  stopBtn.disabled = false;
}

// A song waiting for Start (coin shop, betster) starts properly instead.
replayBtn.addEventListener('click', () => awaitingStart ? startSong() : playSnippet(false));
newPointBtn.addEventListener('click', () => awaitingStart ? startSong() : playSnippet(true));

function refreshNowYearDisplay(){
  if(!currentCard || !revealed) return;
  setDeckLabel(currentCard);
  const showMonth = expertMode && currentCard.year;
  nowYear.classList.toggle('with-month', !!showMonth);
  if(!currentCard.year){
    nowYear.textContent = 'year not set';
  }else if(showMonth){
    nowYear.innerHTML = '<span>' + escapeHtml(MONTH_NAMES[(currentCard.month || 1) - 1]) + ',</span><span>' + escapeHtml(String(currentCard.year)) + '</span>';
  }else{
    nowYear.textContent = currentCard.year;
  }
}

revealBtn.addEventListener('click', () => {
  if(!currentCard) return;
  revealed = true;
  settleVote();
  settleLockin();
  renderSpot();
  // A right pick on the phone wins the card straight away — the phone gets
  // its "You got it". The DJ can still take it back (or give it by hand to
  // someone who said their spot out loud instead).
  if(spotOn() && song.spot != null && !isNaN(parseInt(currentCard.year, 10)) && spotRight(song.spot)){
    const tp = players.find(p => p.name === song.turn);
    if(tp && !tp.timeline.some(e => e.id === currentCard.id)) giveCardTo(tp);
  }
  currentCard.revealedOnce = true;
  setDeckLabel(currentCard);
  nowTitle.textContent = currentCard.title;
  nowArtist.textContent = currentCard.artist;
  refreshNowYearDisplay();
  if(!currentCard.loggedToHistory){
    currentCard.loggedToHistory = true;
    statsRevealed++;
    // Keep the all-time history to the most recent HISTORY_MAX songs.
    if(sessionHistory.length >= HISTORY_MAX) sessionHistory.splice(0, sessionHistory.length - HISTORY_MAX + 1);
    sessionHistory.push({
      id: currentCard.id,
      year: currentCard.year,
      month: currentCard.month || null,
      title: currentCard.title,
      artist: currentCard.artist,
      playlist: currentPlaylistName,
      sessionId: currentSessionId
    });
    renderHistory();
    if(document.getElementById('sbRecapView').style.display !== 'none') renderRecap();
  }
  renderTracklist();
  renderScoreboard();
});

function stopPlayback(){
  clearTimeout(snippetTimer);
  clearInterval(countdownInterval);
  clearTimeout(countdownStartFallback);
  clearTimeout(timerSyncTimeout);
  pendingCountdownStart = false;
  freezeClipBar();
  pausedAtMs = lastKnownPosition;
  if(clipRun && clipRun.running) setClipRun(clipRun.left - (Date.now() - clipRun.at), false);
  // Only pause what might be playing: a pause sent to an already stopped
  // player has woken the last song back up.
  if(controller && (awaitingSound || vinyl.classList.contains('spinning') || !lastKnownPaused)) controller.pause();
  setPlayingVisual(false);
}
stopBtn.addEventListener('click', stopPlayback);

document.querySelectorAll('.footer-link').forEach(link => {
  link.addEventListener('click', (e) => e.preventDefault());
});

document.addEventListener('keydown', (e) => {
  if(e.code !== 'Space') return;
  if(e.repeat){ e.preventDefault(); return; }
  const tag = document.activeElement.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
  e.preventDefault();
  scrubPlayBtn.click();
});

