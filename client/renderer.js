const socket = io("http://localhost:3000", { autoConnect: false });

const navLinks = document.querySelectorAll(".nav-links li");
const tabContents = document.querySelectorAll(".tab-content");
const statusBadge = document.getElementById("status-badge");
const inputRoomId = document.getElementById("input-room-id");
const authOverlay = document.getElementById("auth-overlay");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const forgotForm = document.getElementById("forgot-form");
const resetForm = document.getElementById("reset-form");

const showRegisterLink = document.getElementById("show-register");
const showLoginLink = document.getElementById("show-login");
const showForgotLink = document.getElementById("show-forgot");
const backToLoginFromForgot = document.getElementById("back-to-login-from-forgot");
const backToLoginFromReset = document.getElementById("back-to-login-from-reset");

const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

let currentRoomId = null;
let currentUser = null;
let currentAccessToken = null;
let player = null;
let isRemoteControl = false;
let lastTime = 0;
let localStream = null;
let peerConnection = null;

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function toAuthPrincipalPayload(identifier) {
  const text = (identifier || "").trim();
  if (!text) return null;
  return text.includes("@") ? { email: text } : { username: text };
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error("Server connection failed. Make sure backend is running.");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error)) ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload || {};
}

function activateTab(targetTabId) {
  navLinks.forEach((nav) => nav.classList.remove("active"));
  tabContents.forEach((content) => content.classList.remove("active-content"));

  const selectedLink = Array.from(navLinks).find(
    (link) => link.getAttribute("data-tab") === targetTabId
  );
  if (selectedLink) selectedLink.classList.add("active");

  const targetContent = document.getElementById(targetTabId);
  if (targetContent) targetContent.classList.add("active-content");
}

function showOnlyForm(formKey) {
  const forms = {
    login: loginForm,
    register: registerForm,
    forgot: forgotForm,
    reset: resetForm
  };

  Object.entries(forms).forEach(([key, form]) => {
    if (!form) return;
    form.style.display = key === formKey ? "block" : "none";
  });
}

async function callFeatureEndpoint(path) {
  if (!currentAccessToken) {
    throw new Error("Missing access token. Please log in again.");
  }

  return requestJson(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentAccessToken}`
    }
  });
}

function applyRoleVisibility(role) {
  const isChild = role === "child";
  document.getElementById("btn-create").style.display = isChild ? "none" : "flex";
  document.getElementById("url-control-panel").style.display = isChild ? "none" : "flex";
  document.getElementById("cam-controls").style.display = isChild ? "none" : "flex";
}

async function loadProfileFromMe() {
  if (!currentAccessToken) return null;

  try {
    const me = await requestJson("/me", {
      headers: { Authorization: `Bearer ${currentAccessToken}` }
    });
    return {
      id: me.userId || null,
      username: me.username || null,
      nickname: me.displayName || me.username || "User",
      role: me.role || null,
      email: me.email || null
    };
  } catch (error) {
    showToast(`Profile validation failed: ${error.message}`);
    return null;
  }
}

function handleLoginSuccess(user, accessToken) {
  currentUser = user;
  currentAccessToken = accessToken || null;

  authOverlay.style.display = "none";
  document.getElementById("current-user-name").innerText = user.nickname || user.username || "User";
  document.getElementById("current-user-role").innerText = (user.role || "unknown").toUpperCase();
  document.getElementById("current-user-avatar").innerText = (user.nickname || user.username || "U")
    .charAt(0)
    .toUpperCase();

  applyRoleVisibility(user.role);
  activateTab("cinema");

  if (currentAccessToken) {
    socket.auth = { token: currentAccessToken };
    socket.connect();
  } else {
    showToast("Login succeeded but access token is missing.");
  }
}

showRegisterLink.addEventListener("click", (event) => {
  event.preventDefault();
  showOnlyForm("register");
});

showLoginLink.addEventListener("click", (event) => {
  event.preventDefault();
  showOnlyForm("login");
});

showForgotLink.addEventListener("click", (event) => {
  event.preventDefault();
  showOnlyForm("forgot");
});

backToLoginFromForgot.addEventListener("click", (event) => {
  event.preventDefault();
  showOnlyForm("login");
});

backToLoginFromReset.addEventListener("click", (event) => {
  event.preventDefault();
  showOnlyForm("login");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const principal = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const principalPayload = toAuthPrincipalPayload(principal);

  if (!principalPayload || !password) {
    showToast("Username/email and password are required.");
    return;
  }

  try {
    const data = await requestJson("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...principalPayload, password })
    });

    if (!data.success) {
      throw new Error(data.message || "Login failed");
    }

    const profile = await loadProfileFromMe();
    const mergedUser = {
      ...data.user,
      ...(profile || {})
    };

    handleLoginSuccess(mergedUser, data.accessToken);
    showToast(`Welcome back, ${mergedUser.nickname || mergedUser.username}.`);
  } catch (error) {
    showToast(error.message);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const nickname = document.getElementById("reg-nickname").value.trim();
  const password = document.getElementById("reg-password").value;
  const role = document.querySelector('input[name="role"]:checked').value;

  try {
    const data = await requestJson("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, nickname, password, role })
    });

    if (!data.success) {
      throw new Error(data.message || "Registration failed");
    }

    showToast(
      data.message ||
        "Account created. Cognito should send a verification/invitation email."
    );
    registerForm.reset();
    showOnlyForm("login");
  } catch (error) {
    showToast(error.message);
  }
});

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const identifier = document.getElementById("forgot-identifier").value.trim();
  const principalPayload = toAuthPrincipalPayload(identifier);

  if (!principalPayload) {
    showToast("Username or email is required.");
    return;
  }

  try {
    const data = await requestJson("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(principalPayload)
    });

    if (!data.success) {
      throw new Error(data.message || "Failed to send reset code");
    }

    document.getElementById("reset-identifier").value = identifier;
    showOnlyForm("reset");
    showToast(data.message || "Reset code sent. Check your email.");
  } catch (error) {
    showToast(error.message);
  }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const identifier = document.getElementById("reset-identifier").value.trim();
  const code = document.getElementById("reset-code").value.trim();
  const newPassword = document.getElementById("reset-new-password").value;
  const principalPayload = toAuthPrincipalPayload(identifier);

  if (!principalPayload || !code || !newPassword) {
    showToast("Username/email, verification code, and new password are required.");
    return;
  }

  try {
    const data = await requestJson("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...principalPayload, code, newPassword })
    });

    if (!data.success) {
      throw new Error(data.message || "Password reset failed");
    }

    showToast(data.message || "Password has been reset successfully.");
    resetForm.reset();
    forgotForm.reset();
    showOnlyForm("login");
  } catch (error) {
    showToast(error.message);
  }
});

navLinks.forEach((link) => {
  link.addEventListener("click", async () => {
    const targetTab = link.getAttribute("data-tab");

    try {
      if (targetTab === "games") {
        const result = await callFeatureEndpoint("/features/open-games");
        if (result.message) showToast(result.message);
      }

      if (targetTab === "tales") {
        const result = await callFeatureEndpoint("/features/open-fairy-tales");
        if (result.message) showToast(result.message);
      }

      activateTab(targetTab);
    } catch (error) {
      showToast(error.message);
      activateTab("cinema");
    }
  });
});

socket.on("connect_error", (error) => {
  showToast(`Socket authentication failed: ${error.message}`);
});

socket.on("server:error", (payload) => {
  const message = payload && payload.error ? payload.error : "Server rejected the action.";
  showToast(message);
});

socket.on("room-created", (roomId) => {
  currentRoomId = roomId;
  statusBadge.innerText = "Host";
  statusBadge.className = "status-pill online";
  inputRoomId.value = roomId;
  showToast(`Room created: ${roomId}`);
});

socket.on("room-joined", (roomId) => {
  currentRoomId = roomId;
  statusBadge.innerText = "Connected";
  statusBadge.className = "status-pill online";
  inputRoomId.value = roomId;
  showToast(`Joined room: ${roomId}`);
});

socket.on("user-left", () => {
  showToast("Family member left the room.");
  if (remoteVideo) remoteVideo.srcObject = null;
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
});

document.getElementById("btn-create").addEventListener("click", async () => {
  try {
    await callFeatureEndpoint("/features/control-playback");
    socket.emit("create-room");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("btn-join").addEventListener("click", () => {
  const roomId = inputRoomId.value.trim();
  if (!roomId) return;
  socket.emit("join-room", roomId);
});

function appendMessage(text, type, senderName = "") {
  const div = document.createElement("div");
  div.className = `chat-msg ${type}`;
  div.innerHTML = type === "remote" ? `<strong>${senderName}</strong>${text}` : text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById("btn-send-chat").addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text || !currentRoomId) return;

  socket.emit("chat-message", {
    roomId: currentRoomId,
    message: text,
    nickname: currentUser ? currentUser.nickname : "Guest"
  });
  appendMessage(text, "local");
  chatInput.value = "";
});

chatInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    document.getElementById("btn-send-chat").click();
  }
});

socket.on("chat-message", (data) => appendMessage(data.message, "remote", data.nickname));

const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  player = new YT.Player("youtube-player", {
    height: "100%",
    width: "100%",
    videoId: "",
    playerVars: { autoplay: 0, controls: 1, origin: "http://localhost:3000" },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange }
  });
};

function onPlayerReady() {
  setInterval(() => {
    if (!player || isRemoteControl || !currentRoomId || !currentUser) return;
    if (currentUser.role !== "parent") return;

    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - lastTime) > 2) {
      socket.emit("seek-video", { roomId: currentRoomId, time: currentTime });
    }
    lastTime = currentTime;
  }, 1000);
}

document.getElementById("btn-load-video").addEventListener("click", async () => {
  const url = document.getElementById("input-video-url").value.trim();
  const videoId = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch\?v=|\&v=))([^#\&\?]*)/
  )?.[1];

  if (!videoId || !currentRoomId) return;

  try {
    await callFeatureEndpoint("/features/control-playback");
    player.loadVideoById(videoId);
    socket.emit("load-video", { roomId: currentRoomId, url: videoId });
    document.getElementById("video-empty-state").style.display = "none";
    document.getElementById("youtube-player").style.display = "block";
  } catch (error) {
    showToast(error.message);
  }
});

function onPlayerStateChange(event) {
  if (isRemoteControl) {
    setTimeout(() => {
      isRemoteControl = false;
    }, 800);
    return;
  }

  if (!currentRoomId || !currentUser || currentUser.role !== "parent") return;

  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit("play-video", currentRoomId);
  } else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit("pause-video", currentRoomId);
  }
}

socket.on("video-loaded", (videoId) => {
  if (!player) return;
  isRemoteControl = true;
  player.loadVideoById(videoId);
  document.getElementById("video-empty-state").style.display = "none";
  document.getElementById("youtube-player").style.display = "block";
});

socket.on("video-played", () => {
  if (!player) return;
  isRemoteControl = true;
  player.playVideo();
});

socket.on("video-paused", () => {
  if (!player) return;
  isRemoteControl = true;
  player.pauseVideo();
});

socket.on("video-seeked", (time) => {
  if (!player) return;
  if (Math.abs(player.getCurrentTime() - time) > 1.5) {
    isRemoteControl = true;
    player.seekTo(time, true);
    lastTime = time;
  }
});

async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (error) {
    console.error("Camera error:", error);
  }
}

document.getElementById("btn-toggle-mic").addEventListener("click", function onToggleMic() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  this.style.background = track.enabled ? "rgba(255,255,255,0.2)" : "#ff7675";
});

document.getElementById("btn-toggle-cam").addEventListener("click", function onToggleCam() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  this.style.background = track.enabled ? "rgba(255,255,255,0.2)" : "#ff7675";
});

async function initPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
  peerConnection.onicecandidate = (event) => {
    if (!event.candidate) return;
    socket.emit("webrtc-ice-candidate", {
      roomId: currentRoomId,
      candidate: event.candidate
    });
  };

  if (!localStream) return;
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
}

socket.on("user-connected", async () => {
  await initPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("webrtc-offer", { roomId: currentRoomId, offer });
});

socket.on("webrtc-offer", async (offer) => {
  if (!peerConnection) await initPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("webrtc-answer", { roomId: currentRoomId, answer });
});

socket.on("webrtc-answer", async (answer) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("webrtc-ice-candidate", async (candidate) => {
  if (!peerConnection) return;
  await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

showOnlyForm("login");
activateTab("cinema");
startCamera();

if (typeof window.initArcadeGames === "function") {
  window.initArcadeGames({
    socket,
    showToast,
    getCurrentUser: () => currentUser,
    getCurrentRoomId: () => currentRoomId
  });
}
