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
    quick: player.timeline.filter(e => e.quick).length,
    quickBest: Math.min(...player.timeline.filter(e => e.quick).map(e => e.quick), Infinity),
    donWins: player.timeline.filter(e => e.donCoin).length,
    robinGot: s.robinGot[player.name] || 0,
    robinGave: s.robinGave[player.name] || 0,
    sabotage: s.sabotage[player.name] || 0,
    steals: s.steals[player.name] || 0,
    bought: s.bought[player.name] || 0,
    shopOn: Object.keys(s.shop).length > 0,
    // Steals and sabotage by everyone else: a "Pacifist" needs someone to
    // have been hostile around them.
    hostileOthers: players.reduce((n, p) => n + (p === player ? 0 : (s.steals[p.name] || 0) + (s.sabotage[p.name] || 0)), 0),
    hatTricks: s.hatTricks[player.name] || 0,
    shortTurns: s.shortTurns[player.name] || 0,
    shortWins: s.shortWins[player.name] || 0,
    longWins: s.longWins[player.name] || 0,
    // Last after three songs, then won.
    comeback: !!gameWinner && gameWinner.name === player.name && s.lastAfter3 === player.name,
    missed: Math.max(0, (s.turns[player.name] || 0) - (s.turnWins[player.name] || 0)),
    avgYear: years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : null,
    decadeCount: Object.keys(decades).length,
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

