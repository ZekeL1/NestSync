const socket = io("http://localhost:3000");

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
const statusBadge = document.getElementById('status-badge');
const inputRoomId = document.getElementById('input-room-id');

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

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    try {
        const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
        const data = await res.json();
        if (data.success) handleLoginSuccess(data.user);
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
        if(data.success) { showToast('Account created! (账号已创建)'); registerForm.style.display='none'; loginForm.style.display='block'; }
        else showToast(data.message || 'Registration failed (注册失败)');
    } catch(e) { showToast('Server connection error (服务器连接失败)'); }
});

function handleLoginSuccess(user) {
    currentUser = user;
    authOverlay.style.display = 'none';
    document.getElementById('current-user-name').innerText = user.nickname;
    document.getElementById('current-user-role').innerText = user.role.toUpperCase();
    document.getElementById('current-user-avatar').innerHTML = user.nickname.charAt(0).toUpperCase();

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

// --- 9. Tales (local only: story list + reader, no sync) ---
const TALES = {
    cinderella: {
        title: 'Cinderella',
        pages: [
            { text: 'Once upon a time, there lived a kind girl named Cinderella. Her stepmother and stepsisters were very mean and made her work all day in the kitchen.', image: 'images/tales/cinderella-1.png' },
            { text: 'One day the King invited all the young ladies to a grand ball. Cinderella had no fine dress, but her fairy godmother appeared and turned a pumpkin into a coach and gave her a beautiful gown.', image: 'images/tales/cinderella-2.png' },
            { text: 'At the ball, the Prince danced only with Cinderella. At midnight she had to run away and lost one glass slipper. The Prince searched the kingdom to find the girl whose foot fit the slipper.', image: 'images/tales/cinderella-3.png' },
            { text: 'When the Prince came to Cinderella\'s house, the slipper fit her perfectly. They were married and lived happily ever after.', image: 'images/tales/cinderella-4.png' }
        ]
    },
    peterpan: {
        title: 'Peter Pan',
        pages: [
            { text: 'Peter Pan is a boy who never grows up. He lives in Neverland with the Lost Boys, fairies, and pirates. One night he flew to the Darling family\'s nursery.', image: 'images/tales/peterpan-1.png' },
            { text: 'Peter taught Wendy, John, and Michael to fly with a little fairy dust and happy thoughts. Together they flew over London to Neverland.', image: 'images/tales/peterpan-2.png' },
            { text: 'In Neverland they met the Lost Boys and had many adventures. But the pirate Captain Hook wanted to defeat Peter Pan and caused much trouble.', image: 'images/tales/peterpan-3.png' },
            { text: 'In the end, Peter and the children beat Captain Hook. Wendy and her brothers flew home. Peter stayed in Neverland forever, young and free.', image: 'images/tales/peterpan-4.png' }
        ]
    },
    littlered: {
        title: 'Little Red Riding Hood',
        pages: [
            { text: 'Little Red Riding Hood lived with her mother near the woods. One day her mother asked her to take a basket of food to her sick grandmother on the other side of the forest.', image: 'images/tales/littlered-1.png' },
            { text: 'On the path she met a wolf. The wolf asked where she was going. She told him about her grandmother. The wolf ran ahead to the cottage and pretended to be the grandmother.', image: 'images/tales/littlered-2.png' },
            { text: 'When Little Red arrived, she noticed the wolf\'s big eyes and ears. "What big teeth you have!" she said. The wolf jumped up, but a woodcutter heard the noise and came to save her.', image: 'images/tales/littlered-3.png' },
            { text: 'The woodcutter chased the wolf away. Little Red Riding Hood and her grandmother were safe. She learned never to talk to strangers in the woods again.', image: 'images/tales/littlered-4.png' }
        ]
    }
};

const talesGrid = document.getElementById('tales-grid');
const talesReader = document.getElementById('tales-reader');
const talesReaderClose = document.getElementById('tales-reader-close');
const talesPageIllustration = document.getElementById('tales-page-illustration');
const talesReaderStoryTitle = document.getElementById('tales-reader-story-title');
const talesPageText = document.getElementById('tales-page-text');
const talesPageIndicator = document.getElementById('tales-page-indicator');
const talesBtnPrev = document.getElementById('tales-btn-prev');
const talesBtnNext = document.getElementById('tales-btn-next');

let currentTaleId = null;
let currentTalePage = 0;

function openTale(storyId) {
    const tale = TALES[storyId];
    if (!tale) return;
    currentTaleId = storyId;
    currentTalePage = 0;
    talesReaderStoryTitle.textContent = tale.title;
    const talesTab = talesReader.parentElement;
    talesTab.scrollTop = 0;
    talesReader.hidden = false;
    talesTab.classList.add('tales-reader-open');
    renderTalePage();
}

function closeTale() {
    talesReader.hidden = true;
    talesReader.parentElement.classList.remove('tales-reader-open');
    currentTaleId = null;
    currentTalePage = 0;
}

function renderTalePage() {
    const tale = currentTaleId ? TALES[currentTaleId] : null;
    if (!tale) return;
    const page = tale.pages[currentTalePage];
    if (!page) return;
    talesPageText.textContent = page.text;
    talesPageIllustration.style.backgroundImage = page.image ? `url(${page.image})` : 'none';
    talesPageIndicator.textContent = `${currentTalePage + 1} / ${tale.pages.length}`;
    talesBtnPrev.disabled = currentTalePage === 0;
    talesBtnNext.disabled = currentTalePage === tale.pages.length - 1;
}

talesGrid.querySelectorAll('.story-card').forEach(card => {
    card.addEventListener('click', () => openTale(card.getAttribute('data-story')));
});
talesReaderClose.addEventListener('click', closeTale);
talesBtnPrev.addEventListener('click', () => {
    if (currentTaleId && currentTalePage > 0) {
        currentTalePage--;
        renderTalePage();
    }
});
talesBtnNext.addEventListener('click', () => {
    if (currentTaleId && TALES[currentTaleId] && currentTalePage < TALES[currentTaleId].pages.length - 1) {
        currentTalePage++;
        renderTalePage();
    }
});