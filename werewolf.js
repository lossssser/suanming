const API_BASE = "https://api.shxgjqaq.com";
const PLAYER_KEY = "werewolf_player_id";
const NAME_KEY = "werewolf_player_name";

const state = {
  room: "",
  playerId: localStorage.getItem(PLAYER_KEY) || crypto.randomUUID(),
  name: localStorage.getItem(NAME_KEY) || "",
  snapshot: null,
};

localStorage.setItem(PLAYER_KEY, state.playerId);

const els = {
  entryPanel: document.querySelector("#entryPanel"),
  roomPanel: document.querySelector("#roomPanel"),
  playerName: document.querySelector("#playerName"),
  roomCode: document.querySelector("#roomCode"),
  createRoom: document.querySelector("#createRoom"),
  joinRoom: document.querySelector("#joinRoom"),
  currentRoom: document.querySelector("#currentRoom"),
  phaseName: document.querySelector("#phaseName"),
  phaseHint: document.querySelector("#phaseHint"),
  myRole: document.querySelector("#myRole"),
  myRoleHint: document.querySelector("#myRoleHint"),
  hostActions: document.querySelector("#hostActions"),
  startGame: document.querySelector("#startGame"),
  nextPhase: document.querySelector("#nextPhase"),
  resetGame: document.querySelector("#resetGame"),
  players: document.querySelector("#players"),
  actionArea: document.querySelector("#actionArea"),
  eventLog: document.querySelector("#eventLog"),
};

els.playerName.value = state.name;

els.createRoom.addEventListener("click", async () => {
  await run(async () => {
    saveName();
    const data = await apiPost({ action: "create", playerId: state.playerId, name: state.name });
    enterRoom(data.room.code);
  });
});

els.joinRoom.addEventListener("click", async () => {
  await run(async () => {
    saveName();
    const code = els.roomCode.value.trim().toUpperCase();
    const data = await apiPost({ action: "join", room: code, playerId: state.playerId, name: state.name });
    enterRoom(data.room.code);
  });
});

els.startGame.addEventListener("click", () => run(() => apiPost({ action: "start", room: state.room, playerId: state.playerId }).then(refresh)));
els.nextPhase.addEventListener("click", () => run(() => apiPost({ action: "next", room: state.room, playerId: state.playerId }).then(refresh)));
els.resetGame.addEventListener("click", () => run(() => apiPost({ action: "reset", room: state.room, playerId: state.playerId }).then(refresh)));

function saveName() {
  state.name = els.playerName.value.trim() || "游客";
  localStorage.setItem(NAME_KEY, state.name);
}

function enterRoom(code) {
  state.room = code;
  els.currentRoom.textContent = code;
  els.entryPanel.classList.add("hidden");
  els.roomPanel.classList.remove("hidden");
  refresh();
}

async function refresh() {
  if (!state.room) return;
  const data = await apiGet(state.room, state.playerId);
  state.snapshot = data.room;
  render();
}

function render() {
  const room = state.snapshot;
  if (!room) return;

  els.currentRoom.textContent = room.code;
  els.phaseName.textContent = room.phaseName;
  els.phaseHint.textContent = room.phaseHint;
  els.myRole.textContent = room.myRole || "未发牌";
  els.myRoleHint.textContent = room.myRoleHint || "开始后这里会显示你的身份。";
  els.hostActions.classList.toggle("hidden", !room.isHost);
  els.startGame.disabled = room.status !== "lobby";
  els.nextPhase.disabled = room.status === "lobby" || room.status === "ended";
  els.resetGame.disabled = room.status === "lobby";

  els.players.innerHTML = room.players.map((player) => `
    <div class="player-card">
      <strong>${escapeHtml(player.name)}${player.isYou ? "（你）" : ""}${player.isHost ? " · 房主" : ""}</strong>
      <span>${player.readyText}</span>
    </div>
  `).join("");

  els.eventLog.innerHTML = room.events.length
    ? room.events.map((item) => `<p>${escapeHtml(item)}</p>`).join("")
    : "<p>暂无记录。</p>";

  renderAction(room);
}

function renderAction(room) {
  if (room.status === "lobby") {
    els.actionArea.innerHTML = `<p>等待玩家加入：${room.players.length}/7。满 7 人后房主可开始。</p>`;
    return;
  }

  if (room.status === "day") {
    els.actionArea.innerHTML = `
      <p>现在进入白天讨论。根据夜晚信息发言，最后投票选出你认为应该出局的人。</p>
      <div class="action-row">
        <select id="voteTarget">${playerOptions(room.players, true)}</select>
        <button class="primary" id="voteBtn" type="button">投票</button>
      </div>
      ${room.voteText ? `<div class="result-box">${escapeHtml(room.voteText)}</div>` : ""}
    `;
    document.querySelector("#voteBtn").addEventListener("click", () => {
      const targetId = document.querySelector("#voteTarget").value;
      run(() => apiPost({ action: "vote", room: state.room, playerId: state.playerId, targetId }).then(refresh));
    });
    return;
  }

  if (room.status === "ended") {
    els.actionArea.innerHTML = `<div class="result-box">${room.finalText.map(escapeHtml).join("<br>")}</div>`;
    return;
  }

  const action = room.availableAction;
  if (!action) {
    els.actionArea.innerHTML = `<p>${escapeHtml(room.waitText || "等待当前角色行动。")}</p>`;
    return;
  }

  if (action.type === "info") {
    els.actionArea.innerHTML = `
      <div class="result-box">${escapeHtml(action.text)}</div>
      <button class="primary" id="doneBtn" type="button">我已确认</button>
    `;
    document.querySelector("#doneBtn").addEventListener("click", () => {
      run(() => apiPost({ action: "roleAction", room: state.room, playerId: state.playerId, payload: { type: "done" } }).then(refresh));
    });
    return;
  }

  if (action.type === "seer") {
    els.actionArea.innerHTML = `
      <p>预言家：查看一名玩家身份，或查看两张中央牌。</p>
      <div class="action-row">
        <select id="seerMode">
          <option value="player">查看玩家</option>
          <option value="center">查看中央牌 1 和 2</option>
        </select>
        <select id="seerTarget">${playerOptions(room.players, false)}</select>
        <button class="primary" id="actBtn" type="button">确认</button>
      </div>
    `;
    document.querySelector("#seerMode").addEventListener("change", (event) => {
      document.querySelector("#seerTarget").disabled = event.target.value === "center";
    });
    document.querySelector("#actBtn").addEventListener("click", () => {
      run(() => apiPost({
        action: "roleAction",
        room: state.room,
        playerId: state.playerId,
        payload: {
          type: "seer",
          mode: document.querySelector("#seerMode").value,
          targetId: document.querySelector("#seerTarget").value,
        },
      }).then(refresh));
    });
    return;
  }

  if (action.type === "one-player") {
    els.actionArea.innerHTML = `
      <p>${escapeHtml(action.text)}</p>
      <div class="action-row">
        <select id="targetA">${playerOptions(room.players, false)}</select>
        <button class="primary" id="actBtn" type="button">确认</button>
      </div>
    `;
    document.querySelector("#actBtn").addEventListener("click", () => {
      run(() => apiPost({ action: "roleAction", room: state.room, playerId: state.playerId, payload: { type: action.role, targetId: document.querySelector("#targetA").value } }).then(refresh));
    });
    return;
  }

  if (action.type === "two-players") {
    els.actionArea.innerHTML = `
      <p>${escapeHtml(action.text)}</p>
      <div class="action-row">
        <select id="targetA">${playerOptions(room.players, false)}</select>
        <select id="targetB">${playerOptions(room.players, false)}</select>
        <button class="primary" id="actBtn" type="button">确认</button>
      </div>
    `;
    document.querySelector("#actBtn").addEventListener("click", () => {
      run(() => apiPost({
        action: "roleAction",
        room: state.room,
        playerId: state.playerId,
        payload: { type: "troublemaker", targetA: document.querySelector("#targetA").value, targetB: document.querySelector("#targetB").value },
      }).then(refresh));
    });
    return;
  }

  if (action.type === "center") {
    els.actionArea.innerHTML = `
      <p>${escapeHtml(action.text)}</p>
      <div class="action-row">
        <select id="centerCard">
          <option value="0">中央牌 1</option>
          <option value="1">中央牌 2</option>
          <option value="2">中央牌 3</option>
        </select>
        <button class="primary" id="actBtn" type="button">确认</button>
      </div>
    `;
    document.querySelector("#actBtn").addEventListener("click", () => {
      run(() => apiPost({ action: "roleAction", room: state.room, playerId: state.playerId, payload: { type: "drunk", centerIndex: Number(document.querySelector("#centerCard").value) } }).then(refresh));
    });
  }
}

function playerOptions(players, includeSelf) {
  return players
    .filter((player) => includeSelf || !player.isYou)
    .map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`)
    .join("");
}

async function apiGet(room, playerId) {
  const response = await fetch(`${API_BASE}/werewolf?room=${encodeURIComponent(room)}&playerId=${encodeURIComponent(playerId)}`);
  return readJson(response);
}

async function apiPost(body) {
  const response = await fetch(`${API_BASE}/werewolf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}

async function run(task) {
  try {
    await task();
  } catch (error) {
    alert(error.message || "请求失败，请稍后再试。");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

setInterval(() => {
  refresh().catch(() => {});
}, 2500);
