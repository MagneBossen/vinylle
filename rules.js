/* Vinyl'le — game rules shared by the DJ page and the phones.
   Pure functions only: everything they need comes in as arguments, nothing
   reads page globals or the DOM. Texts and translations stay with each page;
   a "why not" comes back as a code the page turns into words.
   Browser: the global VLRules. Node (tests): module.exports. */

(function(root){
  // The clip never gets shorter than this; a speed trap cuts this much.
  const SPEED_TRAP_CUT = 5;
  const CLIP_FLOOR = 5;

  // Safe in text and in quoted attribute values alike.
  function escapeHtml(str){
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── dates ───────────────────────────────────────────────────────────────
  // Months in expert mode, whole years otherwise (the tiebreaker's unit).
  function dateValue(e, expert){
    return expert ? e.year * 12 + ((e.month || 1) - 1) : e.year;
  }
  // Always months: a year counts as its January when the month doesn't matter.
  function monthValue(e, expert){
    return expert ? e.year * 12 + ((e.month || 1) - 1) : e.year * 12;
  }
  // Months since year 0 whatever the mode (recap numbers).
  function monthIndex(e){
    return e.year * 12 + (e.month || 1) - 1;
  }

  // ── coins and ranking ───────────────────────────────────────────────────
  // Coins on cards plus those won or lost outside them (over/under); can go
  // below zero. `cardCoins(entry)` is each page's own count for one card: the
  // DJ works it out from flags, the phone reads what the DJ sent.
  function bonusCount(timeline, coinAdj, cardCoins){
    return (timeline || []).reduce((sum, e) => sum + cardCoins(e), 0) + (coinAdj || 0);
  }

  // Gaps between neighbouring cards, tightest first.
  function playerGaps(timeline, expert){
    const values = (timeline || []).map(e => dateValue(e, expert)).sort((a, b) => a - b);
    const gaps = [];
    for(let i = 0; i < values.length - 1; i++) gaps.push(values[i + 1] - values[i]);
    return gaps.sort((a, b) => a - b);
  }

  // Cards, then coins, then the tightest gaps, then the player's coin toss.
  // opts: { expert, coins(p) -> number, tie(p) -> number }
  function comparePlayers(a, b, opts){
    const la = (a.timeline || []).length, lb = (b.timeline || []).length;
    if(lb !== la) return lb - la;
    const bonusDiff = opts.coins(b) - opts.coins(a);
    if(bonusDiff !== 0) return bonusDiff;
    const gapsA = playerGaps(a.timeline, opts.expert);
    const gapsB = playerGaps(b.timeline, opts.expert);
    const len = Math.min(gapsA.length, gapsB.length);
    for(let i = 0; i < len; i++){
      if(gapsA[i] !== gapsB[i]) return gapsA[i] - gapsB[i];
    }
    if(gapsA.length !== gapsB.length) return gapsA.length - gapsB.length;
    return opts.tie(a) - opts.tie(b);
  }

  // ── pointing to a spot ──────────────────────────────────────────────────
  // `vals`: the timeline's dateValues in order; `v`: the song's. Slot i is the
  // gap before the i-th card (0 = before the oldest, vals.length = after).
  function spotFits(vals, v, slot){
    return (slot === 0 || vals[slot - 1] <= v) && (slot === vals.length || v <= vals[slot]);
  }
  // Where a song goes: before the first card that is later than it.
  function spotSlotFor(vals, v){
    const i = vals.findIndex(x => x > v);
    return i < 0 ? vals.length : i;
  }

  // ── coin shop ───────────────────────────────────────────────────────────
  // `who`: 'turn' items are for the player whose song it is; 'others' are the
  // sabotage the rest can buy against them. Names and descriptions live with
  // each page.
  const SHOP_ITEMS = [
    { id: 'new', who: 'turn', price: 2 },
    { id: 'hint', who: 'turn', price: 1 },
    { id: 'pass', who: 'turn', price: 3, target: 'player' },
    { id: 'buy', who: 'turn', price: 3 },
    { id: 'steal', who: 'turn', price: 5, target: 'card' },
    { id: 'trap', who: 'others', price: 1 },
    { id: 'force', who: 'others', price: 2 }
  ];

  // Speed traps get pricier on the same song: +1 coin every two (1, 1, 2, 2, 3).
  function shopPrice(id, traps){
    const def = SHOP_ITEMS.find(i => i.id === id);
    if(!def) return 0;
    return id === 'trap' ? def.price + Math.floor((traps || 0) / 2) : def.price;
  }

  // Why a buy is off, as a code, or null if it can go ahead. Checks run in
  // this order. c: { open, buyer, coins, staked, price, turnActive, isTurn,
  // phase, vibe, clipSeconds, hasHint, noYear, passed, hasTarget, stealOk, owned }
  // `staked`: coins a bet has tied up; they can't be spent twice.
  function shopWhyNot(id, c){
    const def = SHOP_ITEMS.find(i => i.id === id);
    if(!c.open) return 'closed';
    if(!c.buyer || !def) return 'pickPlayer';
    if(c.coins - c.staked < c.price) return c.staked > 0 ? 'staked' : 'coins';
    if(def.who === 'others'){
      if(!c.turnActive) return 'noSong';
      if(c.isTurn) return 'notOwnTurn';
      if(c.phase !== 'before' && c.phase !== 'playing') return 'beforeReveal';
      if(id === 'trap'){
        if(c.vibe) return 'vibe';
        if(c.clipSeconds <= CLIP_FLOOR) return 'clipFloor';
      }
      return null;
    }
    if(!c.isTurn) return 'ownTurn';
    if(id === 'buy'){
      if(c.phase !== 'after') return 'afterReveal';
      if(c.owned) return 'someoneHas';
      return null;
    }
    if(c.phase !== 'before' && c.phase !== 'playing') return 'beforeReveal';
    if(id === 'hint'){
      if(c.hasHint) return 'hintShown';
      if(c.noYear) return 'noYear';
    }
    if(id === 'pass'){
      if(c.passed) return 'alreadyPassed';
      if(!c.hasTarget) return 'pickWho';
    }
    if(id === 'steal' && !c.stealOk) return 'pickCard';
    return null;
  }

  const api = {
    SPEED_TRAP_CUT, CLIP_FLOOR, escapeHtml,
    dateValue, monthValue, monthIndex,
    bonusCount, playerGaps, comparePlayers,
    spotFits, spotSlotFor,
    SHOP_ITEMS, shopPrice, shopWhyNot
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VLRules = api;
})(typeof window !== 'undefined' ? window : this);
