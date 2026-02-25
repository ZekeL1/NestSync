const socket = io("http://localhost:3000", {
    autoConnect: false
});

// --- 1. Tab Switching ---
const navLinks = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(nav => nav.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active-content'));
        link.classList.add('active');
        const targetContent = document.getElementById(link.getAttribute('data-tab'));
        if (targetContent) targetContent.classList.add('active-content');
    });
});

// --- 2. Toast Helper (Notification) ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

// --- 3. UI & State ---
let currentRoomId = null;
let currentUser = null;
let currentAccessToken = null;
const statusBadge = document.getElementById('status-badge');
const inputRoomId = document.getElementById('input-room-id');

socket.on('connect_error', (error) => {
    showToast(`Socket authentication failed: ${error.message}`);
});

// --- 4. Socket Room Logic ---
socket.on('room-created', (roomId) => {
    currentRoomId = roomId;
    statusBadge.innerText = 'Host';
    statusBadge.className = 'status-pill online';
    inputRoomId.value = roomId;
    showToast(`Room Created: ${roomId}`);
});

socket.on('room-joined', (roomId) => {
    currentRoomId = roomId;
    statusBadge.innerText = 'Connected';
    statusBadge.className = 'status-pill online';
    inputRoomId.value = roomId;
    showToast(`Joined Room: ${roomId}`);
});

// 🌟 新增：对方离开时的处理 (Handle User Left)
socket.on('user-left', () => {
    showToast('Family member left the room');
    // 1. 清除远程视频画面，回到默认背景 (Reset Video Display)
    if (remoteVideo) remoteVideo.srcObject = null;
    // 2. 销毁并重置 WebRTC 连接 (Reset WebRTC Connection)
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
});

document.getElementById('btn-create').addEventListener('click', () => socket.emit('create-room'));
document.getElementById('btn-join').addEventListener('click', () => {
    const id = inputRoomId.value.trim();
    if (id) socket.emit('join-room', id);
});

// --- 5. Auth Logic (使用 showToast 替换 alert) ---
const authOverlay = document.getElementById('auth-overlay');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');

function showRegisterForm() {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
}

function showLoginForm() {
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
}

if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (event) => {
        event.preventDefault();
        showRegisterForm();
    });
}

if (showLoginLink) {
    showLoginLink.addEventListener('click', (event) => {
        event.preventDefault();
        showLoginForm();
    });
}

// --- Auth form switch (Log In <-> Sign Up) ---
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');

if (showRegister) {
  showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    document.getElementById('login-error').innerText = '';
  });
}

if (showLogin) {
  showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    document.getElementById('reg-error').innerText = '';
  });
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    try {
        const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
        const data = await res.json();
        if (data.success) handleLoginSuccess(data.user, data.accessToken);
        else showToast(data.message || 'Login failed (登录失败)'); 
    } catch(e) { showToast('Server connection error (服务器连接失败)'); }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('reg-username').value;
    const p = document.getElementById('reg-password').value;
    const r = document.querySelector('input[name="role"]:checked').value;
    try {
        const res = await fetch('/api/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p, role:r, nickname: document.getElementById('reg-nickname').value, email: document.getElementById('reg-email').value}) });
        const data = await res.json();
        if(data.success) { showToast('Account created successfully.'); showLoginForm(); }
        else showToast(data.message || 'Registration failed (注册失败)');
    } catch(e) { showToast('Server connection error (服务器连接失败)'); }
});

function handleLoginSuccess(user, accessToken) {
    currentUser = user;
    currentAccessToken = accessToken || null;
    authOverlay.style.display = 'none';
    document.getElementById('current-user-name').innerText = user.nickname;
    document.getElementById('current-user-role').innerText = user.role.toUpperCase();
    document.getElementById('current-user-avatar').innerHTML = user.nickname.charAt(0).toUpperCase();

    if (currentAccessToken) {
        socket.auth = { token: currentAccessToken };
        socket.connect();
    } else {
        showToast('Login succeeded but token is missing.');
    }

    const isChild = user.role === 'child';
    document.getElementById('btn-create').style.display = isChild ? 'none' : 'flex';
    document.getElementById('url-control-panel').style.display = isChild ? 'none' : 'flex';
    document.getElementById('cam-controls').style.display = isChild ? 'none' : 'flex';
}

// --- 6. Chat Logic ---
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

function appendMessage(text, type, senderName = '') {
    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;
    div.innerHTML = type === 'remote' ? `<strong>${senderName}</strong>${text}` : text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById('btn-send-chat').addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text || !currentRoomId) return;
    socket.emit('chat-message', { roomId: currentRoomId, message: text, nickname: currentUser ? currentUser.nickname : 'Guest' });
    appendMessage(text, 'local');
    chatInput.value = '';
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('btn-send-chat').click(); });
socket.on('chat-message', (data) => appendMessage(data.message, 'remote', data.nickname));

// --- 7. YouTube Logic ---
let player, isRemoteControl = false, lastTime = 0;
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('youtube-player', {
        height: '100%', width: '100%', videoId: '',
        playerVars: { 'autoplay': 0, 'controls': 1, 'origin': 'http://localhost:3000' },
        events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
    });
};

function onPlayerReady() {
    setInterval(() => {
        if (!player || isRemoteControl) return;
        const currentTime = player.getCurrentTime();
        if (Math.abs(currentTime - lastTime) > 2) socket.emit('seek-video', { roomId: currentRoomId, time: currentTime });
        lastTime = currentTime;
    }, 1000);
}

document.getElementById('btn-load-video').addEventListener('click', () => {
    const url = document.getElementById('input-video-url').value.trim();
    const id = url.match(/(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch\?v=|\&v=))([^#\&\?]*)/)?.[1];
    if (id && currentRoomId) {
        player.loadVideoById(id);
        socket.emit('load-video', { roomId: currentRoomId, url: id });
        document.getElementById('video-empty-state').style.display = 'none';
        document.getElementById('youtube-player').style.display = 'block';
    }
});

function onPlayerStateChange(event) {
    if (isRemoteControl) { setTimeout(() => isRemoteControl = false, 800); return; }
    if (!currentRoomId) return;
    if (event.data === YT.PlayerState.PLAYING) socket.emit('play-video', currentRoomId);
    else if (event.data === YT.PlayerState.PAUSED) socket.emit('pause-video', currentRoomId);
}

socket.on('video-loaded', (id) => {
    isRemoteControl = true; player.loadVideoById(id);
    document.getElementById('video-empty-state').style.display = 'none';
    document.getElementById('youtube-player').style.display = 'block';
});
socket.on('video-played', () => { isRemoteControl = true; player.playVideo(); });
socket.on('video-paused', () => { isRemoteControl = true; player.pauseVideo(); });
socket.on('video-seeked', (time) => { if (Math.abs(player.getCurrentTime() - time) > 1.5) { isRemoteControl = true; player.seekTo(time, true); lastTime = time; } });

// --- 8. WebRTC ---
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
let localStream, peerConnection;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (e) { console.error("Camera Error:", e); }
}

document.getElementById('btn-toggle-mic').addEventListener('click', function() {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    this.style.background = track.enabled ? 'rgba(255,255,255,0.2)' : '#ff7675';
});

document.getElementById('btn-toggle-cam').addEventListener('click', function() {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    this.style.background = track.enabled ? 'rgba(255,255,255,0.2)' : '#ff7675';
});

async function initPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.ontrack = (event) => { remoteVideo.srcObject = event.streams[0]; };
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('webrtc-ice-candidate', { roomId: currentRoomId, candidate: event.candidate });
    };
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

socket.on('user-connected', async () => {
    await initPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc-offer', { roomId: currentRoomId, offer });
});
socket.on('webrtc-offer', async (offer) => {
    if (!peerConnection) await initPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc-answer', { roomId: currentRoomId, answer });
});
socket.on('webrtc-answer', async (answer) => { if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(answer)); });
socket.on('webrtc-ice-candidate', async (candidate) => { if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); });

startCamera();

if (typeof window.initArcadeGames === 'function') {
    window.initArcadeGames({
                socket,
                showToast,
                getCurrentUser: () => currentUser,
        getCurrentRoomId: () => currentRoomId,
        });
}