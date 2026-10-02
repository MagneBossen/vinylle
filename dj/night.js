/* ── the night: recap tab, recap picture, leaderboard pictures ─────────────
   The Recap tab tells the night as a story: the winner, one sentence, four
   big numbers, awards, tonight's songs on a line, and everyone's recap card.
   "Save recap" draws the top of it as a picture; the leaderboard's Save
   buttons draw the podium poster as a post (4:5) or a story (9:16). All
   pictures are drawn on a canvas with recap-card.js's pieces, so the three
   of them (and the players' own cards) look like one set. */

const decadeName = d => d < 2000 ? "'" + String(d).slice(2) + 's' : d + 's';

// Everything the tab and the recap picture show, worked out once.
function nightData(){
  const sorted = players.slice().sort(comparePlayers);
  const songs = sessionHistory.filter(e => e.sessionId === currentSessionId);
  const years = songs.map(e => parseInt(e.year, 10)).filter(y => !isNaN(y));
  const decades = {};
  years.forEach(y => tally(decades, Math.floor(y / 10) * 10));
  const top = Object.entries(decades).sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0];
  const per = sorted.map(recapCardData);
  const winner = gameWinner ? sorted.find(p => p.name === gameWinner.name) : null;
  return {
    sorted,
    per,
    songs,
    years,
    min: years.length ? Math.min(...years) : null,
    max: years.length ? Math.max(...years) : null,
    topDecade: top ? Number(top[0]) : null,
    accuracy: calcAccuracy(),
    cardsPlaced: sessionCardsPlaced,
    coinsWon: sessionCoinsWon,
    winner,
    leader: winner || sorted[0] || null,
    target: gameWinner ? gameWinner.target : WIN_LENGTH,
    awards: nightAwards(per)
  };
}

// Up to six awards, rarest first: each has a rarity score (the harder to
// earn, the higher), and the rarest ones that someone actually won get the
// slots. A tie goes to whoever ranks higher, and nobody takes more than two
// — the next best gets the third.
function nightAwards(per){
  const won = {};
  const pick = (val, ok, low) => {
    let best = null;
    per.forEach(d => {
      if((won[d.name] || 0) >= 2) return;
      const v = val(d);
      if(v == null || !ok(v, d)) return;
      if(!best || (low ? v < best.v : v > best.v)) best = { d, v };
    });
    return best;
  };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const hadShort = per.some(d => d.shortTurns > 0);
  // [rarity, find the winner, icon, title, the line under the name]
  const defs = [
    [96, () => pick(d => d.comeback ? 1 : null, v => v), '🪃', 'Comeback kid', () => 'Last after three songs, then won it all'],
    [94, () => pick(d => d.turns >= 6 && d.turnWins === d.turns ? d.turns : null, v => v), '💎', 'Perfectionist', v => 'Never missed, ' + v + ' turns'],
    [91, () => pick(d => d.hatTricks, v => v >= 1), '🎩', 'Hat trick', v => plural(v, 'hat trick', 'hat tricks') + ': three right in a row'],
    [90, () => pick(d => d.quick, v => v >= 1), '⚡', 'Quick ears', (v, d) => plural(v, 'title', 'titles') + ' on clips as short as ' + d.quickBest + 's'],
    [89, () => pick(d => d.tightestMonths != null ? d.tightestMonths / 12 : d.tightest, v => v != null, true), '🎯', 'Surgeon', (v, d) =>
      d.tightestMonths != null
        ? (d.tightestMonths === 0 ? 'Two cards, same month' : d.tightestMonths < 12 ? plural(d.tightestMonths, 'month', 'months') + ' apart' : plural(Math.round(v), 'year', 'years') + ' apart')
        : (v === 0 ? 'Two cards, same year' : plural(v, 'year', 'years') + ' apart')],
    [88, () => hadShort ? pick(d => d.shortWins === 0 && d.shortTurns >= 1 ? d.longWins : null, v => v >= 2) : null, '🕯️', 'Slow burn', (v, d) => v + ' hits, all on full clips (missed ' + plural(d.shortTurns, 'short one', 'short ones') + ')'],
    [87, () => pick(d => d.bestStreak, v => v >= 2), '🔥', 'Hot hand', v => v + ' in a row on own turns'],
    [86, () => pick(d => d.won && d.steals === 0 && d.sabotage === 0 && d.hostileOthers > 0 ? d.hostileOthers : null, v => v), '🕊️', 'Pacifist', () => 'Won without a steal or a sabotage'],
    [85, () => pick(d => d.lockWins, v => v >= 1), '🔒', 'Sharpshooter', v => plural(v, 'lock-in', 'lock-ins') + ' won'],
    [85, () => pick(d => d.won ? d.coins : null, v => v <= 1, true), '🪙', 'Pennies', v => 'Won with ' + plural(v, 'coin', 'coins')],
    [84, () => pick(d => d.steals, v => v >= 1), '🦝', 'Thief', v => plural(v, 'card', 'cards') + ' stolen'],
    [83, () => pick(d => d.sang, v => v >= 1), '🎤', 'Karaoke star', v => plural(v, 'song', 'songs') + ' sung'],
    [82, () => pick(d => d.sabotage, v => v >= 1), '💣', 'Saboteur', v => plural(v, 'sabotage', 'sabotages') + ' bought'],
    [78, () => pick(d => d.leap, v => v >= 10), '🚀', 'Time traveller', v => 'Biggest leap: ' + v + ' years'],
    [76, () => pick(d => d.turns >= 3 && d.turnWins === d.turns && d.turns < 6 ? d.turns : null, v => v), '🧼', 'Clean sheet', v => 'Not one miss in ' + v + ' turns'],
    [74, () => pick(d => d.bets, v => v > 0), '🎲', 'High roller', v => '+' + v + ' coins from bets'],
    [73, () => pick(d => d.bets, v => v < 0, true), '🎰', 'Gambler', v => v + ' coins lost on bets'],
    [72, () => pick(d => d.titles, v => v >= 2), '🎤', 'Name dropper', v => v + ' titles named'],
    [71, () => pick(d => d.decadeCount, (v, d) => v >= 4 && d.years.length >= 4), '🧭', 'Era hopper', v => v + ' different decades'],
    [70, () => pick(d => d.robinGave, v => v >= 1), '👑', 'Prince John', v => 'Gave away ' + plural(v, 'coin', 'coins')],
    [69, () => pick(d => d.avgYear, (v, d) => v < 1970 && d.years.length >= 3, true), '🎻', 'Old soul', v => 'Average card from ' + v],
    [68, () => pick(d => d.ouRight, (v, d) => v >= 1 && d.ou > 0), '🔮', 'Oracle', (v, d) => v + ' of ' + d.ou + ' over/unders'],
    [66, () => pick(d => d.missed, v => v >= 2), '🌧️', 'Unlucky', v => plural(v, 'miss', 'misses') + ' on own turns'],
    [65, () => pick(d => d.shopOn ? d.bought : null, v => v >= 2), '🛍️', 'Shopaholic', v => plural(v, 'item', 'items') + ' bought'],
    [62, () => pick(d => d.decadeShare, (v, d) => v >= 50 && d.years.length >= 4 && d.decade), '📼', null, (v, d) => v + '% of their cards'],
    [60, () => pick(d => d.spent, v => v >= 2), '💸', 'Big spender', v => v + ' coins spent in the shop'],
    [58, () => pick(d => d.coins, v => v >= 2), '🪙', 'Coin hoarder', v => v + ' gold coins']
  ];
  const out = [];
  defs.slice().sort((x, y) => y[0] - x[0]).forEach(([, find, ic, t, e]) => {
    const a = find();
    if(!a) return;
    tally(won, a.d.name);
    out.push({ ic, t: t === null ? 'The ' + a.d.decade + ' kid' : t, w: a.d.name, e: e(a.v, a.d) });
  });
  return out.slice(0, 6);
}

// One sentence for the night, as pieces so the years and numbers can be gold.
function nightSentence(n){
  const parts = [];
  const txt = t => parts.push({ t });
  const gold = t => parts.push({ t, gold: true });
  if(n.songs.length){
    txt(n.songs.length + (n.songs.length === 1 ? ' song' : ' songs'));
    if(n.min != null && n.min !== n.max){ txt(' from '); gold(String(n.min)); txt(' to '); gold(String(n.max)); }
    txt('. ');
    if(n.topDecade != null && n.years.length >= 3){ txt('The '); gold(decadeName(n.topDecade)); txt(' came up most. '); }
  }
  const clauses = [];
  const namer = n.per.slice().sort((a, b) => b.titles - a.titles)[0];
  const top = n.leader && n.leader.name;
  if(namer && namer.titles >= 2 && namer.name !== top) clauses.push([{ t: namer.name + ' named ' + namer.titles + ' titles' }]);
  const leap = n.per.slice().sort((a, b) => (b.leap || 0) - (a.leap || 0))[0];
  if(leap && leap.leap >= 10 && leap.name !== top && !(clauses.length && leap === namer)) clauses.push([{ t: leap.name + " made the night's biggest leap" }]);
  if(n.leader){
    const cards = n.leader.timeline.length;
    clauses.push(n.winner
      ? [{ t: n.winner.name + ' took it with ' }, { t: cards + (cards === 1 ? ' card' : ' cards'), gold: true }]
      : [{ t: n.leader.name + ' leads with ' }, { t: cards + (cards === 1 ? ' card' : ' cards'), gold: true }]);
  }
  clauses.forEach((c, i) => {
    if(i > 0) txt(i === clauses.length - 1 ? (clauses.length > 2 ? ', and ' : ' and ') : ', ');
    c.forEach(p => parts.push(p));
  });
  if(clauses.length) txt('.');
  return parts;
}

/* ── the Recap tab ─────────────────────────────────────────────────────── */

const RANK_TONES = [null, { hi: '#EEE9F1', base: '#C9C3CF' }, { hi: '#E3A878', base: '#C0814F' }];

function renderRecap(){
  const n = nightData();
  const box = document.getElementById('nightRecap');
  box.innerHTML = '';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(text != null) e.textContent = text;
    return e;
  };
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Hero: the winner (or whoever leads) on a gold record.
  const hero = el('div', 'nr-hero');
  const rec = el('div', 'nr-rec');
  rec.appendChild(el('div', 'nr-lab', n.leader ? '1st' : '—'));
  const ht = el('div', 'nr-hero-text');
  ht.appendChild(el('div', 'nr-k', "Vinyl'le · Night recap · " + date));
  ht.appendChild(el('h1', 'nr-title', n.leader ? n.leader.name + (n.winner ? ' wins' : ' leads') : 'The night is young'));
  const sub = el('div', 'nr-sub');
  const bits = [];
  if(n.winner) bits.push('First to <b>' + n.target + ' cards</b>');
  else if(n.leader) bits.push('Playing to <b>' + n.target + ' cards</b>');
  bits.push(players.length + (players.length === 1 ? ' player' : ' players'));
  bits.push(n.songs.length + (n.songs.length === 1 ? ' song' : ' songs'));
  sub.innerHTML = bits.join(' · ');
  ht.appendChild(sub);
  hero.append(rec, ht);
  box.appendChild(hero);

  // The night in one sentence.
  const story = el('p', 'nr-story');
  nightSentence(n).forEach(p => {
    if(p.gold){ story.appendChild(el('em', null, p.t)); }
    else story.appendChild(document.createTextNode(p.t));
  });
  if(story.textContent.trim()) box.appendChild(story);

  // Four big numbers.
  const tiles = el('div', 'nr-tiles');
  [[n.songs.length, 'Songs played'], [n.cardsPlaced, 'Cards placed'], [n.accuracy, 'Accuracy'], [n.coinsWon, 'Gold coins won', true]].forEach(([v, l, g]) => {
    const t = el('div', 'nr-tile');
    const b = el('b', g ? 'gold' : null, String(v));
    t.append(b, el('span', null, l));
    tiles.appendChild(t);
  });
  box.appendChild(tiles);

  // Awards.
  if(n.awards.length){
    box.appendChild(el('div', 'nr-h', 'Awards'));
    const grid = el('div', 'nr-awards');
    n.awards.forEach((a, i) => {
      const c = el('div', 'nr-award' + (i === 0 ? ' top' : ''));
      c.append(el('div', 'ic', a.ic), el('div', 't', a.t), el('div', 'w', a.w), el('div', 'e', a.e));
      grid.appendChild(c);
    });
    box.appendChild(grid);
  }

  // Tonight's songs on one line, oldest to newest.
  if(n.years.length){
    box.appendChild(el('div', 'nr-h', "Tonight's songs, oldest to newest"));
    const line = el('div', 'nr-line');
    const lo = n.min, hi = n.max === n.min ? n.min + 1 : n.max;
    const pos = y => ((y - lo) / (hi - lo) * 100);
    line.appendChild(el('div', 'axis'));
    if(n.topDecade != null && n.years.length >= 3){
      const a = Math.max(lo, n.topDecade), b = Math.min(hi, n.topDecade + 10);
      const band = el('div', 'dec');
      band.style.left = pos(a) + '%';
      band.style.width = Math.max(2, pos(b) - pos(a)) + '%';
      const dl = el('div', 'dl', 'most played · ' + decadeName(n.topDecade));
      dl.style.left = (pos(a) + pos(b)) / 2 + '%';
      line.append(band, dl);
    }
    n.years.forEach(y => {
      const d = el('div', 'd');
      d.style.left = pos(y) + '%';
      line.appendChild(d);
    });
    const marks = [lo, Math.round(lo + (n.max - lo) / 3), Math.round(lo + (n.max - lo) * 2 / 3), n.max];
    [...new Set(marks)].forEach(y => {
      const t = el('div', 'yl', String(y));
      t.style.left = pos(y) + '%';
      // The ends stay inside the line.
      if(y === lo) t.style.transform = 'none';
      else if(y === n.max) t.style.transform = 'translateX(-100%)';
      line.appendChild(t);
    });
    box.appendChild(line);
  }

  // Everyone, tap for their recap card.
  if(n.sorted.length){
    box.appendChild(el('div', 'nr-h', 'Players · tap for their recap card'));
    const grid = el('div', 'nr-players');
    n.sorted.forEach((p, i) => {
      const b = el('button', 'nr-player');
      b.type = 'button';
      const r = el('div', 'nr-rec small' + (i === 1 ? ' silver' : i === 2 ? ' bronze' : i > 2 ? ' plain' : ''));
      r.appendChild(el('div', 'nr-lab', String(i + 1)));
      const txt = el('div', 'nr-pt');
      txt.append(el('b', null, p.name), el('small', null, p.timeline.length + (p.timeline.length === 1 ? ' card' : ' cards') + ' · ' + bonusCount(p) + ' ●'));
      b.append(r, txt, el('span', 'go', '›'));
      b.addEventListener('click', () => openRecapCard(p));
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }

  // Modes & extras (only with chaos, the shop or over/under tonight).
  const extras = chaosRecapRows();
  const extrasBox = document.getElementById('recapExtrasBox');
  extrasBox.hidden = !extras.length;
  const ex = document.getElementById('recapExtras');
  ex.innerHTML = '';
  extras.forEach(([label, value]) => {
    const row = el('div', 'nr-extra');
    row.append(el('span', null, label), el('b', null, String(value)));
    ex.appendChild(row);
  });

  // Tonight's songs, newest first.
  document.getElementById('recapSongCount').textContent = n.songs.length;
  const songList = document.getElementById('recapSongList');
  songList.innerHTML = '';
  if(!n.songs.length){
    songList.innerHTML = '<p class="empty">Nothing revealed yet this session.</p>';
  }else{
    n.songs.slice().reverse().forEach(entry => {
      const row = document.createElement('div');
      row.className = 'history-entry';
      row.innerHTML = '<span class="history-year">' + formatHistoryYear(entry) + '</span><span class="history-title">' +
        (entry.title ? escapeHtml(entry.title) + (entry.artist ? ' — ' + escapeHtml(entry.artist) : '') : 'Unknown track') + '</span>';
      songList.appendChild(row);
    });
  }
}

/* ── pictures ──────────────────────────────────────────────────────────── */

const PIC_W = 1080;

async function picFonts(){
  if(!document.fonts) return;
  try{
    await Promise.all([
      document.fonts.load('700 100px Fraunces'), document.fonts.load('600 100px Fraunces'),
      document.fonts.load('500 30px "IBM Plex Mono"'), document.fonts.load('400 30px "IBM Plex Mono"'),
      document.fonts.load('500 30px "Work Sans"')
    ]);
  }catch(e){ /* system fonts then */ }
}

function picCanvas(H){
  const canvas = document.createElement('canvas');
  canvas.width = PIC_W;
  canvas.height = H;
  return canvas;
}

// Plum, a gold glow at (gx, gy) and a violet one from the bottom-left.
function picBackground(ctx, H, gx, gy, gr){
  const { C } = recapDraw;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, PIC_W, H);
  let g = ctx.createRadialGradient(gx, gy, 40, gx, gy, gr);
  g.addColorStop(0, 'rgba(212,162,78,.30)');
  g.addColorStop(1, 'rgba(212,162,78,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PIC_W, H);
  g = ctx.createRadialGradient(0, H, 40, 0, H, 900);
  g.addColorStop(0, 'rgba(126,64,150,.35)');
  g.addColorStop(1, 'rgba(126,64,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PIC_W, H);
}

function picHeader(ctx, y){
  const { C, MONO, spaced } = recapDraw;
  ctx.fillStyle = C.gold;
  ctx.font = '500 30px ' + MONO;
  spaced(ctx, "VINYL'LE", 80, y, 8);
  ctx.fillStyle = C.muted;
  ctx.font = '400 24px ' + MONO;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  spaced(ctx, date, PIC_W - 80, y, 3, 'right');
}

function picFooter(ctx, y, target){
  const { C, MONO, spaced } = recapDraw;
  ctx.fillStyle = C.gold;
  ctx.font = '500 22px ' + MONO;
  spaced(ctx, 'THE MUSIC TIMELINE GAME', 80, y, 4);
  ctx.fillStyle = C.muted;
  ctx.font = '400 22px ' + MONO;
  ctx.textAlign = 'right';
  ctx.fillText('first to ' + target, PIC_W - 80, y);
  ctx.textAlign = 'left';
}

// A name at `size`, shrunk to `min` if needed, then cut with two faint dots.
function picName(ctx, name, x, y, size, min, maxW, align){
  const { C, SERIF, fit, clip } = recapDraw;
  const s = fit(ctx, name, '700', SERIF, size, maxW, min);
  const font = '700 ' + s + 'px ' + SERIF;
  const dots = '700 ' + Math.round(s * .47) + 'px ' + SERIF;
  ctx.font = dots;
  const dw = ctx.measureText('..').width + 4;
  ctx.font = font;
  const shown = clip(ctx, name, maxW, dw);
  const w = ctx.measureText(shown).width + (shown !== name ? dw : 0);
  const left = align === 'center' ? x - w / 2 : x;
  ctx.textAlign = 'left';
  ctx.fillText(shown, left, y);
  if(shown !== name){
    const fill = ctx.fillStyle;
    ctx.font = dots;
    ctx.fillStyle = 'rgba(243,236,221,.4)';
    ctx.fillText('..', left + ctx.measureText(shown).width + 4, y);
    ctx.fillStyle = fill;
    ctx.font = font;
  }
}

// A pill with text in it. Returns its width.
function picPill(ctx, x, cy, text, gold, align){
  const { C, MONO, roundRect } = recapDraw;
  ctx.font = '400 24px ' + MONO;
  const w = ctx.measureText(text).width + 34;
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  roundRect(ctx, left, cy - 22, w, 44, 22);
  ctx.lineWidth = 2;
  ctx.strokeStyle = gold ? '#8C6F3B' : '#3C2C42';
  ctx.stroke();
  ctx.fillStyle = gold ? C.gold : C.paper;
  ctx.textAlign = 'center';
  ctx.fillText(text, left + w / 2, cy + 8);
  ctx.textAlign = 'left';
  return w;
}

const pillCards = n => n + (n === 1 ? ' card' : ' cards');
const pillCoins = n => n + ' ●';

// A player's timeline as a line of little records with years under them.
function picTimeline(ctx, label, entries, y){
  const { C, MONO, spaced } = recapDraw;
  ctx.fillStyle = C.gold;
  ctx.font = '500 24px ' + MONO;
  spaced(ctx, label.toUpperCase(), 80, y, 4);
  let years = entries.map(e => e.year).filter(v => !isNaN(v)).sort((a, b) => a - b);
  const MAX = 12;
  if(years.length > MAX) years = Array.from({ length: MAX }, (_, i) => years[Math.round(i * (years.length - 1) / (MAX - 1))]);
  const ay = y + 60;
  ctx.strokeStyle = 'rgba(212,162,78,.4)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(80, ay); ctx.lineTo(PIC_W - 80, ay); ctx.stroke();
  if(!years.length){
    ctx.fillStyle = C.muted;
    ctx.font = '400 22px ' + MONO;
    ctx.fillText('No cards yet', 80, ay + 50);
    return;
  }
  const step = years.length > 1 ? (PIC_W - 220) / (years.length - 1) : 0;
  years.forEach((yr, i) => {
    const cx = years.length > 1 ? 110 + i * step : PIC_W / 2;
    ctx.beginPath(); ctx.arc(cx, ay, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#0D0910'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, ay, 7, 0, Math.PI * 2);
    ctx.fillStyle = C.gold; ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.font = '400 22px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText(String(yr), cx, ay + 50);
    ctx.textAlign = 'left';
  });
}

/* The leaderboard picture: three records as the podium, everyone else as
   rows with a bar toward the target, the winner's timeline along the bottom.
   'post' is 4:5 (three rows, then "+ N more"); 'story' is 9:16 and has room
   for everyone. */
async function drawLeaderboardPicture(format){
  await picFonts();
  const { C, SERIF, MONO, drawRecord } = recapDraw;
  const story = format === 'story';
  const H = story ? 1920 : 1350;
  const oy = story ? 190 : 0;
  const footY = story ? H - 250 : H - 50;
  const stripY = footY - 180;
  const canvas = picCanvas(H);
  const ctx = canvas.getContext('2d');
  const sorted = players.slice().sort(comparePlayers);
  const rest = sorted.slice(3);
  // A short table on a tall story: a bigger podium fills the space.
  const s = story && rest.length <= 2 ? 1.2 : 1;

  picBackground(ctx, H, PIC_W / 2, 330 + oy, 760);
  picHeader(ctx, 110 + oy);

  if(!sorted.length){
    ctx.fillStyle = C.muted;
    ctx.font = '600 44px ' + SERIF;
    ctx.textAlign = 'center';
    ctx.fillText('No players this time.', PIC_W / 2, H / 2);
    ctx.textAlign = 'left';
    picFooter(ctx, footY, WIN_LENGTH);
    return canvas;
  }

  // Podium: 1st in the middle and biggest, record bottoms on one line. On a
  // story the podium and rows sit in the middle of the space they have.
  const shownRows = story ? rest.length : (rest.length > 4 ? 4 : rest.length);
  const blockH = 470 * s + (shownRows ? 40 + shownRows * (story ? 96 : 78) : 0);
  const regionTop = 170 + oy, regionBottom = stripY - 60;
  const base = Math.max(175 + oy + 300 * s, regionTop + (regionBottom - regionTop - blockH) / 2 + 300 * s);
  // Side records a little closer in on a scaled-up podium, and two players
  // sit in the middle instead of leaving 3rd's gap.
  const gapX = 315 * Math.min(s, 1.05);
  const shift = sorted.length === 2 ? gapX / 2 : 0;
  const spots = [
    { i: 1, cx: PIC_W / 2 - gapX + shift, r: 110 * s, size: 54, maxW: 250 },
    { i: 0, cx: PIC_W / 2 + shift, r: 150 * s, size: 72, maxW: 320 },
    { i: 2, cx: PIC_W / 2 + gapX, r: 95 * s, size: 54, maxW: 250 }
  ];
  spots.forEach(sp => {
    const p = sorted[sp.i];
    if(!p) return;
    drawRecord(ctx, sp.cx, base - sp.r, sp.r, ['1st', '2nd', '3rd'][sp.i], RANK_TONES[sp.i]);
    ctx.fillStyle = C.paper;
    picName(ctx, p.name, sp.cx, base + 82 * s, Math.round(sp.size * s), 36, sp.maxW, 'center');
    ctx.font = '400 24px ' + MONO;
    const w1 = ctx.measureText(pillCards(p.timeline.length)).width + 34;
    const w2 = ctx.measureText(pillCoins(bonusCount(p))).width + 34;
    const left = sp.cx - (w1 + 10 + w2) / 2;
    picPill(ctx, left, base + 132 * s, pillCards(p.timeline.length), false);
    picPill(ctx, left + w1 + 10, base + 132 * s, pillCoins(bonusCount(p)), true);
  });

  // Everyone else.
  const target = gameWinner ? gameWinner.target : WIN_LENGTH;
  const top = base + 200 * s;
  const shown = story ? rest : (rest.length > 4 ? rest.slice(0, 3) : rest);
  const more = rest.length - shown.length;
  const rowH = story ? Math.min(96, (stripY - 70 - top) / Math.max(1, shown.length)) : 78;
  if(shown.length){
    ctx.strokeStyle = '#3C2C42';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(80, top); ctx.lineTo(PIC_W - 80, top); ctx.stroke();
  }
  shown.forEach((p, k) => {
    const y0 = top + k * rowH;
    const cy = y0 + rowH / 2;
    ctx.fillStyle = C.muted;
    ctx.font = '400 28px ' + MONO;
    ctx.fillText(String(k + 4).padStart(2, '0'), 80, cy + 10);
    ctx.fillStyle = C.paper;
    picName(ctx, p.name, 150, cy + 14, 42, 30, 260);
    const w2 = picPill(ctx, PIC_W - 80, cy, pillCoins(bonusCount(p)), true, 'right');
    ctx.font = '400 24px ' + MONO;
    const w1 = picPill(ctx, PIC_W - 80 - w2 - 10, cy, pillCards(p.timeline.length), false, 'right');
    const bx = 440, bw = PIC_W - 80 - w2 - 10 - w1 - 30 - bx;
    if(bw > 40){
      recapDraw.roundRect(ctx, bx, cy - 6, bw, 12, 6);
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
      const f = Math.min(1, p.timeline.length / target);
      if(f > 0){
        recapDraw.roundRect(ctx, bx, cy - 6, Math.max(12, bw * f), 12, 6);
        ctx.fillStyle = '#8C6F3B'; ctx.fill();
      }
    }
    ctx.strokeStyle = '#3C2C42';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(80, y0 + rowH); ctx.lineTo(PIC_W - 80, y0 + rowH); ctx.stroke();
  });
  if(more > 0){
    const y0 = top + shown.length * rowH;
    ctx.fillStyle = C.muted;
    ctx.font = '400 24px ' + MONO;
    recapDraw.spaced(ctx, '+ ' + more + ' MORE', PIC_W / 2, y0 + 48, 3, 'center');
  }

  // The winner's (or leader's) timeline along the bottom.
  const leader = (gameWinner && sorted.find(p => p.name === gameWinner.name)) || sorted[0];
  const won = !!gameWinner && gameWinner.name === leader.name;
  picTimeline(ctx, leader.name + (won ? "'s winning timeline" : "'s timeline"), leader.timeline, stripY);
  picFooter(ctx, footY, target);
  return canvas;
}

// Words that wrap within maxW, each keeping its colour.
function picParagraph(ctx, parts, x, y, maxW, lineH, maxLines){
  const { C } = recapDraw;
  const words = [];
  parts.forEach(p => p.t.split(/(\s+)/).forEach(w => { if(w) words.push({ t: w, gold: p.gold }); }));
  const lines = [[]];
  let lw = 0;
  words.forEach(w => {
    const ww = ctx.measureText(w.t).width;
    if(/^\s+$/.test(w.t)){
      if(lines[lines.length - 1].length){ lines[lines.length - 1].push(w); lw += ww; }
      return;
    }
    if(lw + ww > maxW && lines[lines.length - 1].length){
      const last = lines[lines.length - 1];
      while(last.length && /^\s+$/.test(last[last.length - 1].t)) last.pop();
      lines.push([]);
      lw = 0;
    }
    lines[lines.length - 1].push(w);
    lw += ww;
  });
  lines.slice(0, maxLines).forEach((line, i) => {
    let cx = x;
    line.forEach(w => {
      ctx.fillStyle = w.gold ? C.gold : C.paper;
      ctx.fillText(w.t, cx, y + i * lineH);
      cx += ctx.measureText(w.t).width;
    });
  });
  return Math.min(lines.length, maxLines);
}

// The Recap tab as a picture: hero, sentence, numbers, awards, the night's line.
async function drawNightRecapPicture(){
  await picFonts();
  const { C, SERIF, MONO, spaced, roundRect, fit, drawRecord } = recapDraw;
  const n = nightData();
  const H = 1350;
  const canvas = picCanvas(H);
  const ctx = canvas.getContext('2d');
  picBackground(ctx, H, PIC_W * .82, 140, 760);
  picHeader(ctx, 110);

  // Hero.
  drawRecord(ctx, 200, 315, 120, n.leader ? '1st' : '—');
  ctx.fillStyle = C.paper;
  const title = n.leader ? n.leader.name + (n.winner ? ' wins' : ' leads') : 'The night is young';
  picName(ctx, title, 360, 322, 96, 54, PIC_W - 80 - 360);
  ctx.fillStyle = C.muted;
  ctx.font = '400 26px ' + MONO;
  const subBits = [];
  if(n.leader) subBits.push((n.winner ? 'First to ' : 'Playing to ') + n.target + ' cards');
  subBits.push(players.length + (players.length === 1 ? ' player' : ' players'));
  subBits.push(n.songs.length + (n.songs.length === 1 ? ' song' : ' songs'));
  ctx.fillText(subBits.join(' · '), 364, 380);
  ctx.strokeStyle = '#3C2C42';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(80, 450); ctx.lineTo(PIC_W - 80, 450); ctx.stroke();

  // The sentence.
  ctx.font = '600 36px ' + SERIF;
  const lines = picParagraph(ctx, nightSentence(n), 80, 515, PIC_W - 160, 50, 3);
  let y = 515 + lines * 50 + 10;

  // Four numbers.
  const gap = 16, tw = (PIC_W - 160 - gap * 3) / 4, th = 120;
  [[n.songs.length, 'SONGS PLAYED'], [n.cardsPlaced, 'CARDS PLACED'], [n.accuracy, 'ACCURACY'], [n.coinsWon, 'GOLD COINS WON', true]].forEach(([v, l, g], i) => {
    const x = 80 + i * (tw + gap);
    roundRect(ctx, x, y, tw, th, 20);
    ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.fill();
    ctx.strokeStyle = 'rgba(212,162,78,.28)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = g ? C.gold : C.paper;
    const vs = fit(ctx, String(v), '700', SERIF, 60, tw - 40, 30);
    ctx.font = '700 ' + vs + 'px ' + SERIF;
    ctx.fillText(String(v), x + 22, y + 66);
    ctx.fillStyle = C.muted;
    ctx.font = '500 16px ' + MONO;
    spaced(ctx, l, x + 24, y + 100, 2.5);
  });
  y += th + 28;

  // Awards: up to six, three across.
  const awards = n.awards.slice(0, 6);
  if(awards.length){
    const aw = (PIC_W - 160 - 2 * 16) / 3, ah = 132;
    awards.forEach((a, i) => {
      const x = 80 + (i % 3) * (aw + 16);
      const ay = y + Math.floor(i / 3) * (ah + 14);
      roundRect(ctx, x, ay, aw, ah, 20);
      ctx.fillStyle = i === 0 ? 'rgba(212,162,78,.12)' : '#251A2B'; ctx.fill();
      ctx.strokeStyle = i === 0 ? '#8C6F3B' : '#3C2C42'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '28px ' + SERIF;
      ctx.fillText(a.ic, x + 20, ay + 44);
      ctx.fillStyle = C.gold;
      ctx.font = '500 16px ' + MONO;
      spaced(ctx, a.t.toUpperCase(), x + 62, ay + 40, 2);
      ctx.fillStyle = C.paper;
      picName(ctx, a.w, x + 20, ay + 86, 38, 28, aw - 40);
      ctx.fillStyle = C.muted;
      ctx.font = '400 20px "Work Sans", sans-serif';
      ctx.fillText(recapDraw.clip(ctx, a.e, aw - 40, 0), x + 20, ay + 116);
    });
    y += Math.ceil(awards.length / 3) * (ah + 14);
  }

  // Tonight's songs on a line, the most played decade marked.
  const ay = Math.max(y + 40, H - 150);
  if(n.years.length && ay < H - 100){
    const lo = n.min, hi = n.max === n.min ? n.min + 1 : n.max;
    const px = v => 80 + (v - lo) / (hi - lo) * (PIC_W - 160);
    if(n.topDecade != null && n.years.length >= 3){
      const a = px(Math.max(lo, n.topDecade)), b = px(Math.min(hi, n.topDecade + 10));
      roundRect(ctx, a, ay - 22, Math.max(12, b - a), 44, 12);
      ctx.fillStyle = 'rgba(212,162,78,.12)'; ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.font = '500 16px ' + MONO;
      spaced(ctx, 'MOST PLAYED · ' + decadeName(n.topDecade).toUpperCase(), (a + b) / 2, ay - 34, 2, 'center');
    }
    ctx.strokeStyle = 'rgba(212,162,78,.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(80, ay); ctx.lineTo(PIC_W - 80, ay); ctx.stroke();
    n.years.forEach(v => {
      ctx.beginPath(); ctx.arc(px(v), ay, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#0D0910'; ctx.fill();
      ctx.beginPath(); ctx.arc(px(v), ay, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = C.gold; ctx.fill();
    });
    ctx.fillStyle = C.muted;
    ctx.font = '400 20px ' + MONO;
    ctx.fillText(String(n.min), 80, ay + 40);
    ctx.textAlign = 'right';
    ctx.fillText(String(n.max), PIC_W - 80, ay + 40);
    ctx.textAlign = 'left';
  }
  picFooter(ctx, H - 50, n.target);
  return canvas;
}

function downloadCanvas(canvas, file){
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.download = file;
    a.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
    a.click();
    if(blob) setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

document.getElementById('savePodiumBtn').addEventListener('click', async () => {
  downloadCanvas(await drawLeaderboardPicture('post'), 'vinylle-leaderboard.png');
});
document.getElementById('savePodiumStoryBtn').addEventListener('click', async () => {
  downloadCanvas(await drawLeaderboardPicture('story'), 'vinylle-leaderboard-story.png');
});
document.getElementById('saveRecapBtn').addEventListener('click', async () => {
  downloadCanvas(await drawNightRecapPicture(), 'vinylle-night-recap.png');
});
