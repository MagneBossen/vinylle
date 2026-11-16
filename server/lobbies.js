// In-memory lobby store. Nothing here survives a restart — that's intentional,
// games are ephemeral. The DJ's browser is the authority on game state; a lobby
// just holds the last state blob the DJ sent so late joiners can catch up.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — codes get read aloud
const CODE_LENGTH = 6;
const DJ_GRACE_MS = Number(process.env.DJ_GRACE_MS) || 5 * 60 * 1000;
const MAX_PHONES = 12;
const IDLE_LOBBY_MS = 12 * 60 * 60 * 1000;

const crypto = require('crypto');

const lobbies = new Map();

// Codes and DJ secrets are what stand between a stranger and someone's game,
// so they come from the OS's CSPRNG, not Math.random().
function randomToken(len, alphabet){
  let out = '';
  for(let i = 0; i < len; i++){
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

function sameSecret(a, b){
  if(typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const SECRET_ALPHABET = CODE_ALPHABET + 'abcdefghijkmnpqrstuvwxyz';
const SECRET_LENGTH = 24;

function allFrom(str, alphabet, len){
  if(typeof str !== 'string' || str.length !== len) return false;
  for(const ch of str){ if(!alphabet.includes(ch)) return false; }
  return true;
}

function freshCode(){
  let code;
  do { code = randomToken(CODE_LENGTH, CODE_ALPHABET); } while(lobbies.has(code));
  return code;
}

// `code` and `djSecret` are given only when a restart wiped a lobby and its DJ
// comes back with the pair it held (see restoreLobby).
function createLobby(djSocketId, code, djSecret){
  code = code || freshCode();
  const lobby = {
    code,
    djSecret: djSecret || randomToken(SECRET_LENGTH, SECRET_ALPHABET),
    djSocketId,
    state: null,
    phones: new Map(),   // socketId -> {deviceId, name}
    peekers: new Map(),  // socketId -> deviceId, for phones still on the name screen
    pids: new Map(),     // deviceId -> public id; phones only ever see the public one
    graceTimer: null,
    graceEndsAt: null,
    createdAt: Date.now(),
    touchedAt: Date.now()
  };
  lobbies.set(code, lobby);
  return lobby;
}

function getLobby(code){
  if(typeof code !== 'string' || !code || code.length > 16) return null;
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

// The DJ went away. Hold the lobby open for DJ_GRACE_MS before pulling the plug.
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
  if(!lobby || !sameSecret(lobby.djSecret, djSecret)) return null;
  clearGrace(lobby);
  lobby.djSocketId = djSocketId;
  touch(lobby);
  return lobby;
}

// After a server restart the DJ page reconnects with the code + secret it saved.
// If nothing holds that code, recreate the lobby under it so the phones'
// retries find it. A code that is live (wrong secret) is never touched.
function restoreLobby(code, djSecret, djSocketId){
  if(!allFrom(code, CODE_ALPHABET, CODE_LENGTH)) return null;
  if(!allFrom(djSecret, SECRET_ALPHABET, SECRET_LENGTH)) return null;
  if(lobbies.has(code)) return null;
  return createLobby(djSocketId, code, djSecret);
}

function endLobby(code){
  const lobby = getLobby(code);
  if(!lobby) return null;
  clearGrace(lobby);
  lobbies.delete(lobby.code);
  return lobby;
}

// Lobbies nobody has touched in half a day, so a long-lived server doesn't
// accumulate abandoned games. The caller closes them (so phones are told).
function idleLobbies(){
  const cutoff = Date.now() - IDLE_LOBBY_MS;
  return Array.from(lobbies.values()).filter(l => l.touchedAt < cutoff);
}

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
  restoreLobby,
  idleLobbies,
  endLobby,
  touch,
  count: () => lobbies.size
};
