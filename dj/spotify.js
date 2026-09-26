const REDIRECT_URI = window.location.origin + window.location.pathname;
redirectUriField.value = REDIRECT_URI;

const redirectHintEl = document.getElementById('redirectHint');

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
  const res = await fetch('https://accounts.spotify.com/api/token', {
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
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: body.toString()
  });
  if(!res.ok) return null;
  const data = await res.json();
  if(data.refresh_token) localStorage.setItem('bs_refresh_token', data.refresh_token);
  return data.access_token;
}

disconnectBtn.addEventListener('click', () => {
  localStorage.removeItem('bs_refresh_token');
  localStorage.removeItem('bs_verifier');
  accessToken = null;
  loadPlaylistBtn.disabled = true;
  disconnectBtn.style.display = 'none';
  setConnState('', 'not connected');
});

async function fetchMe(){
  try{
    const res = await fetch('https://api.spotify.com/v1/me', {headers:{'Authorization':'Bearer ' + accessToken}});
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
    setConnState('pending', 'connecting…');
    try{
      accessToken = await exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, REDIRECT_URI);
      const name = await fetchMe();
      setConnState('connected', name ? 'connected as ' + name : 'connected');
      loadPlaylistBtn.disabled = false;
      disconnectBtn.style.display = '';
    }catch(err){
      setConnState('error', err.message || 'connection failed');
    }
    return;
  }
  const storedClientId = localStorage.getItem('bs_client_id');
  const storedRefresh = localStorage.getItem('bs_refresh_token');
  if(storedClientId) document.getElementById('clientId').value = storedClientId;
  if(!storedRefresh) return;
  setConnState('pending', 'reconnecting…');
  const token = await refreshAccessToken();
  if(token){
    accessToken = token;
    const name = await fetchMe();
    setConnState('connected', name ? 'connected as ' + name : 'connected');
    loadPlaylistBtn.disabled = false;
    disconnectBtn.style.display = '';
  }else{
    setConnState('', 'not connected');
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
  const token = await refreshAccessToken();
  if(token){
    accessToken = token;
    const name = await fetchMe();
    setConnState('connected', name ? 'connected as ' + name : 'connected');
  }
}, 50 * 60 * 1000);

