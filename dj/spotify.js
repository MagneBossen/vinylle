const REDIRECT_URI = window.location.origin + window.location.pathname;
redirectUriField.value = REDIRECT_URI;

const redirectHintEl = document.getElementById('redirectHint');

// The client ID box: once an ID is saved it shows as dots plus the last 4
// characters (enough to check it's the right one), with Change to replace
// it. Empty, it offers a Paste button. The real value stays in the input.
const clientIdInput = document.getElementById('clientId');
const cidPaste = document.getElementById('cidPaste');
const cidSaved = document.getElementById('cidSaved');
const canPaste = !!(window.isSecureContext && navigator.clipboard && navigator.clipboard.readText);

function syncClientIdField(editing){
  if(editing === undefined) editing = document.activeElement === clientIdInput;
  const saved = localStorage.getItem('bs_client_id') || '';
  const masked = !!saved && !editing && clientIdInput.value.trim() === saved;
  cidSaved.hidden = !masked;
  clientIdInput.hidden = masked;
  cidPaste.hidden = masked || !canPaste || !!clientIdInput.value.trim();
  if(masked) document.getElementById('cidMask').textContent = '•'.repeat(12) + saved.slice(-4);
}
function saveClientId(){
  const v = clientIdInput.value.trim();
  if(v) localStorage.setItem('bs_client_id', v);
  else clientIdInput.value = localStorage.getItem('bs_client_id') || '';
  syncClientIdField(false);
}
clientIdInput.addEventListener('input', () => syncClientIdField(true));
clientIdInput.addEventListener('blur', saveClientId);
clientIdInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') clientIdInput.blur(); });
cidPaste.addEventListener('click', async () => {
  try{
    const text = (await navigator.clipboard.readText()).trim();
    if(!text) return;
    clientIdInput.value = text;
    saveClientId();
  }catch(e){
    // Clipboard blocked: fall back to typing/pasting into the box.
    clientIdInput.focus();
  }
});
document.getElementById('cidChange').addEventListener('click', () => {
  clientIdInput.value = '';
  cidSaved.hidden = true;
  clientIdInput.hidden = false;
  clientIdInput.focus();
  syncClientIdField(true);
});

function randomString(len){
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for(let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function base64urlFromBuffer(buf){
  let str = '';
  const bytes = new Uint8Array(buf);
  for(let i=0;i<bytes.length;i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function codeChallengeFromVerifier(verifier){
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlFromBuffer(digest);
}

connectBtn.addEventListener('click', async () => {
  const clientId = document.getElementById('clientId').value.trim();
  if(!clientId){
    setConnState('error', 'enter your client id first');
    return;
  }
  const verifier = randomString(64);
  localStorage.setItem('bs_verifier', verifier);
  localStorage.setItem('bs_client_id', clientId);
  const challenge = await codeChallengeFromVerifier(verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'playlist-read-private playlist-read-collaborative',
    code_challenge_method: 'S256',
    code_challenge: challenge
  });
  window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
});

// Every call to Spotify's login server goes through here: it gives up after
// 15 s instead of hanging, and Disconnect can cancel it. `connGen` goes up on
// every Disconnect, so an answer that arrives afterwards is ignored.
const SPOTIFY_TIMEOUT_MS = 15000;
const spotifyCalls = new Set();
let connGen = 0;
function spotifyFetch(url, opts){
  const ctl = new AbortController();
  spotifyCalls.add(ctl);
  const timer = setTimeout(() => ctl.abort(), SPOTIFY_TIMEOUT_MS);
  return fetch(url, Object.assign({}, opts, { signal: ctl.signal })).finally(() => {
    clearTimeout(timer);
    spotifyCalls.delete(ctl);
  });
}

// Connecting or reconnecting: Disconnect is there too, to stop it.
function setConnecting(text){
  setConnState('pending', text);
  disconnectBtn.style.display = '';
}

async function exchangeCodeForToken(code){
  const verifier = localStorage.getItem('bs_verifier');
  const clientId = localStorage.getItem('bs_client_id');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier
  });
  const res = await spotifyFetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: body.toString()
  });
  if(!res.ok){
    const errText = await res.text();
    throw new Error('token exchange failed: ' + errText);
  }
  const data = await res.json();
  if(data.refresh_token) localStorage.setItem('bs_refresh_token', data.refresh_token);
  return data.access_token;
}

async function refreshAccessToken(){
  const clientId = localStorage.getItem('bs_client_id');
  const refreshToken = localStorage.getItem('bs_refresh_token');
  if(!clientId || !refreshToken) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });
  // A network failure, a timeout or a Disconnect all end up as "no token".
  try{
    const res = await spotifyFetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: body.toString()
    });
    if(!res.ok) return null;
    const data = await res.json();
    if(data.refresh_token) localStorage.setItem('bs_refresh_token', data.refresh_token);
    return data.access_token;
  }catch(e){
    return null;
  }
}

disconnectBtn.addEventListener('click', () => {
  // Also stops a connect or reconnect that's still going.
  connGen++;
  spotifyCalls.forEach(ctl => ctl.abort());
  if(new URLSearchParams(window.location.search).has('code')) window.history.replaceState({}, document.title, REDIRECT_URI);
  localStorage.removeItem('bs_refresh_token');
  localStorage.removeItem('bs_verifier');
  accessToken = null;
  loadPlaylistBtn.disabled = true;
  disconnectBtn.style.display = 'none';
  setConnState('', 'not connected');
});

async function fetchMe(){
  try{
    const res = await spotifyFetch('https://api.spotify.com/v1/me', {headers:{'Authorization':'Bearer ' + accessToken}});
    if(!res.ok) throw new Error();
    const data = await res.json();
    return data.display_name || data.id || null;
  }catch(e){
    return null;
  }
}

async function tryRestoreSession(){
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if(code){
    const clientId = localStorage.getItem('bs_client_id');
    if(clientId) document.getElementById('clientId').value = clientId;
    syncClientIdField();
    const gen = connGen;
    setConnecting('connecting…');
    try{
      const token = await exchangeCodeForToken(code);
      if(gen !== connGen) return;
      accessToken = token;
      window.history.replaceState({}, document.title, REDIRECT_URI);
      const name = await fetchMe();
      if(gen !== connGen) return;
      setConnState('connected', name ? 'connected as ' + name : 'connected');
      loadPlaylistBtn.disabled = false;
      disconnectBtn.style.display = '';
    }catch(err){
      if(gen !== connGen) return;
      setConnState('error', err.name === 'AbortError' ? 'Spotify didn\u2019t answer \u2014 try again' : (err.message || 'connection failed'));
      disconnectBtn.style.display = 'none';
    }
    return;
  }
  const storedClientId = localStorage.getItem('bs_client_id');
  const storedRefresh = localStorage.getItem('bs_refresh_token');
  if(storedClientId) document.getElementById('clientId').value = storedClientId;
  syncClientIdField();
  if(!storedRefresh) return;
  const gen = connGen;
  setConnecting('reconnecting…');
  const token = await refreshAccessToken();
  if(gen !== connGen) return;
  if(token){
    accessToken = token;
    const name = await fetchMe();
    if(gen !== connGen) return;
    setConnState('connected', name ? 'connected as ' + name : 'connected');
    loadPlaylistBtn.disabled = false;
    disconnectBtn.style.display = '';
  }else{
    setConnState('', 'couldn\u2019t reconnect \u2014 connect again');
    disconnectBtn.style.display = 'none';
  }
}
function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Spotify's embed can't hold a login on iOS Safari, and a phone-sized touch
// screen can't run the deck anyway — so the DJ seat is desktop-only. Surfaced
// on the role picker rather than as a banner nobody reads.
function canBeDj(){
  if(isIOS()) return false;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const smallest = Math.min(window.screen.width, window.screen.height);
  return !(coarse && smallest <= 500);
}

tryRestoreSession();

setInterval(async () => {
  if(!localStorage.getItem('bs_refresh_token')) return;
  const gen = connGen;
  const token = await refreshAccessToken();
  if(token && gen === connGen){
    accessToken = token;
    const name = await fetchMe();
    if(gen === connGen) setConnState('connected', name ? 'connected as ' + name : 'connected');
  }
}, 50 * 60 * 1000);

