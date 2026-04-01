const socket = io("http://localhost:3000", { autoConnect: false });

const navLinks = document.querySelectorAll(".nav-links li");
const tabContents = document.querySelectorAll(".tab-content");
const statusBadge = document.getElementById("status-badge");
const inputRoomId = document.getElementById("input-room-id");
const authOverlay = document.getElementById("auth-overlay");
const joinRoomButton = document.getElementById("btn-join");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const forgotForm = document.getElementById("forgot-form");
const resetForm = document.getElementById("reset-form");

const showRegisterLink = document.getElementById("show-register");
const showLoginLink = document.getElementById("show-login");
const showForgotLink = document.getElementById("show-forgot");
const backToLoginFromForgot = document.getElementById("back-to-login-from-forgot");
const backToLoginFromReset = document.getElementById("back-to-login-from-reset");
const skipLoginButton = document.getElementById("skip-login");
const guestLoginButton = document.getElementById("guest-login-button");

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
let isIntentionalReconnect = false;
let pendingRoomCreation = false;

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const projectPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;
const usernamePattern = /^[A-Za-z0-9_.-]{3,32}$/;

let roomPasswordModalResolver = null;

/**
 * Replaces window.prompt (blocked in Electron with "prompt() is and will not be supported").
 * @param {{ title?: string, hint?: string, placeholder?: string, canSubmitEmpty?: boolean }} options
 * @returns {Promise<string | null>} trimmed password, or null if cancelled
 */
function openRoomPasswordModal(options = {}) {
  const title = options.title || "Password";
  const hint = options.hint || "";
  const placeholder = options.placeholder || "";
  const canSubmitEmpty = options.canSubmitEmpty !== false;

  return new Promise((resolve) => {
    const modal = document.getElementById("room-password-modal");
    const titleEl = document.getElementById("room-password-modal-title");
    const hintEl = document.getElementById("room-password-modal-hint");
    const input = document.getElementById("room-password-modal-input");
    if (!modal || !titleEl || !hintEl || !input) {
      resolve(null);
      return;
    }

    roomPasswordModalResolver = resolve;
    titleEl.textContent = title;
    if (hint) {
      hintEl.textContent = hint;
      hintEl.hidden = false;
    } else {
      hintEl.textContent = "";
      hintEl.hidden = true;
    }
    input.placeholder = placeholder || (canSubmitEmpty ? "Optional — leave empty for none" : "Required");
    input.value = "";
    modal.dataset.canSubmitEmpty = canSubmitEmpty ? "true" : "false";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => input.focus(), 50);
  });
}

function finishRoomPasswordModal(value) {
  const modal = document.getElementById("room-password-modal");
  if (modal) {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }
  const res = roomPasswordModalResolver;
  roomPasswordModalResolver = null;
  if (res) res(value);
}

(function setupRoomPasswordModal() {
  const modal = document.getElementById("room-password-modal");
  const input = document.getElementById("room-password-modal-input");
  const ok = document.getElementById("room-password-modal-ok");
  const cancel = document.getElementById("room-password-modal-cancel");
  if (!modal || !input || !ok || !cancel) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) finishRoomPasswordModal(null);
  });

  cancel.addEventListener("click", () => finishRoomPasswordModal(null));

  ok.addEventListener("click", () => {
    const canSubmitEmpty = modal.dataset.canSubmitEmpty === "true";
    const pw = String(input.value || "").trim();
    if (!canSubmitEmpty && !pw) {
      showToast("Enter room password.");
      return;
    }
    finishRoomPasswordModal(pw);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ok.click();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal || modal.hidden) return;
    e.preventDefault();
    finishRoomPasswordModal(null);
  });
})();

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

function validateProjectPassword(password) {
  return projectPasswordPattern.test(String(password || ""));
}

function setButtonPending(button, pending, pendingText) {
  if (!button) return;
  if (pending) {
    button.dataset.originalText = button.textContent;
    button.textContent = pendingText || "Please wait...";
    button.disabled = true;
    return;
  }
  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
  button.disabled = false;
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

function updateJoinButtonMode(inRoom) {
  if (!joinRoomButton) return;
  joinRoomButton.innerHTML = inRoom
    ? '<i class="fa-solid fa-right-from-bracket"></i>'
    : '<i class="fa-solid fa-arrow-right-to-bracket"></i>';
  joinRoomButton.title = inRoom ? "Leave Room" : "Join";
  joinRoomButton.classList.toggle("leave-mode", inRoom);
}

function setLobbyStatus() {
  if (currentRoomId) return;
  if (currentAccessToken && socket.connected) {
    statusBadge.innerText = "Connected";
    statusBadge.className = "status-pill online";
    return;
  }
  statusBadge.innerText = "Offline";
  statusBadge.className = "status-pill offline";
}

function setRoomConnectedState(label) {
  statusBadge.innerText = label;
  statusBadge.className = "status-pill online";
  updateJoinButtonMode(true);
}

function resetRoomUi() {
  inputRoomId.value = "";
  updateJoinButtonMode(false);
  setLobbyStatus();
}

let resendTimerIntervalId = null;

function clearResendTimer() {
  if (resendTimerIntervalId) {
    clearInterval(resendTimerIntervalId);
    resendTimerIntervalId = null;
  }
  const btn = document.getElementById("btn-resend-code");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Resend";
  }
}

function startResendCountdown(seconds) {
  if (resendTimerIntervalId) {
    clearInterval(resendTimerIntervalId);
    resendTimerIntervalId = null;
  }
  const btn = document.getElementById("btn-resend-code");
  if (!btn) return;
  btn.disabled = true;
  let remaining = seconds;
  btn.textContent = `Resend (${remaining}s)`;
  resendTimerIntervalId = setInterval(() => {
    remaining--;
    btn.textContent = `Resend (${remaining}s)`;
    if (remaining <= 0) {
      clearInterval(resendTimerIntervalId);
      resendTimerIntervalId = null;
      btn.disabled = false;
      btn.textContent = "Resend";
    }
  }, 1000);
}

function showOnlyForm(formKey) {
  const forms = {
    login: loginForm,
    register: registerForm,
    forgot: forgotForm,
    reset: resetForm
  };

  if (formKey !== "reset") clearResendTimer();

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
  const isParent = role === "parent";
  document.getElementById("btn-create").style.display = isParent ? "flex" : "none";
  document.getElementById("url-control-panel").style.display = isParent ? "flex" : "none";
  document.getElementById("cam-controls").style.display = isParent ? "flex" : "none";
  if (guestLoginButton) {
    guestLoginButton.style.display = role === "guest" ? "inline-flex" : "none";
  }
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

  setLobbyStatus();
}

function enterGuestMode() {
  currentUser = {
    id: null,
    username: "guest",
    nickname: "Guest",
    role: "guest",
    email: null
  };
  currentAccessToken = null;

  authOverlay.style.display = "none";
  document.getElementById("current-user-name").innerText = "Guest";
  document.getElementById("current-user-role").innerText = "GUEST";
  document.getElementById("current-user-avatar").innerText = "G";

  applyRoleVisibility("guest");
  activateTab("cinema");
  resetRoomUi();
  showToast("Entered guest mode. Online sync stays disabled until you log in.");
}

function reopenLogin() {
  authOverlay.style.display = "flex";
  showOnlyForm("login");
}

function resetChatPanel() {
  if (!chatMessages) return;
  chatMessages.innerHTML = '<div class="chat-msg system"><span>Welcome to chat!</span></div>';
}

function cleanupRoomSession() {
  currentRoomId = null;
  resetRoomUi();
  resetChatPanel();
  if (remoteVideo) remoteVideo.srcObject = null;
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

function leaveCurrentRoom() {
  const roomId = currentRoomId;
  if (!roomId) return;

  cleanupRoomSession();

  if (socket.connected) {
    isIntentionalReconnect = true;
    socket.emit("leave-room", roomId);
    socket.disconnect();
    if (currentAccessToken) {
      socket.connect();
    }
  }

  showToast("Left the room.");
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

if (skipLoginButton) {
  skipLoginButton.addEventListener("click", () => {
    enterGuestMode();
  });
}

if (guestLoginButton) {
  guestLoginButton.addEventListener("click", () => {
    reopenLogin();
  });
}

const btnResendCode = document.getElementById("btn-resend-code");
if (btnResendCode) {
  btnResendCode.addEventListener("click", async () => {
    const identifier = document.getElementById("reset-identifier").value.trim();
    const principalPayload = toAuthPrincipalPayload(identifier);
    if (!principalPayload) {
      showToast("Username or email is required.");
      return;
    }
    try {
      btnResendCode.disabled = true;
      btnResendCode.textContent = "Sending...";
      const data = await requestJson("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(principalPayload)
      });
      if (!data.success) throw new Error(data.message || "Failed to send reset code");
      startResendCountdown(60);
      showToast(data.message || "Reset code sent. Check your email.");
    } catch (error) {
      showToast(error.message);
      btnResendCode.disabled = false;
      btnResendCode.textContent = "Resend";
    }
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  const principal = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const principalPayload = toAuthPrincipalPayload(principal);

  if (!principalPayload || !password) {
    showToast("Username/email and password are required.");
    return;
  }

  try {
    setButtonPending(submitButton, true, "Logging in...");
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
    if (String(error.message || "").includes("Invalid credentials")) {
      showToast("Login failed: account not found or password incorrect. If users were reset, please sign up again.");
    } else {
      showToast(error.message);
    }
  } finally {
    setButtonPending(submitButton, false);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = registerForm.querySelector('button[type="submit"]');
  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const nickname = document.getElementById("reg-nickname").value.trim();
  const password = document.getElementById("reg-password").value;
  const role = document.querySelector('input[name="role"]:checked').value;

  if (!usernamePattern.test(username)) {
    showToast("Username must be 3-32 characters and use letters, numbers, dot, underscore, or hyphen.");
    return;
  }

  if (!validateProjectPassword(password)) {
    showToast("Password must be at least 6 characters and include at least one letter and one number.");
    return;
  }

  try {
    setButtonPending(submitButton, true, "Creating...");
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
  } finally {
    setButtonPending(submitButton, false);
  }
});

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = forgotForm.querySelector('button[type="submit"]');
  const identifier = document.getElementById("forgot-identifier").value.trim();
  const principalPayload = toAuthPrincipalPayload(identifier);

  if (!principalPayload) {
    showToast("Username or email is required.");
    return;
  }

  try {
    setButtonPending(submitButton, true, "Sending...");
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
    startResendCountdown(60);
    showToast(data.message || "Reset code sent. Check your email.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonPending(submitButton, false);
  }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = resetForm.querySelector('button[type="submit"]');
  const identifier = document.getElementById("reset-identifier").value.trim();
  const code = document.getElementById("reset-code").value.trim();
  const newPassword = document.getElementById("reset-new-password").value;
  const principalPayload = toAuthPrincipalPayload(identifier);

  if (!principalPayload || !code || !newPassword) {
    showToast("Username/email, verification code, and new password are required.");
    return;
  }

  if (!validateProjectPassword(newPassword)) {
    showToast("New password must be at least 6 characters and include at least one letter and one number.");
    return;
  }

  try {
    setButtonPending(submitButton, true, "Resetting...");
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
  } finally {
    setButtonPending(submitButton, false);
  }
});

navLinks.forEach((link) => {
  link.addEventListener("click", async () => {
    const targetTab = link.getAttribute("data-tab");

    try {
      if (targetTab === "games" && currentAccessToken) {
        const result = await callFeatureEndpoint("/features/open-games");
        if (result.message) showToast(result.message);
      }

      if (targetTab === "tales" && currentAccessToken) {
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
  isIntentionalReconnect = false;
  setLobbyStatus();
  showToast(`Socket authentication failed: ${error.message}`);
});

socket.on("connect", () => {
  isIntentionalReconnect = false;
  setLobbyStatus();
});

socket.on("disconnect", () => {
  if (isIntentionalReconnect && currentAccessToken) {
    return;
  }
  setLobbyStatus();
});

socket.on("server:error", (payload) => {
  const message = payload && payload.error ? payload.error : "Server rejected the action.";
  showToast(message);
});

socket.on("room-joined", async (roomId) => {
  currentRoomId = roomId;
  inputRoomId.value = roomId;
  const wasHost = pendingRoomCreation;
  if (pendingRoomCreation) {
    setRoomConnectedState("Host");
    pendingRoomCreation = false;
  } else {
    setRoomConnectedState("Connected");
  }
  showToast(wasHost ? `Room created: ${roomId}` : `Joined room: ${roomId}`);
  await loadChatHistory(roomId);
});

socket.on("room-left", () => {
  cleanupRoomSession();
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
    if (!currentAccessToken) {
      showToast("Please log in to create a room.");
      return;
    }
    await callFeatureEndpoint("/features/control-playback");
    const pw = await openRoomPasswordModal({
      title: "Optional room password",
      hint: "Leave empty if you do not want a password on this room.",
      canSubmitEmpty: true
    });
    if (pw === null) return;
    const body = {};
    if (pw && String(pw).trim()) body.password = String(pw).trim();
    pendingRoomCreation = true;
    const data = await requestJson("/api/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentAccessToken}`
      },
      body: JSON.stringify(body)
    });
    if (!data.success) throw new Error(data.message || "Failed to create room");
    socket.emit("join-room", { roomId: data.roomId });
  } catch (error) {
    pendingRoomCreation = false;
    showToast(error.message);
  }
});

if (joinRoomButton) {
  joinRoomButton.addEventListener("click", async () => {
    if (currentRoomId) {
      leaveCurrentRoom();
      return;
    }

    const roomId = inputRoomId.value.trim();
    if (!roomId) return;
    if (!currentAccessToken) {
      showToast("Please log in to join a room.");
      return;
    }

    let password;
    try {
      const meta = await requestJson(
        `/api/rooms/${encodeURIComponent(roomId)}/meta`,
        {
          headers: { Authorization: `Bearer ${currentAccessToken}` }
        }
      );
      if (!meta.exists) {
        showToast("Room not found.");
        return;
      }
      if (meta.requiresPassword) {
        const pw = await openRoomPasswordModal({
          title: "Room password",
          hint: "This room is password protected.",
          canSubmitEmpty: false
        });
        if (pw === null) return;
        password = pw;
      }
    } catch (error) {
      showToast(error.message);
      return;
    }

    socket.emit("join-room", { roomId, password });
  });
}

async function loadChatHistory(roomId) {
  if (!currentAccessToken || !roomId) return;
  try {
    const data = await requestJson(
      `/api/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        headers: { Authorization: `Bearer ${currentAccessToken}` }
      }
    );
    resetChatPanel();
    for (const m of data.messages || []) {
      const isLocal = currentUser && m.senderId === currentUser.id;
      appendMessage(m.text, isLocal ? "local" : "remote", m.nickname || "");
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (error) {
    showToast(error.message);
  }
}

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

const TALES = {
  cinderella: {
    title: "Cinderella",
    pages: [
      {
        text: "Once upon a time, there lived a kind girl named Cinderella. Her stepmother and stepsisters were very mean and made her work all day in the kitchen.",
        image: "images/tales/cinderella-1.png"
      },
      {
        text: "One day the King invited all the young ladies to a grand ball. Cinderella had no fine dress, but her fairy godmother appeared and turned a pumpkin into a coach and gave her a beautiful gown.",
        image: "images/tales/cinderella-2.png"
      },
      {
        text: "At the ball, the Prince danced only with Cinderella. At midnight she had to run away and lost one glass slipper. The Prince searched the kingdom to find the girl whose foot fit the slipper.",
        image: "images/tales/cinderella-3.png"
      },
      {
        text: "When the Prince came to Cinderella's house, the slipper fit her perfectly. They were married and lived happily ever after.",
        image: "images/tales/cinderella-4.png"
      }
    ]
  },
  peterpan: {
    title: "Peter Pan",
    pages: [
      {
        text: "Peter Pan is a boy who never grows up. He lives in Neverland with the Lost Boys, fairies, and pirates. One night he flew to the Darling family's nursery.",
        image: "images/tales/peterpan-1.png"
      },
      {
        text: "Peter taught Wendy, John, and Michael to fly with a little fairy dust and happy thoughts. Together they flew over London to Neverland.",
        image: "images/tales/peterpan-2.png"
      },
      {
        text: "In Neverland they met the Lost Boys and had many adventures. But the pirate Captain Hook wanted to defeat Peter Pan and caused much trouble.",
        image: "images/tales/peterpan-3.png"
      },
      {
        text: "In the end, Peter and the children beat Captain Hook. Wendy and her brothers flew home. Peter stayed in Neverland forever, young and free.",
        image: "images/tales/peterpan-4.png"
      }
    ]
  },
  littlered: {
    title: "Little Red Riding Hood",
    pages: [
      {
        text: "Little Red Riding Hood lived with her mother near the woods. One day her mother asked her to take a basket of food to her sick grandmother on the other side of the forest.",
        image: "images/tales/littlered-1.png"
      },
      {
        text: "On the path she met a wolf. The wolf asked where she was going. She told him about her grandmother. The wolf ran ahead to the cottage and pretended to be the grandmother.",
        image: "images/tales/littlered-2.png"
      },
      {
        text: "When Little Red arrived, she noticed the wolf's big eyes and ears. 'What big teeth you have!' she said. The wolf jumped up, but a woodcutter heard the noise and came to save her.",
        image: "images/tales/littlered-3.png"
      },
      {
        text: "The woodcutter chased the wolf away. Little Red Riding Hood and her grandmother were safe. She learned never to talk to strangers in the woods again.",
        image: "images/tales/littlered-4.png"
      }
    ]
  }
};

const talesGrid = document.getElementById("tales-grid");
const talesReader = document.getElementById("tales-reader");
const talesReaderClose = document.getElementById("tales-reader-close");
const talesPageIllustration = document.getElementById("tales-page-illustration");
const talesReaderStoryTitle = document.getElementById("tales-reader-story-title");
const talesPageText = document.getElementById("tales-page-text");
const talesPageIndicator = document.getElementById("tales-page-indicator");
const talesBtnPrev = document.getElementById("tales-btn-prev");
const talesBtnNext = document.getElementById("tales-btn-next");
const talesBtnRead = document.getElementById("tales-btn-read");

let currentTaleId = null;
let currentTalePage = 0;

function stopTaleSpeech() {
  if (typeof window.speechSynthesis !== "undefined") {
    window.speechSynthesis.cancel();
  }
  if (talesBtnRead) {
    talesBtnRead.innerHTML = '<i class="fa-solid fa-volume-high"></i> Read Aloud';
    talesBtnRead.classList.remove("tales-read-active");
  }
}

function readCurrentPageAloud() {
  if (typeof window.speechSynthesis === "undefined") {
    showToast("Read aloud is not supported in this environment.");
    return;
  }
  const tale = currentTaleId ? TALES[currentTaleId] : null;
  if (!tale) return;
  const page = tale.pages[currentTalePage];
  if (!page || !page.text) return;

  if (window.speechSynthesis.speaking) {
    stopTaleSpeech();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(page.text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.onend = () => {
    if (talesBtnRead) {
      talesBtnRead.innerHTML = '<i class="fa-solid fa-volume-high"></i> Read Aloud';
      talesBtnRead.classList.remove("tales-read-active");
    }
  };
  utterance.onerror = () => {
    stopTaleSpeech();
  };

  window.speechSynthesis.speak(utterance);
  if (talesBtnRead) {
    talesBtnRead.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
    talesBtnRead.classList.add("tales-read-active");
  }
}

function openTale(storyId) {
  const tale = TALES[storyId];
  if (!tale || !talesReader || !talesReaderStoryTitle) return;
  stopTaleSpeech();
  currentTaleId = storyId;
  currentTalePage = 0;
  talesReaderStoryTitle.textContent = tale.title;
  const talesTab = talesReader.parentElement;
  if (talesTab) {
    talesTab.scrollTop = 0;
    talesTab.classList.add("tales-reader-open");
  }
  talesReader.hidden = false;
  renderTalePage();
}

function closeTale() {
  if (!talesReader) return;
  stopTaleSpeech();
  talesReader.hidden = true;
  if (talesReader.parentElement) {
    talesReader.parentElement.classList.remove("tales-reader-open");
  }
  currentTaleId = null;
  currentTalePage = 0;
}

function renderTalePage() {
  const tale = currentTaleId ? TALES[currentTaleId] : null;
  if (!tale) return;
  const page = tale.pages[currentTalePage];
  if (!page) return;
  stopTaleSpeech();
  if (talesPageText) talesPageText.textContent = page.text;
  if (talesPageIllustration) {
    talesPageIllustration.style.backgroundImage = page.image ? `url(${page.image})` : "none";
  }
  if (talesPageIndicator) {
    talesPageIndicator.textContent = `${currentTalePage + 1} / ${tale.pages.length}`;
  }
  if (talesBtnPrev) talesBtnPrev.disabled = currentTalePage === 0;
  if (talesBtnNext) talesBtnNext.disabled = currentTalePage === tale.pages.length - 1;
}

if (talesGrid) {
  talesGrid.querySelectorAll(".story-card").forEach((card) => {
    card.addEventListener("click", () => openTale(card.getAttribute("data-story")));
  });
}
if (talesReaderClose) talesReaderClose.addEventListener("click", closeTale);
if (talesBtnPrev) {
  talesBtnPrev.addEventListener("click", () => {
    if (currentTaleId && currentTalePage > 0) {
      currentTalePage -= 1;
      renderTalePage();
    }
  });
}
if (talesBtnNext) {
  talesBtnNext.addEventListener("click", () => {
    const tale = currentTaleId ? TALES[currentTaleId] : null;
    if (tale && currentTalePage < tale.pages.length - 1) {
      currentTalePage += 1;
      renderTalePage();
    }
  });
}
if (talesBtnRead) {
  talesBtnRead.addEventListener("click", readCurrentPageAloud);
}

if (typeof window.initArcadeGames === "function") {
  window.initArcadeGames({
    socket,
    showToast,
    getCurrentUser: () => currentUser,
    getCurrentRoomId: () => currentRoomId
  });
}
