const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const L = require('./lobbies');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
// Render/Railway/Cloudflare terminate TLS and forward over plain http. Without
// this, req.protocol reports "http" and every share link and QR would point at
// an insecure URL on a site that's actually served over https.
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

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
app.use('/images', express.static(path.join(ROOT, 'images')));

app.get('/health', (req, res) => res.json({ ok: true, lobbies: L.count() }));

// Tells the DJ page which origin to put on share links — it can't work this
// out itself, since all it knows is the address the DJ typed.
app.get('/share-origin', (req, res) => {
  res.json({ origin: shareOrigin(req), lan: !!LAN_IP });
});

// QR for a live lobby. Takes only a code and builds the URL server-side, so
// this can't be pointed at an arbitrary destination.
app.get('/qr/:code.svg', async (req, res) => {
  const lobby = L.getLobby(req.params.code);
  if(!lobby) return res.status(404).type('text/plain').send('no such lobby');

  const origin = shareOrigin(req);
  if(!origin) return res.status(503).type('text/plain').send('no reachable address');

  try{
    const svg = await QRCode.toString(origin + '/player?code=' + lobby.code, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#241A0B', light: '#F3EADD' }
    });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  }catch(err){
    res.status(500).type('text/plain').send('qr failed');
  }
});

function toDj(lobby, event, payload){
  if(lobby.djSocketId) io.to(lobby.djSocketId).emit(event, payload);
}

function toPhones(lobby, event, payload){
  io.to('phones:' + lobby.code).emit(event, payload);
}

function pushRoster(lobby){
  toDj(lobby, 'lobby:roster', { phones: L.roster(lobby) });
}

function closeLobby(lobby, reason){
  toPhones(lobby, 'lobby:end', { reason });
  toDj(lobby, 'lobby:end', { reason });
  for(const socketId of lobby.phones.keys()){
    const s = io.sockets.sockets.get(socketId);
    if(s) s.leave('phones:' + lobby.code);
  }
  L.endLobby(lobby.code);
}

io.on('connection', (socket) => {

  // --- DJ side -------------------------------------------------------------

  // Called on DJ page load. Passing back a previously issued code + secret
  // reclaims that lobby, so a browser refresh mid-game doesn't kill it.
  socket.on('lobby:create', (payload, cb) => {
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

    const lobby = L.createLobby(socket.id);
    socket.data.role = 'dj';
    socket.data.code = lobby.code;
    ack({ ok: true, code: lobby.code, djSecret: lobby.djSecret, resumed: false, phones: [] });
  });

  // The DJ is the authority: it sends the whole game state, we just fan it out.
  socket.on('state:sync', (state) => {
    const lobby = L.lobbyForDj(socket.id);
    if(!lobby) return;
    lobby.state = state;
    L.touch(lobby);
    toPhones(lobby, 'lobby:state-sync', state);
  });

  // DJ's verdict on a phone that asked to join (claimed a slot, or self-registered).
  socket.on('player:join-result', (payload) => {
    const lobby = L.lobbyForDj(socket.id);
    if(!lobby || !payload || !payload.socketId) return;
    const phone = lobby.phones.get(payload.socketId);
    if(phone && payload.ok && payload.name) phone.name = payload.name;
    io.to(payload.socketId).emit('join:result', {
      ok: !!payload.ok,
      name: payload.name || null,
      reason: payload.reason || null
    });
    if(payload.ok) pushRoster(lobby);
  });

  socket.on('lobby:end', () => {
    const lobby = L.lobbyForDj(socket.id);
    if(lobby) closeLobby(lobby, 'dj-ended');
  });

  // --- Player side ---------------------------------------------------------

  // Lets a phone see which names the DJ has already created (and which are
  // still free) before it commits to claiming one.
  socket.on('lobby:peek', (payload, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    const lobby = L.getLobby(payload && payload.code);
    if(!lobby) return ack({ ok: false, error: 'no-lobby' });
    // A name held by the asking device isn't "taken" from its point of view —
    // that's its own slot to walk back into after a reload.
    const asker = payload && payload.deviceId;
    const roster = (lobby.state && Array.isArray(lobby.state.players) ? lobby.state.players : [])
      .map(p => ({
        name: p.name,
        claimed: !!p.deviceId && p.deviceId !== asker,
        mine: !!asker && p.deviceId === asker
      }));
    ack({ ok: true, code: lobby.code, names: roster, full: L.isFull(lobby), djOnline: !!lobby.djSocketId });
  });

  socket.on('lobby:join', (payload, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    const code = payload && payload.code;
    const name = (payload && payload.name || '').trim();
    const deviceId = payload && payload.deviceId;

    const lobby = L.getLobby(code);
    if(!lobby) return ack({ ok: false, error: 'no-lobby' });
    if(!name) return ack({ ok: false, error: 'no-name' });

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
    socket.data.deviceId = deviceId;
    socket.join('phones:' + lobby.code);
    L.addPhone(lobby, socket.id, deviceId, name);

    ack({
      ok: true,
      code: lobby.code,
      state: lobby.state,
      djOnline: !!lobby.djSocketId,
      graceEndsAt: lobby.graceEndsAt
    });

    // With no DJ connected there's nobody to approve the join — it gets
    // replayed from the roster the moment they come back.
    if(lobby.djSocketId){
      toDj(lobby, 'player:join-request', { socketId: socket.id, name, deviceId });
      pushRoster(lobby);
    }
  });

  // --- Teardown ------------------------------------------------------------

  socket.on('disconnect', () => {
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
