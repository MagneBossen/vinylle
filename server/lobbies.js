// In-memory lobby store. Nothing here survives a restart — that's intentional,
// games are ephemeral. The DJ's browser is the authority on game state; a lobby
// just holds the last state blob the DJ sent so late joiners can catch up.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — codes get read aloud
const CODE_LENGTH = 6;
const DJ_GRACE_MS = Number(process.env.DJ_GRACE_MS) || 5 * 60 * 1000;
const MAX_PHONES = 12;
const IDLE_LOBBY_MS = 12 * 60 * 60 * 1000;

const lobbies = new Map();

function randomToken(len, alphabet){
  let out = '';
  for(let i = 0; i < len; i++){
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function freshCode(){
  let code;
  do { code = randomToken(CODE_LENGTH, CODE_ALPHABET); } while(lobbies.has(code));
  return code;
}

function createLobby(djSocketId){
  const code = freshCode();
  const lobby = {
    code,
    djSecret: randomToken(24, CODE_ALPHABET + 'abcdefghijkmnpqrstuvwxyz'),
    djSocketId,
    state: null,
    phones: new Map(),   // socketId -> {deviceId, name}
    peekers: new Map(),  // socketId -> deviceId, for phones still on the name screen
    graceTimer: null,
    graceEndsAt: null,
    createdAt: Date.now(),
    touchedAt: Date.now()
  };
  lobbies.set(code, lobby);
  return lobby;
}

function getLobby(code){
  if(!code) return null;
  return lobbies.get(String(code).trim().toUpperCase()) || null;
}

function lobbyForDj(socketId){
  for(const lobby of lobbies.values()){
    if(lobby.djSocketId === socketId) return lobby;
  }
  return null;
}

function lobbyForPhone(socketId){
  for(const lobby of lobbies.values()){
    if(lobby.phones.has(socketId)) return lobby;
  }
  return null;
}

function touch(lobby){
  lobby.touchedAt = Date.now();
}

function isFull(lobby){
  return lobby.phones.size >= MAX_PHONES;
}

function addPhone(lobby, socketId, deviceId, name){
  lobby.phones.set(socketId, { deviceId, name });
  touch(lobby);
}

function removePhone(lobby, socketId){
  const phone = lobby.phones.get(socketId);
  lobby.phones.delete(socketId);
  touch(lobby);
  return phone || null;
}

function socketForDevice(lobby, deviceId){
  if(!deviceId) return null;
  for(const [socketId, phone] of lobby.phones.entries()){
    if(phone.deviceId === deviceId) return socketId;
  }
  return null;
}

function roster(lobby){
  return Array.from(lobby.phones.entries()).map(([socketId, phone]) => ({
    socketId,
    deviceId: phone.deviceId,
    name: phone.name
  }));
}

// The DJ went away. Hold the lobby open for five minutes before pulling the plug.
function startGrace(lobby, onExpire){
  clearGrace(lobby);
  lobby.djSocketId = null;
  lobby.graceEndsAt = Date.now() + DJ_GRACE_MS;
  lobby.graceTimer = setTimeout(() => {
    lobby.graceTimer = null;
    lobby.graceEndsAt = null;
    onExpire(lobby);
  }, DJ_GRACE_MS);
  touch(lobby);
}

function clearGrace(lobby){
  if(lobby.graceTimer){
    clearTimeout(lobby.graceTimer);
    lobby.graceTimer = null;
  }
  lobby.graceEndsAt = null;
}

function resumeLobby(code, djSecret, djSocketId){
  const lobby = getLobby(code);
  if(!lobby || lobby.djSecret !== djSecret) return null;
  clearGrace(lobby);
  lobby.djSocketId = djSocketId;
  touch(lobby);
  return lobby;
}

function endLobby(code){
  const lobby = getLobby(code);
  if(!lobby) return null;
  clearGrace(lobby);
  lobbies.delete(lobby.code);
  return lobby;
}

// Sweep lobbies nobody has touched in half a day, so a long-lived server
// doesn't accumulate abandoned games.
setInterval(() => {
  const cutoff = Date.now() - IDLE_LOBBY_MS;
  for(const lobby of Array.from(lobbies.values())){
    if(lobby.touchedAt < cutoff) endLobby(lobby.code);
  }
}, 60 * 60 * 1000).unref();

module.exports = {
  DJ_GRACE_MS,
  MAX_PHONES,
  createLobby,
  getLobby,
  lobbyForDj,
  lobbyForPhone,
  isFull,
  addPhone,
  removePhone,
  socketForDevice,
  roster,
  startGrace,
  clearGrace,
  resumeLobby,
  endLobby,
  touch,
  count: () => lobbies.size
};
