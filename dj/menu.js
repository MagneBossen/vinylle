let statsListenSeconds = 0;

const MENU_VIEWS = ['settings', 'rules', 'history', 'stats'];
const MENU_TITLES = {settings: 'Settings', rules: 'Rules', history: 'History', stats: 'Stats'};

function openMenu(view){
  menuOverlay.classList.add('open');
  MENU_VIEWS.forEach(v => {
    document.getElementById(v + 'View').style.display = (v === view) ? 'block' : 'none';
  });
  menuTitle.textContent = MENU_TITLES[view];
  if(view === 'stats') renderStats();
  document.querySelectorAll('#' + view + 'View .filter-toggle').forEach(positionToggleSlider);
}
function closeMenu(){ menuOverlay.classList.remove('open'); }

menuHamburger.addEventListener('click', (e) => {
  e.stopPropagation();
  menuTrigger.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if(!menuTrigger.contains(e.target)) menuTrigger.classList.remove('open');
});
document.querySelectorAll('.menu-dropdown-item').forEach(btn => {
  btn.addEventListener('click', () => {
    menuTrigger.classList.remove('open');
    menuTrigger.classList.add('suppress');
    openMenu(btn.dataset.view);
  });
});
menuTrigger.addEventListener('mouseleave', () => {
  menuTrigger.classList.remove('suppress');
});
closeMenuBtn.addEventListener('click', closeMenu);

function renderStats(){
  document.getElementById('statsRevealedValue').textContent = statsRevealed;
  document.getElementById('statsCardsValue').textContent = statsCardsPlaced;
  document.getElementById('statsCoinsValue').textContent = statsCoinsWon;
  const m = Math.floor(statsListenSeconds / 60);
  const s = statsListenSeconds % 60;
  document.getElementById('statsListenValue').textContent = m + ':' + String(s).padStart(2, '0');
}

function calcAccuracy(){
  const total = sessionCardsPlaced + sessionCardsLost;
  return total > 0 ? Math.round((sessionCardsPlaced / total) * 100) + '%' : '—';
}

// The recap's "Modes & extras" rows: only what came up this session (or is
// switched on), so a plain game shows none of it.
function chaosRecapRows(){
  const s = sessionChaos;
  const rows = [];
  const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
  const ranked = obj => Object.entries(obj).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  const cardName = id => ((CHAOS_CARDS.find(c => c.id === id) || {}).title || id).replace('{x}', 'X');
  const itemName = id => id === 'force' ? 'Forced song' : (SHOP_ITEMS.find(i => i.id === id) || {}).name || id;
  const times = n => n + (n === 1 ? ' time' : ' times');

  const rounds = sum(s.rounds);
  if(rounds){
    rows.push(['Chaos rounds', rounds]);
    rows.push(['Most played', ranked(s.rounds).slice(0, 3).map(([id, n]) => cardName(id) + ' ×' + n).join(', ')]);
  }
  const buys = sum(s.shop);
  if(buys || shopEnabled || s.rounds.shop){
    rows.push(['Shop buys', buys ? buys + ' · ' + ranked(s.shop).map(([id, n]) => itemName(id) + ' ×' + n).join(', ') : 0]);
    if(buys){
      rows.push(['Coins spent', sum(s.spent)]);
      const [name, n] = ranked(s.spent)[0];
      rows.push(['Big spender', name + ' · ' + n + ' coins']);
    }
  }
  if(s.ou || ouEnabled){
    rows.push(['Over/unders', s.ou]);
    const best = ranked(s.ouRight)[0];
    if(best) rows.push(['Over/under champ', best[0] + ' · ' + best[1] + ' of ' + s.ou + ' right']);
  }
  const lock = ranked(s.lockWins)[0];
  if(lock) rows.push(['Closest lock-ins', lock[0] + ' · won ' + times(lock[1])]);
  const bettor = ranked(s.bets)[0];
  if(bettor && bettor[1] > 0) rows.push(['Best bettor', bettor[0] + ' · +' + bettor[1] + ' coins']);
  const streak = ranked(s.streaks)[0];
  if(streak && streak[1] >= STREAK_FROM) rows.push(['Longest streak', streak[0] + ' · ' + streak[1] + ' in a row']);
  if(s.robin) rows.push(['Robin Hood', s.robin + (s.robin === 1 ? ' coin' : ' coins') + ' moved']);
  if(s.donLost) rows.push(['Lost to double or nothing', s.donLost + (s.donLost === 1 ? ' card' : ' cards')]);
  return rows;
}

// Everything a player's recap card shows (recap-card.js draws it). Phones get
// theirs in the state blob, so they can draw and save their own.
function recapCardData(player){
  const sorted = players.slice().sort(comparePlayers);
  const rank = sorted.indexOf(player) + 1;
  const years = player.timeline.map(e => e.year).filter(y => !isNaN(y)).sort((a, b) => a - b);
  const decades = {};
  years.forEach(y => tally(decades, Math.floor(y / 10) * 10));
  const fav = Object.entries(decades).sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0];
  const decade = fav ? (fav[0] < 2000 ? "'" + String(fav[0]).slice(2) + 's' : fav[0] + 's') : null;
  const s = sessionChaos;
  // Neighbouring cards: the tightest squeeze and the biggest leap.
  const gaps = years.slice(1).map((y, i) => y - years[i]);
  const months = player.timeline.map(e => e.year * 12 + (e.month || 1) - 1).filter(v => !isNaN(v)).sort((a, b) => a - b);
  const monthGaps = months.slice(1).map((v, i) => v - months[i]);
  return {
    name: player.name,
    rank,
    of: players.length,
    cards: player.timeline.length,
    coins: bonusCount(player),
    winLength: WIN_LENGTH,
    won: !!gameWinner && gameWinner.name === player.name,
    // Passed the winner while playing on.
    leads: rank === 1 && !!gameWinner && gameWinner.name !== player.name && player.timeline.length >= WIN_LENGTH,
    streak: player.streak || 0,
    bestStreak: Math.max(s.streaks[player.name] || 0, player.streak || 0),
    titles: player.timeline.filter(e => e.bonus).length,
    ouRight: s.ouRight[player.name] || 0,
    ou: s.ou,
    lockWins: s.lockWins[player.name] || 0,
    spent: s.spent[player.name] || 0,
    bets: s.bets[player.name] || 0,
    decade,
    decadeShare: fav && years.length ? Math.round(fav[1] / years.length * 100) : 0,
    years,
    tightest: gaps.length >= 2 ? Math.min(...gaps) : null,
    // With months in play (expert mode, or a guess-the-month round tonight)
    // the squeeze is measured in months. No release month counts as January.
    tightestMonths: (expertMode || s.rounds.month) && monthGaps.length >= 2 ? Math.min(...monthGaps) : null,
    leap: gaps.length ? Math.max(...gaps) : null,
    turns: s.turns[player.name] || 0,
    turnWins: s.turnWins[player.name] || 0,
    sang: player.timeline.filter(e => e.sang).length,
    donWins: player.timeline.filter(e => e.donCoin).length,
    robinGot: s.robinGot[player.name] || 0,
    robinGave: s.robinGave[player.name] || 0,
    sabotage: s.sabotage[player.name] || 0,
    steals: s.steals[player.name] || 0,
    date: Date.now()
  };
}

const recapCardOverlay = document.getElementById('recapCardOverlay');
let recapCanvas = null;
async function openRecapCard(player){
  recapCanvas = await drawRecapCard(recapCardData(player));
  recapCanvas.dataset.name = player.name;
  document.getElementById('recapCardImg').src = recapCanvas.toDataURL('image/png');
  document.getElementById('recapCardTitle').textContent = player.name + "'s night";
  recapCardOverlay.classList.add('open');
}
document.getElementById('recapCardSave').addEventListener('click', () => {
  if(recapCanvas) saveRecapCard(recapCanvas, recapCanvas.dataset.name);
});
document.getElementById('recapCardClose').addEventListener('click', () => recapCardOverlay.classList.remove('open'));
recapCardOverlay.addEventListener('click', (e) => { if(e.target === recapCardOverlay) recapCardOverlay.classList.remove('open'); });

function renderRecap(){
  const container = document.getElementById('recapStats');
  container.innerHTML = '';

  const sessionSongs = sessionHistory.filter(e => e.sessionId === currentSessionId);
  const sessionYears = sessionSongs.map(e => parseInt(e.year, 10)).filter(y => !isNaN(y));

  let yearRangeText = '—';
  let avgYearText = '—';
  if(sessionYears.length > 0){
    const minYear = Math.min(...sessionYears);
    const maxYear = Math.max(...sessionYears);
    yearRangeText = (minYear === maxYear) ? String(minYear) : (minYear + ' – ' + maxYear);
    const avg = sessionYears.reduce((a,b) => a+b, 0) / sessionYears.length;
    avgYearText = String(Math.round(avg));
  }

  const rows = [
    ['Songs listened', sessionSongs.length],
    ['Cards placed', sessionCardsPlaced],
    ['Cards lost', sessionCardsLost],
    ['Accuracy', calcAccuracy()],
    ['Gold coins won', sessionCoinsWon],
    ...(gameWinner ? [['Winner', gameWinner.name + ' · first to ' + gameWinner.target]] : []),
    ['Year range', yearRangeText],
    ['Average year', avgYearText]
  ];
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'menu-setting-row';
    row.style.justifyContent = 'space-between';
    row.innerHTML = '<span class="field-label" style="margin:0;">' + label + '</span><span class="menu-setting-value">' + value + '</span>';
    container.appendChild(row);
  });

  const cardsBox = document.getElementById('recapCards');
  cardsBox.innerHTML = '';
  if(players.length){
    const h = document.createElement('div');
    h.className = 'recap-h';
    h.textContent = 'Player cards';
    const row = document.createElement('div');
    row.className = 'recap-cards';
    players.slice().sort(comparePlayers).forEach(p => {
      const b = document.createElement('button');
      b.textContent = '📸 ' + p.name;
      b.addEventListener('click', () => openRecapCard(p));
      row.appendChild(b);
    });
    cardsBox.append(h, row);
  }

  const extras = chaosRecapRows();
  if(extras.length){
    const h = document.createElement('div');
    h.className = 'recap-h';
    h.textContent = 'Modes & extras';
    container.appendChild(h);
    extras.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'menu-setting-row';
      row.style.justifyContent = 'space-between';
      const l = document.createElement('span');
      l.className = 'field-label';
      l.style.margin = '0';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'menu-setting-value recap-v';
      v.textContent = value;
      row.append(l, v);
      container.appendChild(row);
    });
  }

  const songList = document.getElementById('recapSongList');
  songList.innerHTML = '';
  songList.style.maxHeight = '';
  if(sessionSongs.length === 0){
    songList.innerHTML = '<p class="empty">Nothing revealed yet this session.</p>';
  }else{
    sessionSongs.slice().reverse().forEach(entry => {
      const row = document.createElement('div');
      row.className = 'history-entry';
      row.innerHTML = `
        <span class="history-year">${formatHistoryYear(entry)}</span>
        <span class="history-title">${entry.title ? escapeHtml(entry.title) + (entry.artist ? ' — ' + escapeHtml(entry.artist) : '') : 'Unknown track'}</span>
      `;
      songList.appendChild(row);
    });
    const firstRow = songList.querySelector('.history-entry');
    if(firstRow){
      songList.style.maxHeight = (firstRow.offsetHeight * 10) + 'px';
    }
  }
}

function buildStaticVinylCard(entry){
  const card = document.createElement('div');
  card.className = 'vinyl-card' + (entry.bonus ? ' has-bonus' : '');
  card.style.flexShrink = '0';
  const disc = document.createElement('span');
  disc.className = 'card-disc';
  card.appendChild(disc);
  appendCardYear(card, entry);
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
  return card;
}

function saveTimelineAsImage(player){
  const capture = document.createElement('div');
  capture.className = 'export';
  capture.style.cssText = 'position:fixed;left:-99999px;top:0;background:#251A2B;padding:2.5rem 2rem;display:inline-block;';

  const header = document.createElement('div');
  header.style.cssText = 'text-align:center;margin-bottom:1.8rem;';
  header.innerHTML = `
    <div class="capture-title">Vinyl'le</div>
    <div class="capture-subtitle">${escapeHtml(player.name)}'s timeline</div>
  `;
  capture.appendChild(header);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:nowrap;gap:2.2rem;padding-top:2rem;align-items:flex-end;';
  if(player.timeline.length === 0){
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No cards placed yet.';
    row.appendChild(empty);
  }else{
    const gapInfo = timelineGaps(player.timeline);
    player.timeline.forEach((entry, i) => {
      const card = buildStaticVinylCard(entry);
      if(i > 0) card.appendChild(buildGapEl(gapInfo[i]));
      row.appendChild(card);
    });
  }
  capture.appendChild(row);

  document.body.appendChild(capture);
  snapshot(capture, {backgroundColor: '#251A2B', scale: 2}).then(canvas => {
    document.body.removeChild(capture);
    const link = document.createElement('a');
    const safeName = player.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'player';
    link.download = 'vinylle-timeline-' + safeName + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(() => {
    if(capture.parentNode) document.body.removeChild(capture);
  });
}

function renderPodium(){
  const stage = document.getElementById('podiumStage');
  const rest = document.getElementById('podiumRest');
  stage.innerHTML = '';
  rest.innerHTML = '';
  stage.classList.toggle('is-empty', players.length === 0);
  if(players.length === 0){
    stage.innerHTML = '<p class="empty">No players yet.</p>';
    return;
  }
  const sorted = players.slice().sort(comparePlayers);
  const top3 = sorted.slice(0, 3);
  const rankClasses = ['first', 'second', 'third'];
  const rankLabels = ['1', '2', '3'];
  const visualOrder = [1, 0, 2];
  visualOrder.forEach(idx => {
    if(idx >= top3.length) return;
    const p = top3[idx];
    const bonus = bonusCount(p);
    const column = document.createElement('div');
    column.className = 'podium-column ' + rankClasses[idx];
    column.innerHTML = `
      <div class="podium-info">
        <div class="podium-name">${p.name}</div>
        <div class="podium-score-row">
          <span class="podium-score-item">${CARD_ICON_SVG}<span>${p.timeline.length}</span></span>
          <span class="podium-score-item">${COIN_SVG}<span>${bonus}</span></span>
        </div>
      </div>
      <div class="podium-block ${rankClasses[idx]}">
        <span class="podium-medal">${medalSVG(idx + 1)}</span>
      </div>
    `;
    stage.appendChild(column);
  });
  sorted.slice(3).forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'podium-rest-row';
    const bonus = bonusCount(p);
    row.innerHTML = `
      <span class="podium-rest-rank">${String(i + 4).padStart(2, '0')}</span>
      <span class="podium-rest-name">${p.name}</span>
      <span class="podium-rest-count">${CARD_ICON_SVG}<span>${p.timeline.length}</span></span>
      <span class="podium-rest-count">${COIN_SVG}<span>${bonus}</span></span>
    `;
    rest.appendChild(row);
  });
}

// "Save results" makes a ready-to-post 1080×1350 poster rather than a
// screenshot of the panel: podium, the rest of the table, and the leader's
// sleeves along the bottom.
function buildResultsPoster(){
  const sorted = players.slice().sort(comparePlayers);
  const poster = document.createElement('div');
  poster.className = 'poster export';
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  let html = '<div class="poster-head"><div class="poster-record"></div>' +
    '<div class="poster-title">Vinyl\'le</div>' +
    '<div class="poster-sub">Leaderboard · ' + escapeHtml(date) + '</div></div>';

  if(sorted.length === 0){
    html += '<div class="poster-empty">No players this time.</div>';
    poster.innerHTML = html;
    return poster;
  }

  const ranks = ['first', 'second', 'third'];
  html += '<div class="poster-podium">';
  [1, 0, 2].forEach(idx => {
    const p = sorted[idx];
    if(!p) return;
    html += '<div class="pp-col pp-' + ranks[idx] + '">' +
      '<div class="pp-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="pp-score"><span>' + CARD_ICON_SVG + p.timeline.length + '</span><span>' + COIN_SVG + bonusCount(p) + '</span></div>' +
      '<div class="pp-block">' + medalSVG(idx + 1) + '</div></div>';
  });
  html += '</div>';

  const rest = sorted.slice(3);
  if(rest.length){
    const shown = rest.length > 4 ? rest.slice(0, 3) : rest;
    html += '<div class="poster-rest">';
    shown.forEach((p, i) => {
      html += '<div class="pr-row"><span class="pr-rank">' + String(i + 4).padStart(2, '0') + '</span>' +
        '<span class="pr-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="pr-score"><span>' + CARD_ICON_SVG + p.timeline.length + '</span><span>' + COIN_SVG + bonusCount(p) + '</span></span></div>';
    });
    if(rest.length > shown.length) html += '<div class="pr-more">+ ' + (rest.length - shown.length) + ' more</div>';
    html += '</div>';
  }

  const leader = (gameWinner && sorted.find(p => p.name === gameWinner.name)) || sorted[0];
  if(leader.timeline.length){
    const won = !!gameWinner && gameWinner.name === leader.name;
    html += '<div class="poster-winner"><div class="pw-h">' + escapeHtml(leader.name) + (won ? '\'s winning timeline' : '\'s timeline') + '</div><div class="pw-row">';
    leader.timeline.slice(0, 10).forEach(e => {
      html += '<div class="pw-card' + (e.bonus ? ' coin' : '') + '"><div class="pw-y">' + escapeHtml(String(e.year)) + '</div><div class="pw-t">' + escapeHtml(e.title || '') + '</div></div>';
    });
    if(leader.timeline.length > 10) html += '<div class="pw-more">+' + (leader.timeline.length - 10) + '</div>';
    html += '</div></div>';
  }

  poster.innerHTML = html;
  return poster;
}

document.getElementById('savePodiumBtn').addEventListener('click', () => {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;';
  const poster = buildResultsPoster();
  holder.appendChild(poster);
  document.body.appendChild(holder);
  snapshot(poster, {backgroundColor: '#1B1420', scale: 1, width: 1080, height: 1350}).then(canvas => {
    holder.remove();
    const link = document.createElement('a');
    link.download = 'vinylle-podium.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(() => holder.remove());
});

document.getElementById('saveRecapBtn').addEventListener('click', () => {
  const sessionSongs = sessionHistory.filter(e => e.sessionId === currentSessionId);
  const sessionYears = sessionSongs.map(e => parseInt(e.year, 10)).filter(y => !isNaN(y));
  let yearRangeText = '—';
  let avgYearText = '—';
  if(sessionYears.length > 0){
    const minYear = Math.min(...sessionYears);
    const maxYear = Math.max(...sessionYears);
    yearRangeText = (minYear === maxYear) ? String(minYear) : (minYear + ' - ' + maxYear);
    const avg = sessionYears.reduce((a,b) => a+b, 0) / sessionYears.length;
    avgYearText = String(Math.round(avg));
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timestamp = pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() + ' - ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  const lines = [];
  lines.push("VINYL'LE — SESSION RECAP");
  lines.push(timestamp);
  lines.push('');
  lines.push('Songs listened: ' + sessionSongs.length);
  lines.push('Cards placed: ' + sessionCardsPlaced);
  lines.push('Cards lost: ' + sessionCardsLost);
  lines.push('Accuracy: ' + calcAccuracy());
  lines.push('Gold coins won: ' + sessionCoinsWon);
  lines.push('Year range: ' + yearRangeText);
  lines.push('Average year: ' + avgYearText);
  const extras = chaosRecapRows();
  if(extras.length){
    lines.push('');
    lines.push('MODES & EXTRAS');
    extras.forEach(([label, value]) => lines.push(label + ': ' + value));
  }
  lines.push('');
  lines.push('LEADERBOARD');
  lines.push('-----------------------------------------');
  if(players.length === 0){
    lines.push('No players this session.');
  }else{
    const sorted = players.slice().sort(comparePlayers);
    sorted.forEach((player, i) => {
      const coins = bonusCount(player);
      lines.push((i + 1) + '. ' + player.name + ' — ' + player.timeline.length + ' cards, ' + coins + ' coins');
    });
  }
  lines.push('');
  lines.push('SONGS THIS SESSION');
  lines.push('-----------------------------------------');
  if(sessionSongs.length === 0){
    lines.push('Nothing revealed yet this session.');
  }else{
    sessionSongs.slice().reverse().forEach(entry => {
      const titleArtist = entry.title ? entry.title + (entry.artist ? ' — ' + entry.artist : '') : 'Unknown track';
      lines.push((entry.year || '----') + '  ' + titleArtist);
    });
  }

  const blob = new Blob([lines.join('\n')], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = 'vinylle-recap.txt';
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
});

clipLengthInput.addEventListener('input', () => {
  CLIP_SECONDS = parseInt(clipLengthInput.value, 10);
  clipLengthValue.textContent = CLIP_SECONDS + 's';
  saveSession();
});
winLengthInput.addEventListener('input', () => {
  WIN_LENGTH = parseInt(winLengthInput.value, 10);
  winLengthValue.textContent = WIN_LENGTH;
  // A higher target puts the win back up for grabs; a lower one keeps it.
  if(gameWinner && WIN_LENGTH > gameWinner.target) gameWinner = null;
  if(checkWinner()) announceWinner();
  renderScoreboard();
  saveSession();
});

const uiScaleInput = document.getElementById('uiScaleInput');
const uiScaleValue = document.getElementById('uiScaleValue');
uiScaleInput.addEventListener('input', () => {
  uiScaleValue.textContent = uiScaleInput.value + '%';
  applyZoom();
  saveSession();
});

function positionToggleSlider(container){
  if(!container) return;
  const slider = container.querySelector('.toggle-slider');
  const activeBtn = container.querySelector('.sb-view-btn.active');
  if(!slider || !activeBtn) return;
  slider.style.left = activeBtn.offsetLeft + 'px';
  slider.style.width = activeBtn.offsetWidth + 'px';
}

