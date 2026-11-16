const path = require('path');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const express = require('express');
const compression = require('compression');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const L = require('./lobbies');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
// Render/Railway/Cloudflare terminate TLS and forward over plain http. Without
// this, req.protocol reports "http" and every share link and QR would point at
// an insecure URL on a site that's actually served over https.
// Trust only the proxy hops we actually sit behind (Render: one). Trusting
// every hop lets a client forge X-Forwarded-For and dodge the per-IP limits.
const PROXY_HOPS = Math.max(0, Number(process.env.TRUST_PROXY_HOPS) || 1);
app.set('trust proxy', PROXY_HOPS);
// Both pages are single large HTML files.
app.use(compression());
// Basic hardening headers. No CSP yet: both pages lean on inline scripts.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});
const server = http.createServer(app);
// Both pages are served from this origin, so no cross-origin access is needed.
// An extreme state blob (12 players x 30 cards, 60 songs) measures ~90 KB;
// 512 KB is a ceiling for junk, not something a game gets near.
const io = new Server(server, { maxHttpBufferSize: 512 * 1024 });

// One bad handler must never take every lobby on the server down with it.
process.on('uncaughtException', err => console.error('[uncaught]', err));
process.on('unhandledRejection', err => console.error('[unhandled rejection]', err));

// --- Input checks --------------------------------------------------------------
// Phones are untrusted: anyone with a code can open a raw socket and send
// whatever they like, so every field is checked before it's used or relayed.

const NAME_MAX = 20;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

function cleanName(v){
  if(typeof v !== 'string') return '';
  return v.normalize('NFC')
    // control chars, zero-width and bidi overrides, and angle brackets
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function cleanDevice(v){
  return typeof v === 'string' && DEVICE_RE.test(v) ? v : null;
}

// A relayed field: short strings, finite numbers, booleans or null — nothing else.
function prim(v){
  if(typeof v === 'string') return v.length <= 200 ? v : null;
  if(typeof v === 'number') return Number.isFinite(v) ? v : null;
  if(typeof v === 'boolean') return v;
  return null;
}

function isObj(v){
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// --- Public ids ----------------------------------------------------------------
// A phone's deviceId is its key back into its seat, so it must never reach
// other phones. Each one gets a random per-lobby public id instead, and the
// state blob is rewritten before it's fanned out.

function publicId(lobby, deviceId){
  let pid = lobby.pids.get(deviceId);
  if(!pid){
    pid = 'p' + crypto.randomBytes(8).toString('hex');
    lobby.pids.set(deviceId, pid);
  }
  return pid;
}

function forPhones(lobby, state){
  if(!isObj(state)) return state;
  if(Array.isArray(state.players)){
    state.players.forEach(p => { if(p && typeof p.deviceId === 'string') publicId(lobby, p.deviceId); });
  }
  const map = lobby.pids;
  if(!map.size) return state;
  // deviceIds show up as values (players[].deviceId, lockin.locked[]) and as
  // keys (bets.placed, vote.results, ...): swap both.
  const walk = v => {
    if(typeof v === 'string') return map.get(v) || v;
    if(Array.isArray(v)) return v.map(walk);
    if(v && typeof v === 'object'){
      const out = {};
      for(const k of Object.keys(v)) out[map.get(k) || k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return walk(state);
}

// A phone can't reach "localhost" — that's the DJ's own machine. When the DJ
// is browsing via localhost we swap in the LAN address so shared links and QR
// codes actually resolve from someone else's handset.
function lanAddress(){
  const candidates = [];
  for(const [name, addrs] of Object.entries(os.networkInterfaces())){
    for(const a of addrs || []){
      if(a.family !== 'IPv4' || a.internal) continue;
      // VPN and virtual adapters hand out addresses nobody else on the wifi
      // can route to, so they go last.
      const virtual = /^(utun|tun|tap|bridge|vmnet|vboxnet|docker)/i.test(name);
      candidates.push({ address: a.address, rank: virtual ? 1 : 0 });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates.length ? candidates[0].address : null;
}

const LAN_IP = lanAddress();

function isLocalHost(host){
  return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host || '');
}

// The origin players should use, from the DJ's point of view.
function shareOrigin(req){
  const host = req && req.headers && req.headers.host;
  if(host && !isLocalHost(host)) return req.protocol + '://' + host;
  if(!LAN_IP) return null;
  const port = host && host.includes(':') ? host.split(':').pop() : PORT;
  return 'http://' + LAN_IP + ':' + port;
}

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/player', (req, res) => res.sendFile(path.join(ROOT, 'player.html')));
// Scripts and styles are checked with the server on every load (cheap: an
// unchanged file is a 304), so a deploy shows up straight away instead of
// the browser running yesterday's copy from its cache.
const fresh = { headers: { 'Cache-Control': 'no-cache' } };
// Game rules both pages share.
app.get('/rules.js', (req, res) => res.sendFile(path.join(ROOT, 'rules.js'), fresh));
app.get('/recap-card.js', (req, res) => res.sendFile(path.join(ROOT, 'recap-card.js'), fresh));
app.use('/images', express.static(path.join(ROOT, 'images'), { maxAge: '1d' }));
// The DJ page's styles and scripts, split by topic (see dj/).
app.use('/dj', express.static(path.join(ROOT, 'dj'), { setHeaders: res => res.set('Cache-Control', 'no-cache') }));

app.get('/health', (req, res) => res.json({ ok: true, lobbies: L.count() }));

// The "house app": the site owner's own Spotify client ID, set as an env var
// on the host. With it, the DJ page connects without anyone creating a
// Spotify developer app. A client ID isn't a secret (PKCE has no secret), but
// only accounts on the app's allowlist in Spotify's dashboard can use it.
const HOUSE_CLIENT_ID = /^[0-9a-f]{32}$/i.test(process.env.SPOTIFY_CLIENT_ID || '')
  ? process.env.SPOTIFY_CLIENT_ID : null;
if(process.env.SPOTIFY_CLIENT_ID && !HOUSE_CLIENT_ID){
  console.warn('SPOTIFY_CLIENT_ID is set but doesn\'t look like a Spotify client ID (32 hex chars); ignoring it.');
}
app.get('/config', (req, res) => {
  res.set('Cache-Control', 'no-cache').json({ houseClientId: HOUSE_CLIENT_ID });
});

// Tells the DJ page which origin to put on share links — it can't work this
// out itself, since all it knows is the address the DJ typed.
app.get('/share-origin', (req, res) => {
  res.json({ origin: shareOrigin(req), lan: !!LAN_IP });
});

// A lobby's QR never changes and the DJ page asks for it repeatedly (join
// screen, corner chip, every Show QR), so render it once per lobby.
const qrCache = new Map(); // code -> Map(url -> svg)

// QR for a live lobby. Takes only a code and builds the URL server-side, so
// this can't be pointed at an arbitrary destination.
app.get('/qr/:code.svg', async (req, res) => {
  const lobby = L.getLobby(req.params.code);
  if(!lobby) return res.status(404).type('text/plain').send('no such lobby');

  const origin = shareOrigin(req);
  if(!origin) return res.status(503).type('text/plain').send('no reachable address');

  try{
    const url = origin + '/player?code=' + lobby.code;
    let forLobby = qrCache.get(lobby.code);
    if(!forLobby){ forLobby = new Map(); qrCache.set(lobby.code, forLobby); }
    let svg = forLobby.get(url);
    if(!svg){
      // The URL depends on the Host header, which a client controls.
      if(forLobby.size >= 4) forLobby.clear();
      svg = await QRCode.toString(url, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 1,
        color: { dark: '#241A0B', light: '#F3EADD' }
      });
      forLobby.set(url, svg);
    }
    // Codes are never reused while a lobby is live, so the browser can keep it.
    res.type('image/svg+xml').set('Cache-Control', 'private, max-age=3600').send(svg);
  }catch(err){
    res.status(500).type('text/plain').send('qr failed');
  }
});

// --- Anti-spam ---------------------------------------------------------------
// Limits sized well above anything a real game does, so players never notice.

// Where a connection really comes from. Each proxy appends the address it saw,
// so the entry PROXY_HOPS from the right was written by our own proxy; anything
// further left is whatever the client chose to send.
function clientIp(socket){
  const direct = socket.handshake.address || '';
  if(!PROXY_HOPS) return direct;
  const fwd = String(socket.handshake.headers['x-forwarded-for'] || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return fwd.length >= PROXY_HOPS ? fwd[fwd.length - PROXY_HOPS] : direct;
}

// New lobbies per IP: a DJ makes one a night, maybe a few with "New lobby".
const CREATE_LIMIT = 15;
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_LOBBIES = 500;
const createLog = new Map(); // ip -> [timestamps]

function mayCreateLobby(ip){
  const now = Date.now();
  const recent = (createLog.get(ip) || []).filter(t => now - t < CREATE_WINDOW_MS);
  if(recent.length >= CREATE_LIMIT || L.count() >= MAX_LOBBIES){
    createLog.set(ip, recent);
    return false;
  }
  recent.push(now);
  createLog.set(ip, recent);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for(const [ip, times] of createLog){
    if(!times.some(t => now - t < CREATE_WINDOW_MS)) createLog.delete(ip);
  }
}, 10 * 60 * 1000).unref();

// Messages per connection: a token bucket that refills EVENTS_PER_SEC, with room
// for a burst. Anything over is dropped quietly.
const EVENTS_PER_SEC = 20;
const EVENT_BURST = 60;
// The DJ page syncs state after every change, so it gets far more room — but
// not unlimited, since anyone can become a "DJ" by creating a lobby.
const DJ_EVENTS_PER_SEC = 100;
const DJ_EVENT_BURST = 400;

function rateLimit(socket){
  let tokens = DJ_EVENT_BURST, at = Date.now();
  socket.use((packet, next) => {
    const dj = socket.data.role === 'dj';
    const rate = dj ? DJ_EVENTS_PER_SEC : EVENTS_PER_SEC;
    const burst = dj ? DJ_EVENT_BURST : EVENT_BURST;
    const now = Date.now();
    tokens = Math.min(burst, tokens + (now - at) / 1000 * rate);
    at = now;
    if(tokens < 1) return; // dropped; acks are never called, the caller's timeout handles it
    tokens -= 1;
    next();
  });
}

// Recap requests waiting on the DJ: reqId -> ack.
const recapWaits = new Map();
let recapSeq = 0;

function toDj(lobby, event, payload){
  if(lobby.djSocketId) io.to(lobby.djSocketId).emit(event, payload);
}

function toPhones(lobby, event, payload){
  io.to('phones:' + lobby.code).emit(event, payload);
}

function pushRoster(lobby){
  toDj(lobby, 'lobby:roster', { phones: L.roster(lobby) });
}

// The name list as one particular device sees it: a slot held by the asker is
// its own to walk back into, not "taken".
function nameRoster(lobby, asker){
  const players = (lobby.state && Array.isArray(lobby.state.players)) ? lobby.state.players : [];
  return players.map(p => ({
    name: p.name,
    claimed: !!p.deviceId && p.deviceId !== asker,
    mine: !!asker && p.deviceId === asker
  }));
}

// Phones sitting on the "who are you?" screen aren't in the game yet, so they
// miss lobby:state-sync entirely. Push them the roster so a name the DJ adds
// appears without them having to back out and re-enter the code.
function pushNames(lobby){
  for(const [socketId, deviceId] of lobby.peekers.entries()){
    io.to(socketId).emit('lobby:names', {
      names: nameRoster(lobby, deviceId),
      full: L.isFull(lobby)
    });
  }
}

function closeLobby(lobby, reason){
  toPhones(lobby, 'lobby:end', { reason });
  toDj(lobby, 'lobby:end', { reason });
  for(const socketId of lobby.phones.keys()){
    const s = io.sockets.sockets.get(socketId);
    if(s) s.leave('phones:' + lobby.code);
  }
  qrCache.delete(lobby.code);
  L.endLobby(lobby.code);
}

setInterval(() => {
  L.idleLobbies().forEach(lobby => closeLobby(lobby, 'idle'));
}, 60 * 60 * 1000).unref();

io.on('connection', (socket) => {
  rateLimit(socket);

  // Every handler runs behind a try/catch: socket.io calls them with no guard
  // of its own, so one malformed packet would otherwise crash the process.
  const on = (event, fn) => socket.on(event, (...args) => {
    try{ fn(...args); }
    catch(err){ console.error('[socket ' + event + ']', err); }
  });

  // --- DJ side -------------------------------------------------------------

  // Called on DJ page load. Passing back a previously issued code + secret
  // reclaims that lobby, so a browser refresh mid-game doesn't kill it.
  on('lobby:create', (payload, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    const wanted = payload && payload.code;
    const secret = payload && payload.djSecret;

    if(wanted && secret){
      const resumed = L.resumeLobby(wanted, secret, socket.id);
      if(resumed){
        socket.data.role = 'dj';
        socket.data.code = resumed.code;
        toPhones(resumed, 'dj:reconnect', {});
        // A resumed DJ has a blank slate for claims (a page reload wipes them),
        // so re-announce every phone that's still connected. This covers both
        // phones that were already in and any that joined while the DJ was gone.
        L.roster(resumed).forEach(phone => socket.emit('player:join-request', phone));
        ack({ ok: true, code: resumed.code, djSecret: resumed.djSecret, resumed: true, phones: L.roster(resumed) });
        pushRoster(resumed);
        return;
      }
    }

    if(!mayCreateLobby(clientIp(socket))) return ack({ ok: false, error: 'rate-limited' });
    // The server restarted and lost the lobby: bring it back under the same
    // code so the phones' retries find it. Null if the code is live or malformed.
    const restored = wanted && secret ? L.restoreLobby(wanted, secret, socket.id) : null;
    const lobby = restored || L.createLobby(socket.id);
    socket.data.role = 'dj';
    socket.data.code = lobby.code;
    ack({ ok: true, code: lobby.code, djSecret: lobby.djSecret, resumed: false, restored: !!restored, phones: [] });
  });

  // The DJ is the authority: it sends the whole game state, we just fan it out.
  on('state:sync', (state) => {
    const lobby = L.lobbyForDj(socket.id);
    if(!lobby) return;
    if(!isObj(state)) return;
    lobby.state = state;
    L.touch(lobby);
    toPhones(lobby, 'lobby:state-sync', forPhones(lobby, state));
    pushNames(lobby);
  });

  // DJ's verdict on a phone that asked to join (claimed a slot, or self-registered).
  on('player:join-result', (payload) => {
    const lobby = L.lobbyForDj(socket.id);
    if(!lobby || !payload || !payload.socketId) return;
    // Only a phone of this lobby: a room name here would reach other lobbies.
    const phone = lobby.phones.get(payload.socketId);
    if(!phone) return;
    if(payload.ok && payload.name) phone.name = payload.name;
    io.to(payload.socketId).emit('join:result', {
      ok: !!payload.ok,
      name: payload.name || null,
      reason: payload.reason || null
    });
    if(payload.ok) pushRoster(lobby);
  });

  // DJ boots one phone. Not a ban — they can rejoin with the same code, they
  // just come back as a fresh player with an empty timeline.
  on('lobby:kick', (payload) => {
    const lobby = L.lobbyForDj(socket.id);
    if(!lobby || !payload || !payload.deviceId) return;
    const socketId = L.socketForDevice(lobby, payload.deviceId);
    if(!socketId) return; // already gone; the DJ still drops them from the board
    L.removePhone(lobby, socketId);
    // Straight back onto the peeker list, so the name screen they land on gets
    // live roster pushes immediately — no race against their own re-peek.
    lobby.peekers.set(socketId, payload.deviceId);
    io.to(socketId).emit('lobby:kicked', { reason: payload.reason || 'kicked' });
    const s = io.sockets.sockets.get(socketId);
    if(s) s.leave('phones:' + lobby.code);
    pushRoster(lobby);
  });

  // The DJ renamed a player. The server keeps the join name and replays it when
  // the DJ page reloads, so it has to follow, and the phone shows it too.
  on('player:rename', (payload) => {
    const lobby = L.lobbyForDj(socket.id);
    if(!lobby || !isObj(payload)) return;
    const deviceId = cleanDevice(payload.deviceId);
    const name = cleanName(payload.name);
    if(!deviceId || !name) return;
    const socketId = L.socketForDevice(lobby, deviceId);
    if(!socketId) return;
    lobby.phones.get(socketId).name = name;
    io.to(socketId).emit('player:renamed', { name });
    pushRoster(lobby);
  });

  on('lobby:end', () => {
    const lobby = L.lobbyForDj(socket.id);
    if(lobby) closeLobby(lobby, 'dj-ended');
  });

  // --- Player side ---------------------------------------------------------

  // Lets a phone see which names the DJ has already created (and which are
  // still free) before it commits to claiming one.
  on('lobby:peek', (payload, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    if(!isObj(payload)) return ack({ ok: false, error: 'no-lobby' });
    const lobby = L.getLobby(payload.code);
    if(!lobby) return ack({ ok: false, error: 'no-lobby' });
    const asker = cleanDevice(payload.deviceId);
    // Peeking a different lobby: stop pushing names from the old one.
    const before = L.getLobby(socket.data.peekCode);
    if(before && before !== lobby) before.peekers.delete(socket.id);
    // Remember them so roster changes get pushed while they pick a name.
    lobby.peekers.set(socket.id, asker || null);
    socket.data.peekCode = lobby.code;
    ack({ ok: true, code: lobby.code, names: nameRoster(lobby, asker), full: L.isFull(lobby), djOnline: !!lobby.djSocketId });
  });

  on('lobby:join', (payload, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    if(!isObj(payload)) return ack({ ok: false, error: 'no-lobby' });
    const name = cleanName(payload.name);
    const deviceId = cleanDevice(payload.deviceId);

    const lobby = L.getLobby(payload.code);
    if(!lobby) return ack({ ok: false, error: 'no-lobby' });
    if(!name) return ack({ ok: false, error: 'no-name' });
    // The device id is how a phone gets its seat back; without one, two phones
    // would knock each other out of the roster.
    if(!deviceId) return ack({ ok: false, error: 'bad-device' });

    const known = Array.from(lobby.phones.values()).some(p => p.deviceId === deviceId);
    if(!known && L.isFull(lobby)) return ack({ ok: false, error: 'full' });

    // A phone that reconnects replaces its own older socket rather than
    // stacking up a second entry in the roster.
    for(const [socketId, phone] of Array.from(lobby.phones.entries())){
      if(phone.deviceId === deviceId && socketId !== socket.id){
        L.removePhone(lobby, socketId);
        const stale = io.sockets.sockets.get(socketId);
        if(stale) stale.leave('phones:' + lobby.code);
      }
    }

    socket.data.role = 'player';
    socket.data.code = lobby.code;
    socket.data.peekCode = lobby.code; // so disconnect cleanup finds the lobby
    socket.data.deviceId = deviceId;
    socket.join('phones:' + lobby.code);
    L.addPhone(lobby, socket.id, deviceId, name);
    lobby.peekers.delete(socket.id); // in the game now, not browsing names

    ack({
      ok: true,
      code: lobby.code,
      // Which public id is "me" in the state blob.
      you: publicId(lobby, deviceId),
      state: forPhones(lobby, lobby.state),
      djOnline: !!lobby.djSocketId,
      graceEndsAt: lobby.graceEndsAt
    });

    // With no DJ connected there's nobody to approve the join — it gets
    // replayed from the roster the moment they come back.
    if(lobby.djSocketId){
      toDj(lobby, 'player:join-request', { socketId: socket.id, name, deviceId, switch: payload.switch === true });
      pushRoster(lobby);
    }
  });

  // Over/under vote from a phone in the game. The DJ decides what it's worth.
  on('vote:cast', (payload) => {
    const lobby = L.lobbyForPhone(socket.id);
    if(!lobby || !isObj(payload)) return;
    toDj(lobby, 'player:vote', {
      deviceId: socket.data.deviceId,
      voteId: prim(payload.voteId),
      choice: prim(payload.choice)
    });
  });

  // Lock-in year from a phone. The DJ checks it against the lock-in.
  on('lockin:cast', (payload) => {
    const lobby = L.lobbyForPhone(socket.id);
    if(!lobby || !isObj(payload)) return;
    toDj(lobby, 'player:lockin', {
      deviceId: socket.data.deviceId,
      lockId: prim(payload.lockId),
      year: prim(payload.year)
    });
  });

  // Betster bet from a phone. The DJ checks it against the player's coins.
  on('bet:place', (payload) => {
    const lobby = L.lobbyForPhone(socket.id);
    if(!lobby || !isObj(payload)) return;
    toDj(lobby, 'player:bet', {
      deviceId: socket.data.deviceId,
      betId: prim(payload.betId),
      pick: prim(payload.pick),
      amount: prim(payload.amount)
    });
  });

  // The turn player points to where the song goes in their timeline.
  on('spot:pick', (payload) => {
    const lobby = L.lobbyForPhone(socket.id);
    if(!lobby || !isObj(payload)) return;
    toDj(lobby, 'player:spot', {
      deviceId: socket.data.deviceId,
      songId: prim(payload.songId),
      slot: prim(payload.slot)
    });
  });

  // Coin shop purchase from a phone. The DJ checks the price and the rules.
  on('shop:buy', (payload) => {
    const lobby = L.lobbyForPhone(socket.id);
    if(!lobby || !isObj(payload)) return;
    toDj(lobby, 'player:buy', {
      deviceId: socket.data.deviceId,
      item: prim(payload.item),
      target: prim(payload.target),
      cardId: prim(payload.cardId),
      price: prim(payload.price)
    });
  });

  // A phone opened its recap card. The DJ has the numbers, so ask it and pass
  // the answer straight back; no answer within 4 s means no card.
  on('recap:get', (payload, cb) => {
    if(typeof cb !== 'function') return;
    const lobby = L.lobbyForPhone(socket.id);
    if(!lobby || !lobby.djSocketId) return cb(null);
    const reqId = ++recapSeq;
    const timer = setTimeout(() => { recapWaits.delete(reqId); cb(null); }, 4000);
    recapWaits.set(reqId, { cb, timer, dj: lobby.djSocketId });
    toDj(lobby, 'player:recap-get', { reqId, deviceId: socket.data.deviceId });
  });

  on('recap:reply', (payload) => {
    const wait = payload && recapWaits.get(payload.reqId);
    if(!wait || wait.dj !== socket.id) return;
    clearTimeout(wait.timer);
    recapWaits.delete(payload.reqId);
    wait.cb(payload.data || null);
  });

  // --- Teardown ------------------------------------------------------------

  on('disconnect', () => {
    const peeked = L.getLobby(socket.data.peekCode);
    if(peeked) peeked.peekers.delete(socket.id);

    const djLobby = L.lobbyForDj(socket.id);
    if(djLobby){
      L.startGrace(djLobby, (expired) => closeLobby(expired, 'dj-timeout'));
      toPhones(djLobby, 'dj:disconnect-warning', { endsAt: djLobby.graceEndsAt });
      return;
    }

    const phoneLobby = L.lobbyForPhone(socket.id);
    if(phoneLobby){
      const phone = L.removePhone(phoneLobby, socket.id);
      toDj(phoneLobby, 'player:left', { socketId: socket.id, deviceId: phone && phone.deviceId });
      pushRoster(phoneLobby);
    }
  });
});

server.listen(PORT, () => {
  console.log("Vinyl'le server listening on http://localhost:" + PORT);
  console.log('  DJ     → http://localhost:' + PORT + '/');
  console.log('  Player → http://localhost:' + PORT + '/player');
});
