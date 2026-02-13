const socket = io("http://localhost:3000"); 

// --- 1. UI Tabs & Room Logic ---
const navLinks = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(nav => nav.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active-content'));
        link.classList.add('active');
        document.getElementById(link.getAttribute('data-tab')).classList.add('active-content');
    });
});

const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const inputRoomId = document.getElementById('input-room-id');
const statusBadge = document.getElementById('status-badge');
const createFeedback = document.getElementById('create-feedback');

let currentRoomId = null;

socket.on('room-created', (roomId) => {
    currentRoomId = roomId;
    statusBadge.innerText = 'Online (Host)';
    statusBadge.className = 'badge badge-online';
    createFeedback.innerHTML = `Room ID: <strong>${roomId}</strong>`;
});

socket.on('room-joined', (roomId) => {
    currentRoomId = roomId;
    statusBadge.innerText = 'Connected: ' + roomId;
    statusBadge.className = 'badge badge-online';
});

btnCreate.addEventListener('click', () => socket.emit('create-room'));
btnJoin.addEventListener('click', () => {
    const id = inputRoomId.value.trim();
    if(id) socket.emit('join-room', id);
});

// --- 2. YouTube Sync Core ---
const videoEmptyState = document.getElementById('video-empty-state');
const inputVideoUrl = document.getElementById('input-video-url');
const btnLoadVideo = document.getElementById('btn-load-video');

let isRemoteControl = false;
let player;
let lastTime = 0;
let timeMonitor;

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

function onPlayerReady(event) {
    timeMonitor = setInterval(() => {
        if (player && player.getCurrentTime && !isRemoteControl) {
            const currentTime = player.getCurrentTime();
            if (Math.abs(currentTime - lastTime) > 2) {
                socket.emit('seek-video', { roomId: currentRoomId, time: currentTime });
            }
            lastTime = currentTime;
        }
    }, 500);
}

function extractYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

btnLoadVideo.addEventListener('click', () => {
    const id = extractYouTubeID(inputVideoUrl.value.trim());
    if (id && currentRoomId) {
        player.loadVideoById(id);
        document.getElementById('youtube-player').style.display = 'block';
        videoEmptyState.style.display = 'none';
        socket.emit('load-video', { roomId: currentRoomId, url: id });
    }
});

function onPlayerStateChange(event) {
    if (isRemoteControl) {
        setTimeout(() => isRemoteControl = false, 1000);
        return;
    }
    if (!currentRoomId) return;
    if (event.data === YT.PlayerState.PLAYING) socket.emit('play-video', currentRoomId);
    else if (event.data === YT.PlayerState.PAUSED) socket.emit('pause-video', currentRoomId);
}

socket.on('video-loaded', (id) => {
    isRemoteControl = true;
    player.loadVideoById(id);
    document.getElementById('youtube-player').style.display = 'block';
    videoEmptyState.style.display = 'none';
});

socket.on('video-played', () => { isRemoteControl = true; player.playVideo(); });
socket.on('video-paused', () => { isRemoteControl = true; player.pauseVideo(); });
socket.on('video-seeked', (time) => {
    if (Math.abs(player.getCurrentTime() - time) > 1.5) {
        isRemoteControl = true;
        player.seekTo(time, true);
        lastTime = time;
    }
});

// --- 3. 🌟 WebRTC Camera & Voice (优化部分) ---
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const localPlaceholder = document.getElementById('local-placeholder');
const remotePlaceholder = document.getElementById('remote-placeholder');

let localStream;
let peerConnection;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// 初始化本地媒体 (Init Local Media)
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 360 }, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        localPlaceholder.style.display = 'none';
        localVideo.style.display = 'block';
    } catch (e) { console.error("Camera Error:", e); }
}

// 初始化 P2P 连接 (Setup P2P Connection)
async function initPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // 接收远程流 (Handle Remote Stream)
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        remotePlaceholder.style.display = 'none';
        remoteVideo.style.display = 'block';
    };

    // 发送网络候选信息 (Handle ICE)
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', { roomId: currentRoomId, candidate: event.candidate });
        }
    };

    // 添加本地轨道 (Add Tracks)
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

// 信令处理 (Signaling Handlers)
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

socket.on('webrtc-answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('webrtc-ice-candidate', async (candidate) => {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

// 控制按钮逻辑 (Camera/Mic Toggles)
document.getElementById('btn-toggle-mic').addEventListener('click', function() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    this.innerHTML = audioTrack.enabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
});

document.getElementById('btn-toggle-cam').addEventListener('click', function() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    this.innerHTML = videoTrack.enabled ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
});

// 启动
startCamera();