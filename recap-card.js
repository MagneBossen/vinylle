/* Vinyl'le — a player's recap card, drawn on a canvas so it saves as a crisp
   picture: 1080×1350 for a post (4:5) or 1080×1920 for a story (9:16).
   Shared by the DJ page and the phones: both pass the same data the DJ computes.

   drawRecapCard(data, lang, format) → Promise<HTMLCanvasElement>
   format: 'post' (default) or 'story'
   data: { name, rank, of, cards, coins, winLength, won, streak, bestStreak,
           titles, ouRight, ou, lockWins, spent, bets, decade, years, date,
           hatTricks, comeback, missed, avgYear, decadeCount, bought, shopOn,
           shortTurns, shortWins, longWins, hostileOthers } */

(function(){
  const W = 1080;
  // Per format: canvas height, how far the whole layout drops (a story keeps
  // clear of Instagram's top and bottom bars), the stat grid, and where the
  // timeline and footer sit.
  const FORMATS = {
    post:  { H: 1350, oy: 0,   cols: 3, tileH: 170, tilesTop: 760, line: 1195, lineTwo: 1150, foot: 50 },
    story: { H: 1920, oy: 190, cols: 2, tileH: 160, tilesTop: 950, line: 1575, lineTwo: 1540, foot: 250 }
  };
  const C = {
    bg: '#1B1420', surface: 'rgba(255,255,255,.045)', line: 'rgba(212,162,78,.28)',
    gold: '#D4A24E', goldHi: '#F0C877', paper: '#F3EADD', muted: '#9C8FA3', ink: '#241A0B'
  };
  const SERIF = "'Fraunces', serif";
  const MONO = "'IBM Plex Mono', monospace";

  // English or Danish, per drawing (the phone passes its own language).
  let LANG = 'en';
  const L = (en, da) => LANG === 'da' ? da : en;
  // "'80s" (from the DJ) → "80’erne" in Danish.
  const decadeText = dec => LANG === 'da' ? String(dec).replace(/^'/, '').replace(/s$/, '’erne') : dec;
  const yrs = n => n + L('y', ' år');

  // The site's address for the bottom of a story card. Taken from the page's
  // own address, except on the temporary host (and local testing), which
  // show the real name instead.
  function siteLabel(){
    const host = (location.hostname || '').replace(/^www\./, '');
    const temporary = !host || /\.onrender\.com$/.test(host) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || /\.local$/.test(host);
    return temporary ? 'vinylle.com' : host;
  }

  function ordinal(n){
    if(LANG === 'da') return n + '.';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // Largest size (down to `min`) at which `text` fits in `maxW`.
  function fit(ctx, text, weight, family, size, maxW, min){
    for(; size > min; size -= 2){
      ctx.font = weight + ' ' + size + 'px ' + family;
      if(ctx.measureText(text).width <= maxW) break;
    }
    return size;
  }

  // Cut text to fit maxW, leaving tailW free for whatever marks the cut.
  function clip(ctx, text, maxW, tailW){
    if(ctx.measureText(text).width <= maxW) return text;
    const chars = Array.from(text);
    while(chars.length > 1 && ctx.measureText(chars.join('')).width > maxW - tailW) chars.pop();
    return chars.join('').trimEnd();
  }

  // Letter-spaced caps, drawn by hand (canvas letterSpacing isn't everywhere).
  function spaced(ctx, text, x, y, spacing, align){
    const chars = text.split('');
    const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width + spacing, -spacing);
    let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach(ch => { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; });
    ctx.textAlign = prev;
    return width;
  }

  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // `tone`: label colours, gold by default ({ hi, base } for silver/bronze).
  function drawRecord(ctx, cx, cy, r, label, tone){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 60;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0D0910';
    ctx.fill();
    ctx.restore();
    // Grooves, with a soft sheen across them.
    ctx.lineWidth = 1.2;
    for(let g = r - 12; g > r * .36; g -= 7){
      ctx.beginPath();
      ctx.arc(cx, cy, g, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,' + (g % 21 < 7 ? .07 : .035) + ')';
      ctx.stroke();
    }
    const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(.45, 'rgba(255,255,255,.07)');
    sheen.addColorStop(.55, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = sheen;
    ctx.fill();
    // The gold label.
    const lr = r * .34;
    const lg = ctx.createRadialGradient(cx - lr * .3, cy - lr * .3, lr * .1, cx, cy, lr);
    lg.addColorStop(0, (tone && tone.hi) || C.goldHi);
    lg.addColorStop(1, (tone && tone.base) || C.gold);
    ctx.beginPath();
    ctx.arc(cx, cy, lr, 0, Math.PI * 2);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(lr * .62) + 'px ' + SERIF;
    ctx.fillText(label, cx, cy - lr * .12);
    ctx.font = '500 ' + Math.round(lr * .16) + 'px ' + MONO;
    spaced(ctx, L('PLACE', 'PLADS'), cx, cy + lr * .45, 3, 'center');
    ctx.beginPath();
    ctx.arc(cx, cy + lr * .72, 5, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.textBaseline = 'alphabetic';
  }

  // The six tiles. Every stat this player has scores points: rare, bragging
  // ones score highest, everyday ones (oldest card, years covered) are there
  // to fill up. The six best make the card, in score order.
  function tiles(d){
    const out = [];
    const add = (score, value, label) => out.push({ score, value, label });
    const plural = (n, one, many) => n === 1 ? one : many;
    const years = d.years || [];
    const pct = d.turns ? Math.round(d.turnWins / d.turns * 100) : 0;

    if(d.bestStreak >= 3) add(95, '🔥' + d.bestStreak, L('Best streak', 'Bedste stime'));
    if(d.ou >= 2 && d.ouRight === d.ou) add(92, d.ouRight + '/' + d.ou, L('Perfect over/under', 'Perfekt over/under'));
    if(d.comeback) add(97, '🪃', L('Comeback kid', 'Comeback-kid'));
    if(d.turns >= 6 && pct === 100) add(94, '💎', L('Perfectionist', 'Perfektionist'));
    else if(d.turns >= 3 && pct === 100) add(89, '100%', L('Clean sheet', 'Rent bord'));
    if(d.hatTricks) add(91, '🎩' + d.hatTricks, L(plural(d.hatTricks, 'Hat trick', 'Hat tricks'), plural(d.hatTricks, 'Hat trick', 'Hat tricks')));
    if(d.shortWins === 0 && d.shortTurns >= 1 && d.longWins >= 2) add(88, '🕯️' + d.longWins, L('Slow burn', 'Langsom start'));
    if(d.won && d.steals === 0 && d.sabotage === 0 && d.hostileOthers > 0) add(86, '🕊️', L('Pacifist win', 'Fredelig sejr'));
    if(d.won && d.coins <= 1) add(85, d.coins, L('Won on pennies', 'Vandt på småmønter'));
    if(d.steals) add(88, d.steals, L(plural(d.steals, 'Card stolen', 'Cards stolen'), 'Kort stjålet'));
    // Tightest squeeze in months when months were in play, else in years.
    const tm = d.tightestMonths;
    if(tm === 0) add(88, L('Same month', 'Samme måned'), L('Tightest squeeze', 'Tætteste par'));
    else if(tm > 0 && tm < 12) add(86, tm + (tm === 1 ? L(' month', ' måned') : L(' months', ' måneder')), L('Tightest squeeze', 'Tætteste par'));
    else if(tm >= 12) add(52, yrs(Math.floor(tm / 12)) + (tm % 12 ? ' ' + (tm % 12) + 'm' : ''), L('Tightest squeeze', 'Tætteste par'));
    else if(d.tightest === 0) add(86, L('Same year', 'Samme år'), L('Tightest squeeze', 'Tætteste par'));
    if(d.sabotage) add(84, d.sabotage, L(plural(d.sabotage, 'Sabotage', 'Sabotages'), plural(d.sabotage, 'Sabotage', 'Sabotager')));
    if(d.quick) add(90, '⚡' + d.quick, L(plural(d.quick, 'Quick-ears title', 'Quick-ears titles'), plural(d.quick, 'Lynhurtig titel', 'Lynhurtige titler')) + ' · ' + d.quickBest + 's');
    if(d.sang) add(82, '🎤' + d.sang, L(plural(d.sang, 'Song sung', 'Songs sung'), plural(d.sang, 'Sang sunget', 'Sange sunget')));
    if(d.donWins) add(80, d.donWins, L('Double or nothing wins', 'Dobbelt eller intet vundet'));
    if(d.lockWins) add(78, d.lockWins, L(plural(d.lockWins, 'Lock-in won', 'Lock-ins won'), 'Låse vundet'));
    if(d.robinGot) add(76, '+' + d.robinGot, L('Robin Hood gifts', 'Robin Hood-gaver'));
    if(d.robinGave) add(75, '−' + d.robinGave, L('Prince John', 'Prins John'));
    if(d.bets < 0) add(73, d.bets, L('Betting losses', 'Tab på væddemål'));
    if(d.decadeCount >= 4 && years.length >= 4) add(71, d.decadeCount, L('Decades covered', 'Årtier dækket'));
    if(d.avgYear != null && d.avgYear < 1970 && years.length >= 3) add(69, d.avgYear, L('Old soul · avg year', 'Gammel sjæl · snitår'));
    if(d.missed >= 2) add(66, d.missed, L('Unlucky · misses', 'Uheldig · forbier'));
    if(d.shopOn && d.bought >= 2) add(65, d.bought, L('Shop purchases', 'Køb i butikken'));
    if(d.bets > 0) add(74, '+' + d.bets, L('Betting profit', 'Gevinst på væddemål'));
    if(d.titles >= 3) add(72, d.titles, L('Titles named', 'Titler nævnt'));
    if(d.turns >= 3 && pct < 100) add(70, pct + '%', L('Own-turn hits', 'Rigtige på egen tur'));
    if(d.decadeShare >= 50 && years.length >= 4) add(68, d.decadeShare + '%', decadeText(d.decade) + L(' specialist', '-specialist'));
    if(d.leap >= 20) add(66, yrs(d.leap), L('Biggest leap', 'Største spring'));
    if(d.ou && d.ouRight < d.ou) add(64, d.ouRight + '/' + d.ou, 'Over/under');
    if(d.bestStreak === 2) add(60, '🔥2', L('Best streak', 'Bedste stime'));
    if(d.titles && d.titles < 3) add(58, d.titles, L(plural(d.titles, 'Title named', 'Titles named'), plural(d.titles, 'Titel nævnt', 'Titler nævnt')));
    if(d.decade) add(55, decadeText(d.decade), L('Favourite decade', 'Yndlingsårti'));
    if(tm == null && d.tightest > 0) add(52, yrs(d.tightest), L('Tightest squeeze', 'Tætteste par'));
    if(d.spent) add(50, d.spent, L('Coins spent', 'Mønter brugt'));
    if(years.length){
      add(45, years[0], L('Oldest card', 'Ældste kort'));
      add(44, years[years.length - 1], L('Newest card', 'Nyeste kort'));
    }
    if(years.length > 1) add(40, yrs(years[years.length - 1] - years[0]), L('Years covered', 'År dækket'));
    if(d.leap > 0 && d.leap < 20) add(38, yrs(d.leap), L('Biggest leap', 'Største spring'));
    if(d.turns) add(36, d.turns, L(plural(d.turns, 'Turn played', 'Turns played'), plural(d.turns, 'Tur spillet', 'Ture spillet')));

    const picked = out.sort((a, b) => b.score - a.score).slice(0, 6).map(t => [t.value, t.label]);
    while(picked.length < 6) picked.push(['—', picked.length % 2 ? L('Keep playing', 'Spil videre') : L('More to come', 'Mere på vej')]);
    return picked;
  }

  async function drawRecapCard(d, lang, format){
    LANG = lang === 'da' ? 'da' : 'en';
    const F = FORMATS[format] || FORMATS.post;
    const H = F.H, oy = F.oy;
    if(document.fonts){
      try{
        await Promise.all([
          document.fonts.load('700 100px Fraunces'),
          document.fonts.load('600 100px Fraunces'),
          document.fonts.load('500 30px "IBM Plex Mono"'),
          document.fonts.load('400 30px "IBM Plex Mono"')
        ]);
      }catch(e){ /* fall back to system fonts */ }
    }
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background: plum, a gold glow from the top, a violet one from below.
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W * .78, 120 + oy, 40, W * .78, 120 + oy, 900 + oy);
    g.addColorStop(0, 'rgba(212,162,78,.34)');
    g.addColorStop(1, 'rgba(212,162,78,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(0, H, 40, 0, H, 900);
    g.addColorStop(0, 'rgba(126,64,150,.35)');
    g.addColorStop(1, 'rgba(126,64,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // The record, bleeding off the top-right corner, with the rank on its label.
    drawRecord(ctx, W - 150, 250 + oy, 330, ordinal(d.rank || 1));

    // Masthead.
    ctx.fillStyle = C.gold;
    ctx.font = '500 30px ' + MONO;
    spaced(ctx, "VINYL'LE", 80, 110 + oy, 8);
    ctx.fillStyle = C.muted;
    ctx.font = '400 24px ' + MONO;
    const date = new Date(d.date || Date.now());
    spaced(ctx, (L('Night recap · ', 'Aftenens recap · ') + date.toLocaleDateString(L('en-GB', 'da-DK'), { day: 'numeric', month: 'short', year: 'numeric' })).toUpperCase(), 80, 152 + oy, 3);

    // Name, big.
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'left';
    // 150px when the name fits before the record, otherwise 120px; anything still
    // too long is cut and ends in two small, faint dots.
    const name = d.name || '', nameMax = 500;
    ctx.font = '700 150px ' + SERIF;
    const nameSize = ctx.measureText(name).width <= nameMax ? 150 : 120;
    const nameFont = '700 ' + nameSize + 'px ' + SERIF, dotsFont = '700 ' + Math.round(nameSize * .47) + 'px ' + SERIF;
    ctx.font = dotsFont;
    const dotsW = ctx.measureText('..').width + 6;
    ctx.font = nameFont;
    const shown = clip(ctx, name, nameMax, dotsW);
    ctx.fillText(shown, 76, 330 + oy);
    if(shown !== name){
      const w = ctx.measureText(shown).width;
      ctx.font = dotsFont;
      ctx.fillStyle = 'rgba(243,236,221,.4)';
      ctx.fillText('..', 76 + w + 6, 330 + oy);
    }

    // Rank line, plus a WINNER pill.
    ctx.font = '500 34px ' + MONO;
    ctx.fillStyle = C.gold;
    let x = 80 + spaced(ctx, (ordinal(d.rank || 1) + L(' of ', ' af ') + (d.of || 1)).toUpperCase(), 80, 400 + oy, 4) + 26;
    if(d.won){
      ctx.font = '500 26px ' + MONO;
      const pw = ctx.measureText(L('WINNER', 'VINDER')).width + 60;
      roundRect(ctx, x, 368 + oy, pw, 46, 23);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.fillStyle = C.ink;
      spaced(ctx, L('WINNER', 'VINDER'), x + 26, 400 + oy, 3);
    }else if(d.leads){
      ctx.font = '500 26px ' + MONO;
      const pw = ctx.measureText(L('MOST CARDS', 'FLEST KORT')).width + 60;
      roundRect(ctx, x, 368 + oy, pw, 46, 23);
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = C.gold;
      spaced(ctx, L('MOST CARDS', 'FLEST KORT'), x + 26, 400 + oy, 3);
    }else if(d.streak >= 2){
      ctx.fillStyle = C.muted;
      ctx.font = '400 30px ' + MONO;
      ctx.fillText(L('· on a 🔥' + d.streak + ' streak', '· på en 🔥' + d.streak + '-stime'), x - 10, 400 + oy);
    }

    // Hero numbers: cards and gold coins.
    const hero = (value, label, hx, color) => {
      ctx.fillStyle = color;
      ctx.font = '700 190px ' + SERIF;
      ctx.fillText(String(value), hx, 640 + oy);
      const w = ctx.measureText(String(value)).width;
      ctx.fillStyle = C.muted;
      ctx.font = '500 26px ' + MONO;
      spaced(ctx, label, hx + 6, 690 + oy, 4);
      return w;
    };
    const cardsW = hero(d.cards || 0, L(d.cards === 1 ? 'CARD' : 'CARDS', 'KORT'), 80, C.paper);
    hero(d.coins || 0, d.coins === 1 ? L('GOLD COIN', 'GULDMØNT') : L('GOLD COINS', 'GULDMØNTER'), 520, C.gold);
    // A little progress ring toward the target, right after the card count.
    const target = d.winLength || 10;
    const pct = Math.min(1, (d.cards || 0) / target);
    const rx = Math.min(80 + cardsW + 70, 450);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.arc(rx, 580 + oy, 44, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.gold;
    ctx.lineCap = 'round';
    if(pct > 0){ ctx.beginPath(); ctx.arc(rx, 580 + oy, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke(); }
    ctx.lineCap = 'butt';
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.font = '500 22px ' + MONO;
    ctx.fillText('/' + target, rx, 588 + oy);
    ctx.textAlign = 'left';

    // Six stat tiles: three across on a post, two across on a story.
    const gap = 20, th = F.tileH, top = F.tilesTop;
    const tw = (W - 160 - gap * (F.cols - 1)) / F.cols;
    tiles(d).forEach(([value, label], i) => {
      const tx = 80 + (i % F.cols) * (tw + gap);
      const ty = top + Math.floor(i / F.cols) * (th + gap);
      roundRect(ctx, tx, ty, tw, th, 22);
      ctx.fillStyle = C.surface;
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = value === '—' ? C.muted : C.paper;
      const vs = fit(ctx, String(value), '600', SERIF, 76, tw - 48, 36);
      ctx.font = '600 ' + vs + 'px ' + SERIF;
      ctx.fillText(String(value), tx + 26, ty + th * .55);
      ctx.fillStyle = C.muted;
      // Long labels shrink to stay inside the tile.
      const text = label.toUpperCase();
      let ls = 20;
      for(; ls > 13; ls--){
        ctx.font = '500 ' + ls + 'px ' + MONO;
        if(ctx.measureText(text).width + text.length * 2.5 <= tw - 52) break;
      }
      spaced(ctx, text, tx + 28, ty + th * .82, 2.5);
    });

    // Their whole timeline as little records, oldest to newest: one row up
    // to 16 cards, then two rows (a very long night is thinned to 40).
    let years = (d.years || []).slice();
    const MAX = 40;
    if(years.length > MAX) years = Array.from({ length: MAX }, (_, i) => years[Math.round(i * (years.length - 1) / (MAX - 1))]);
    const two = years.length > 16;
    const rows = two ? [years.slice(0, Math.ceil(years.length / 2)), years.slice(Math.ceil(years.length / 2))] : [years];
    const ly = two ? F.lineTwo : F.line;
    const disc = two ? 12 : years.length > 12 ? 14 : 17;
    const font = two || years.length > 12 ? 17 : 19;
    if(years.length){
      rows.forEach((row, r) => {
        const y0 = ly + r * 64;
        ctx.strokeStyle = 'rgba(212,162,78,.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(80, y0); ctx.lineTo(W - 80, y0); ctx.stroke();
        // Both rows share one spacing so the discs line up.
        const per = rows[0].length;
        const step = per > 1 ? (W - 220) / (per - 1) : 0;
        row.forEach((y, i) => {
          const cx = per > 1 ? 110 + i * step : W / 2;
          ctx.beginPath(); ctx.arc(cx, y0, disc, 0, Math.PI * 2);
          ctx.fillStyle = '#0D0910'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, y0, disc * .36, 0, Math.PI * 2);
          ctx.fillStyle = C.gold; ctx.fill();
          ctx.fillStyle = C.muted;
          ctx.textAlign = 'center';
          ctx.font = '400 ' + font + 'px ' + MONO;
          ctx.fillText(String(y), cx, y0 + disc + 26);
        });
      });
      ctx.textAlign = 'left';
    }else{
      ctx.strokeStyle = 'rgba(212,162,78,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(80, ly); ctx.lineTo(W - 80, ly); ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'center';
      ctx.font = '400 22px ' + MONO;
      ctx.fillText(L('No cards yet — the night is young', 'Ingen kort endnu — aftenen er ung'), W / 2, ly + 46);
      ctx.textAlign = 'left';
    }

    // Footer.
    ctx.fillStyle = C.gold;
    ctx.font = '500 22px ' + MONO;
    spaced(ctx, L('THE MUSIC TIMELINE GAME', 'MUSIKKENS TIDSLINJESPIL'), 80, H - F.foot, 4);
    ctx.fillStyle = C.muted;
    ctx.font = '400 22px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillText(L('first to ', 'først til ') + target, W - 80, H - F.foot);
    ctx.textAlign = 'left';
    // A story has room under the footer: the site's address, centred.
    if(format === 'story'){
      ctx.fillStyle = C.muted;
      ctx.font = '500 28px ' + MONO;
      spaced(ctx, siteLabel(), W / 2, H - 80, 3, 'center');
    }
    return canvas;
  }

  // Save the card: the share sheet where there is one (on iPhone that's
  // "Save Image" → camera roll), otherwise a download.
  async function saveRecapCard(canvas, name){
    const file = 'vinylle-recap-' + (name || 'player').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + (canvas.height > 1500 ? '-story' : '') + '.png';
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if(blob && navigator.canShare && window.File){
      const f = new File([blob], file, { type: 'image/png' });
      if(navigator.canShare({ files: [f] })){
        try{ await navigator.share({ files: [f], title: "Vinyl'le recap" }); return; }
        catch(e){ if(e && e.name === 'AbortError') return; }
      }
    }
    const a = document.createElement('a');
    a.download = file;
    a.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
    a.click();
    if(blob) setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.drawRecapCard = drawRecapCard;
  window.saveRecapCard = saveRecapCard;
  // The same pieces, for the DJ's leaderboard and night recap pictures.
  window.recapDraw = {
    C, SERIF, MONO, fit, clip, spaced, roundRect,
    drawRecord: (ctx, cx, cy, r, label, tone, lang) => { LANG = lang === 'da' ? 'da' : 'en'; drawRecord(ctx, cx, cy, r, label, tone); }
  };
})();
