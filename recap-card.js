/* Vinyl'le — a player's recap card, drawn on a canvas so it saves as a crisp
   1080×1350 picture (a camera-roll / Instagram portrait). Shared by the DJ
   page and the phones: both pass the same data the DJ computes.

   drawRecapCard(data) → Promise<HTMLCanvasElement>
   data: { name, rank, of, cards, coins, winLength, won, streak, bestStreak,
           titles, ouRight, ou, lockWins, spent, bets, decade, years, date } */

(function(){
  const W = 1080, H = 1350;
  const C = {
    bg: '#1B1420', surface: 'rgba(255,255,255,.045)', line: 'rgba(212,162,78,.28)',
    gold: '#D4A24E', goldHi: '#F0C877', paper: '#F3EADD', muted: '#9C8FA3', ink: '#241A0B'
  };
  const SERIF = "'Fraunces', serif";
  const MONO = "'IBM Plex Mono', monospace";

  function ordinal(n){
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

  function drawRecord(ctx, cx, cy, r, label){
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
    lg.addColorStop(0, C.goldHi);
    lg.addColorStop(1, C.gold);
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
    spaced(ctx, 'PLACE', cx, cy + lr * .45, 3, 'center');
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

    if(d.bestStreak >= 3) add(95, '🔥' + d.bestStreak, 'Best streak');
    if(d.ou >= 2 && d.ouRight === d.ou) add(92, d.ouRight + '/' + d.ou, 'Perfect over/under');
    if(d.turns >= 4 && pct === 100) add(91, '100%', 'Never missed');
    if(d.steals) add(88, d.steals, plural(d.steals, 'Card stolen', 'Cards stolen'));
    // Tightest squeeze in months when months were in play, else in years.
    const tm = d.tightestMonths;
    if(tm === 0) add(88, 'Same month', 'Tightest squeeze');
    else if(tm > 0 && tm < 12) add(86, tm + (tm === 1 ? ' month' : ' months'), 'Tightest squeeze');
    else if(tm >= 12) add(52, Math.floor(tm / 12) + 'y' + (tm % 12 ? ' ' + (tm % 12) + 'm' : ''), 'Tightest squeeze');
    else if(d.tightest === 0) add(86, 'Same year', 'Tightest squeeze');
    if(d.sabotage) add(84, d.sabotage, plural(d.sabotage, 'Sabotage', 'Sabotages'));
    if(d.sang) add(82, '🎤' + d.sang, plural(d.sang, 'Song sung', 'Songs sung'));
    if(d.donWins) add(80, d.donWins, 'Double or nothing wins');
    if(d.lockWins) add(78, d.lockWins, plural(d.lockWins, 'Lock-in won', 'Lock-ins won'));
    if(d.robinGot) add(76, '+' + d.robinGot, 'Robin Hood gifts');
    if(d.robinGave) add(75, '−' + d.robinGave, 'Robbed');
    if(d.bets > 0) add(74, '+' + d.bets, 'Betting profit');
    if(d.titles >= 3) add(72, d.titles, 'Titles named');
    if(d.turns >= 3 && pct < 100) add(70, pct + '%', 'Own-turn hits');
    if(d.decadeShare >= 50 && years.length >= 4) add(68, d.decadeShare + '%', d.decade + ' specialist');
    if(d.leap >= 20) add(66, d.leap + 'y', 'Biggest leap');
    if(d.ou && d.ouRight < d.ou) add(64, d.ouRight + '/' + d.ou, 'Over/under');
    if(d.bestStreak === 2) add(60, '🔥2', 'Best streak');
    if(d.titles && d.titles < 3) add(58, d.titles, plural(d.titles, 'Title named', 'Titles named'));
    if(d.decade) add(55, d.decade, 'Favourite decade');
    if(tm == null && d.tightest > 0) add(52, d.tightest + 'y', 'Tightest squeeze');
    if(d.spent) add(50, d.spent, 'Coins spent');
    if(years.length){
      add(45, years[0], 'Oldest card');
      add(44, years[years.length - 1], 'Newest card');
    }
    if(years.length > 1) add(40, (years[years.length - 1] - years[0]) + 'y', 'Years covered');
    if(d.leap > 0 && d.leap < 20) add(38, d.leap + 'y', 'Biggest leap');
    if(d.turns) add(36, d.turns, plural(d.turns, 'Turn played', 'Turns played'));

    const picked = out.sort((a, b) => b.score - a.score).slice(0, 6).map(t => [t.value, t.label]);
    while(picked.length < 6) picked.push(['—', picked.length % 2 ? 'Keep playing' : 'More to come']);
    return picked;
  }

  async function drawRecapCard(d){
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
    let g = ctx.createRadialGradient(W * .78, 120, 40, W * .78, 120, 900);
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
    drawRecord(ctx, W - 150, 250, 330, ordinal(d.rank || 1));

    // Masthead.
    ctx.fillStyle = C.gold;
    ctx.font = '500 30px ' + MONO;
    spaced(ctx, "VINYL'LE", 80, 110, 8);
    ctx.fillStyle = C.muted;
    ctx.font = '400 24px ' + MONO;
    const date = new Date(d.date || Date.now());
    spaced(ctx, ('Night recap · ' + date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })).toUpperCase(), 80, 152, 3);

    // Name, big.
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'left';
    const nameSize = fit(ctx, d.name, '700', SERIF, 150, 600, 60);
    ctx.font = '700 ' + nameSize + 'px ' + SERIF;
    ctx.fillText(d.name, 76, 330);

    // Rank line, plus a WINNER pill.
    ctx.font = '500 34px ' + MONO;
    ctx.fillStyle = C.gold;
    let x = 80 + spaced(ctx, (ordinal(d.rank || 1) + ' of ' + (d.of || 1)).toUpperCase(), 80, 400, 4) + 26;
    if(d.won){
      ctx.font = '500 26px ' + MONO;
      const pw = ctx.measureText('WINNER').width + 60;
      roundRect(ctx, x, 368, pw, 46, 23);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.fillStyle = C.ink;
      spaced(ctx, 'WINNER', x + 26, 400, 3);
    }else if(d.streak >= 2){
      ctx.fillStyle = C.muted;
      ctx.font = '400 30px ' + MONO;
      ctx.fillText('· on a 🔥' + d.streak + ' streak', x - 10, 400);
    }

    // Hero numbers: cards and gold coins.
    const hero = (value, label, hx, color) => {
      ctx.fillStyle = color;
      ctx.font = '700 190px ' + SERIF;
      ctx.fillText(String(value), hx, 640);
      const w = ctx.measureText(String(value)).width;
      ctx.fillStyle = C.muted;
      ctx.font = '500 26px ' + MONO;
      spaced(ctx, label, hx + 6, 690, 4);
      return w;
    };
    const cardsW = hero(d.cards || 0, d.cards === 1 ? 'CARD' : 'CARDS', 80, C.paper);
    hero(d.coins || 0, d.coins === 1 ? 'GOLD COIN' : 'GOLD COINS', 600, C.gold);
    // A little progress ring toward the target, right after the card count.
    const target = d.winLength || 10;
    const pct = Math.min(1, (d.cards || 0) / target);
    const rx = Math.min(80 + cardsW + 70, 520);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.arc(rx, 580, 44, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.gold;
    ctx.lineCap = 'round';
    if(pct > 0){ ctx.beginPath(); ctx.arc(rx, 580, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke(); }
    ctx.lineCap = 'butt';
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.font = '500 22px ' + MONO;
    ctx.fillText('/' + target, rx, 588);
    ctx.textAlign = 'left';

    // Six stat tiles.
    const tw = 293, th = 170, gap = 20, top = 760;
    tiles(d).forEach(([value, label], i) => {
      const tx = 80 + (i % 3) * (tw + gap);
      const ty = top + Math.floor(i / 3) * (th + gap);
      roundRect(ctx, tx, ty, tw, th, 22);
      ctx.fillStyle = C.surface;
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = value === '—' ? C.muted : C.paper;
      const vs = fit(ctx, String(value), '600', SERIF, 76, tw - 48, 36);
      ctx.font = '600 ' + vs + 'px ' + SERIF;
      ctx.fillText(String(value), tx + 26, ty + 94);
      ctx.fillStyle = C.muted;
      // Long labels shrink to stay inside the tile.
      const text = label.toUpperCase();
      let ls = 20;
      for(; ls > 13; ls--){
        ctx.font = '500 ' + ls + 'px ' + MONO;
        if(ctx.measureText(text).width + text.length * 2.5 <= tw - 52) break;
      }
      spaced(ctx, text, tx + 28, ty + 140, 2.5);
    });

    // Their whole timeline as little records, oldest to newest: one row up
    // to 16 cards, then two rows (a very long night is thinned to 40).
    let years = (d.years || []).slice();
    const MAX = 40;
    if(years.length > MAX) years = Array.from({ length: MAX }, (_, i) => years[Math.round(i * (years.length - 1) / (MAX - 1))]);
    const two = years.length > 16;
    const rows = two ? [years.slice(0, Math.ceil(years.length / 2)), years.slice(Math.ceil(years.length / 2))] : [years];
    const ly = two ? 1150 : 1195;
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
      ctx.fillText('No cards yet — the night is young', W / 2, ly + 46);
      ctx.textAlign = 'left';
    }

    // Footer.
    ctx.fillStyle = C.gold;
    ctx.font = '500 22px ' + MONO;
    spaced(ctx, 'THE MUSIC TIMELINE GAME', 80, H - 50, 4);
    ctx.fillStyle = C.muted;
    ctx.font = '400 22px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillText('first to ' + target, W - 80, H - 50);
    ctx.textAlign = 'left';
    return canvas;
  }

  // Save the card: the share sheet where there is one (on iPhone that's
  // "Save Image" → camera roll), otherwise a download.
  async function saveRecapCard(canvas, name){
    const file = 'vinylle-recap-' + (name || 'player').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png';
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
})();
