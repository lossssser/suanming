const API_ENDPOINT = "https://api.shxgjqaq.com/trpg";
const PLAYER_ID_KEY = "shisan_trpg_player_id";
const PLAYER_NAME_KEY = "shisan_trpg_player_name";
const ROOM_KEY = "shisan_trpg_room";

const playerId = getOrCreatePlayerId();
const lobbyView = document.querySelector("#lobbyView");
const gameView = document.querySelector("#gameView");
const playerNameInput = document.querySelector("#playerName");
const roomCodeInput = document.querySelector("#roomCodeInput");
const lobbyStatus = document.querySelector("#lobbyStatus");
const createRoomButton = document.querySelector("#createRoomButton");
const joinRoomButton = document.querySelector("#joinRoomButton");
const roomCodeLabel = document.querySelector("#roomCodeLabel");
const copyRoomButton = document.querySelector("#copyRoomButton");
const gameStatusBadge = document.querySelector("#gameStatusBadge");
const syncStatus = document.querySelector("#syncStatus");
const playersList = document.querySelector("#playersList");
const ownerControls = document.querySelector("#ownerControls");
const startGameButton = document.querySelector("#startGameButton");
const pauseGameButton = document.querySelector("#pauseGameButton");
const resetGameButton = document.querySelector("#resetGameButton");
const leaveRoomButton = document.querySelector("#leaveRoomButton");
const sceneTitle = document.querySelector("#sceneTitle");
const turnHint = document.querySelector("#turnHint");
const messageList = document.querySelector("#messageList");
const pendingCheckPanel = document.querySelector("#pendingCheck");
const checkTitle = document.querySelector("#checkTitle");
const checkDescription = document.querySelector("#checkDescription");
const rollCheckButton = document.querySelector("#rollCheckButton");
const actionForm = document.querySelector("#actionForm");
const actionInput = document.querySelector("#actionInput");
const actionStatus = document.querySelector("#actionStatus");
const quickDie = document.querySelector("#quickDie");
const quickRollButton = document.querySelector("#quickRollButton");
const sendActionButton = document.querySelector("#sendActionButton");
const characterName = document.querySelector("#characterName");
const characterHp = document.querySelector("#characterHp");
const characterSan = document.querySelector("#characterSan");
const characterBackground = document.querySelector("#characterBackground");
const characterSkills = document.querySelector("#characterSkills");
const characterInventory = document.querySelector("#characterInventory");
const characterStatus = document.querySelector("#characterStatus");
const presetList = document.querySelector("#presetList");
const cluesList = document.querySelector("#cluesList");
const playerNotes = document.querySelector("#playerNotes");
const notesStatus = document.querySelector("#notesStatus");
const notesCounter = document.querySelector("#notesCounter");

let roomCode = "";
let room = null;
let pollTimer = null;
let requestBusy = false;
let notesTimer = null;
let lastMessageSignature = "";
let cardLoadedFor = "";

playerNameInput.value = localStorage.getItem(PLAYER_NAME_KEY) || "";
roomCodeInput.value = new URLSearchParams(location.search).get("room") || localStorage.getItem(ROOM_KEY) || "";

createRoomButton.addEventListener("click", createRoom);
joinRoomButton.addEventListener("click", joinRoom);
copyRoomButton.addEventListener("click", copyRoomCode);
startGameButton.addEventListener("click", () => runAction("start"));
pauseGameButton.addEventListener("click", togglePause);
resetGameButton.addEventListener("click", resetRoom);
leaveRoomButton.addEventListener("click", leaveRoom);
actionForm.addEventListener("submit", sendAction);
quickRollButton.addEventListener("click", () => rollDice(quickDie.value));
rollCheckButton.addEventListener("click", rollPendingCheck);
presetList.addEventListener("click", selectPreset);
playerNotes.addEventListener("input", scheduleNotesSave);
document.querySelector(".mobile-tabs").addEventListener("click", switchMobilePanel);
document.querySelector(".panel-tabs").addEventListener("click", switchSideTab);

if (roomCodeInput.value && playerNameInput.value) joinRoom();
setMobilePanel("scene");

async function createRoom() {
  const name = requirePlayerName();
  if (!name) return;
  setLobbyBusy(true, "正在创建云端房间...");
  try {
    const data = await post({ action: "create", playerId, name });
    enterRoom(data.room);
  } catch (error) {
    setLobbyBusy(false, error.message, true);
  }
}

async function joinRoom() {
  const name = requirePlayerName();
  if (!name) return;
  const code = normalizeRoomCode(roomCodeInput.value);
  if (!code) {
    lobbyStatus.textContent = "请输入房间码。";
    roomCodeInput.focus();
    return;
  }
  setLobbyBusy(true, "正在加入房间...");
  try {
    const data = await post({ action: "join", room: code, playerId, name });
    enterRoom(data.room);
  } catch (error) {
    setLobbyBusy(false, error.message, true);
  }
}

function enterRoom(nextRoom) {
  roomCode = nextRoom.code;
  localStorage.setItem(ROOM_KEY, roomCode);
  localStorage.setItem(PLAYER_NAME_KEY, playerNameInput.value.trim());
  history.replaceState(null, "", `trpg.html?room=${encodeURIComponent(roomCode)}`);
  lobbyView.hidden = true;
  gameView.hidden = false;
  room = nextRoom;
  renderRoom();
  startPolling();
}

function leaveRoom() {
  clearInterval(pollTimer);
  pollTimer = null;
  roomCode = "";
  room = null;
  localStorage.removeItem(ROOM_KEY);
  history.replaceState(null, "", "trpg.html");
  gameView.hidden = true;
  lobbyView.hidden = false;
  setLobbyBusy(false, "");
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshRoom, 2500);
}

async function refreshRoom() {
  if (!roomCode || requestBusy) return;
  try {
    const response = await fetch(`${API_ENDPOINT}?room=${encodeURIComponent(roomCode)}&playerId=${encodeURIComponent(playerId)}`, {
      cache: "no-store",
    });
    const data = await readResponse(response);
    room = data.room;
    syncStatus.textContent = "刚刚同步";
    renderRoom();
  } catch (error) {
    syncStatus.textContent = `同步失败：${error.message}`;
  }
}

async function runAction(action, extra = {}) {
  if (!roomCode || requestBusy) return null;
  requestBusy = true;
  setGameControlsDisabled(true);
  try {
    const data = await post({ action, room: roomCode, playerId, ...extra });
    room = data.room;
    renderRoom();
    return data;
  } catch (error) {
    actionStatus.textContent = error.message;
    throw error;
  } finally {
    requestBusy = false;
    setGameControlsDisabled(false);
  }
}

async function sendAction(event) {
  event.preventDefault();
  const text = actionInput.value.trim();
  if (!text) return;
  actionStatus.textContent = "AI 主持正在思考...";
  sendActionButton.disabled = true;
  try {
    await runAction("send", { text });
    actionInput.value = "";
    actionStatus.textContent = "";
  } catch {
    // Error is already shown by runAction.
  } finally {
    sendActionButton.disabled = false;
  }
}

async function rollDice(expression, checkId = "") {
  actionStatus.textContent = "正在投骰并等待 AI 裁定...";
  try {
    await runAction("roll", { expression, checkId });
    actionStatus.textContent = "";
  } catch {
    // Error is already shown by runAction.
  }
}

function rollPendingCheck() {
  if (!room?.pendingCheck) return;
  rollDice(room.pendingCheck.expression, room.pendingCheck.id);
}

function togglePause() {
  runAction(room?.status === "paused" ? "resume" : "pause");
}

function resetRoom() {
  if (confirm("确定重开房间吗？聊天、人物卡和存档都会清空。")) runAction("reset");
}

async function selectPreset(event) {
  const button = event.target.closest("[data-preset-id]");
  if (!button || button.disabled || room?.status !== "lobby") return;
  characterStatus.textContent = "正在锁定角色...";
  try {
    await runAction("selectPreset", { presetId: button.dataset.presetId });
    characterStatus.textContent = "角色已选择。开始前仍可改选未被占用的角色。";
  } catch {
    characterStatus.textContent = "角色选择失败。";
  }
}

function scheduleNotesSave() {
  notesCounter.textContent = `${playerNotes.value.length} / 10000`;
  notesStatus.textContent = "保存中...";
  clearTimeout(notesTimer);
  notesTimer = setTimeout(async () => {
    try {
      await runAction("saveNotes", { notes: playerNotes.value });
      notesStatus.textContent = "云端已保存";
    } catch {
      notesStatus.textContent = "保存失败";
    }
  }, 700);
}

function renderRoom() {
  if (!room) return;
  roomCodeLabel.textContent = room.code;
  gameStatusBadge.textContent = statusLabel(room.status);
  sceneTitle.textContent = room.sceneTitle || "未命名场景";
  turnHint.textContent = room.aiThinking ? "AI 正在思考" : "AI 主持";
  ownerControls.hidden = !room.isOwner;
  startGameButton.hidden = !["lobby", "ended"].includes(room.status);
  pauseGameButton.hidden = !["playing", "paused"].includes(room.status);
  pauseGameButton.textContent = room.status === "paused" ? "继续" : "暂停";
  actionInput.disabled = room.status !== "playing" || room.aiThinking;
  sendActionButton.disabled = actionInput.disabled;
  quickRollButton.disabled = room.status !== "playing" || Boolean(room.pendingCheck);

  playersList.innerHTML = room.players.map((player) => `<article class="player-item">
    <strong>${escapeHtml(player.name)} ${player.isYou ? "<span>你</span>" : ""}</strong>
    <span>${escapeHtml(player.characterName || "尚未填写人物卡")} · HP ${player.hp} · SAN ${player.san}</span>
    ${player.isOwner ? '<span class="player-badge">房间创建者</span>' : ""}
  </article>`).join("");

  const signature = room.messages.map((message) => message.id).join("|");
  messageList.innerHTML = room.messages.length
    ? room.messages.map(renderMessage).join("")
    : '<div class="empty-message">等待房间开始。</div>';
  if (signature !== lastMessageSignature) {
    lastMessageSignature = signature;
    requestAnimationFrame(() => { messageList.scrollTop = messageList.scrollHeight; });
  }

  renderPendingCheck();
  renderPresets();
  renderCharacter();
  renderClues();
}

function renderMessage(message) {
  const typeClass = `message-${message.type || "system"}`;
  const privateClass = message.private ? " message-private" : "";
  return `<article class="message ${typeClass}${privateClass}">
    <header><strong>${escapeHtml(message.author || "系统")}</strong><time>${escapeHtml(formatTime(message.createdAt))}</time></header>
    <p>${escapeHtml(message.content || "")}</p>
  </article>`;
}

function renderPendingCheck() {
  const check = room.pendingCheck;
  const canRoll = check && check.playerId === playerId;
  pendingCheckPanel.hidden = !canRoll;
  if (!canRoll) return;
  checkTitle.textContent = `${check.skill || "行动"}检定 · D100 / ${check.target ?? "?"}`;
  const diceText = check.bonusDice > 0
    ? `奖励骰 ${check.bonusDice}`
    : check.bonusDice < 0 ? `惩罚骰 ${Math.abs(check.bonusDice)}` : "无奖惩骰";
  checkDescription.textContent = `${check.reason || "请投骰决定行动结果。"} 难度：${check.difficulty || "普通"}，${diceText}`;
}

function renderPresets() {
  presetList.innerHTML = (room.presets || []).map((preset) => {
    const selected = room.myPresetId === preset.id;
    const disabled = preset.takenBy && !selected;
    return `<button class="preset-card${selected ? " is-selected" : ""}" type="button"
      data-preset-id="${escapeHtml(preset.id)}" ${disabled || room.status !== "lobby" ? "disabled" : ""}>
      <strong>${escapeHtml(preset.name)}</strong>
      <span>${escapeHtml(preset.age)} 岁 · ${escapeHtml(preset.occupation)}</span>
      <span>${disabled ? `已由 ${escapeHtml(preset.takenBy)} 选择` : escapeHtml(preset.specialty)}</span>
    </button>`;
  }).join("");
}

function renderCharacter() {
  const card = room.myCharacter || {};
  const signature = `${room.code}:${JSON.stringify(card)}`;
  if (cardLoadedFor === signature) return;
  if (document.activeElement && document.querySelector("[data-side-content='card']").contains(document.activeElement)) return;
  cardLoadedFor = signature;
  characterName.value = card.name || "";
  characterHp.value = card.hp ?? 10;
  characterSan.value = card.san ?? 10;
  characterBackground.value = card.background || "";
  characterSkills.value = formatCharacterStats(card);
  characterInventory.value = card.inventory || "";
  playerNotes.value = room.myNotes || "";
  notesCounter.textContent = `${playerNotes.value.length} / 10000`;
}

function formatCharacterStats(card) {
  const attributes = card.attributes || {};
  const skills = card.skills || {};
  const attributeText = Object.entries(attributes).map(([name, value]) => `${name} ${value}`).join(" · ");
  const skillText = Object.entries(skills).map(([name, value]) => `${name} ${value}`).join("\n");
  return [attributeText, skillText].filter(Boolean).join("\n\n");
}

function renderClues() {
  cluesList.innerHTML = room.myClues?.length
    ? room.myClues.map((clue) => `<article class="clue-card"><strong>${escapeHtml(clue.title)}</strong><p>${escapeHtml(clue.content)}</p></article>`).join("")
    : '<div class="empty-message">还没有获得线索。</div>';
}

function switchMobilePanel(event) {
  const button = event.target.closest("[data-tab]");
  if (button) setMobilePanel(button.dataset.tab);
}

function setMobilePanel(name) {
  document.querySelectorAll(".mobile-tabs button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-mobile-active", panel.dataset.panel === name);
  });
}

function switchSideTab(event) {
  const button = event.target.closest("[data-side-tab]");
  if (!button) return;
  document.querySelectorAll("[data-side-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
  document.querySelectorAll("[data-side-content]").forEach((content) => {
    content.hidden = content.dataset.sideContent !== button.dataset.sideTab;
  });
}

async function copyRoomCode() {
  await navigator.clipboard.writeText(roomCode);
  copyRoomButton.textContent = "已复制";
  setTimeout(() => { copyRoomButton.textContent = "复制"; }, 1200);
}

function requirePlayerName() {
  const name = playerNameInput.value.trim();
  if (!name) {
    lobbyStatus.textContent = "请先输入玩家昵称。";
    playerNameInput.focus();
    return "";
  }
  return name;
}

function setLobbyBusy(busy, message, isError = false) {
  createRoomButton.disabled = busy;
  joinRoomButton.disabled = busy;
  lobbyStatus.textContent = message;
  lobbyStatus.style.color = isError ? "#cf222e" : "";
}

function setGameControlsDisabled(disabled) {
  startGameButton.disabled = disabled;
  pauseGameButton.disabled = disabled;
  resetGameButton.disabled = disabled;
  rollCheckButton.disabled = disabled;
  quickRollButton.disabled = disabled;
}

async function post(body) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readResponse(response);
  if (!data.room) {
    throw new Error("Cloudflare API Worker 尚未更新，请部署最新版 worker.js。");
  }
  return data;
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：HTTP ${response.status}`);
  return data;
}

function statusLabel(status) {
  return ({ lobby: "等待开始", playing: "冒险进行中", paused: "已暂停", ended: "已结束" })[status] || status;
}

function normalizeRoomCode(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}
