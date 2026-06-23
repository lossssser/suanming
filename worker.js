export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname === "/posts") {
      return handlePosts(request, env);
    }

    if (url.pathname === "/github-hot") {
      return handleGitHubHot(request, env, url);
    }

    if (url.pathname === "/werewolf") {
      try {
        return await handleWerewolf(request, env, url);
      } catch (error) {
        return json({ error: error.message || "Werewolf request failed." }, 500);
      }
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST request." }, 405);
    }

    try {
      const body = await request.json();
      const provider = normalizeProvider(body.provider || env.AI_PROVIDER || "deepseek");
      const messages = buildMessages(body);
      const answer = provider === "openai"
        ? await callOpenAI(messages, env)
        : await callDeepSeek(messages, env);

      return json({ answer, provider });
    } catch (error) {
      return json({ error: error.message || "AI reading failed." }, 500);
    }
  },
};

async function handlePosts(request, env) {
  if (!env.DB) {
    return json({ error: "Missing D1 binding DB on this Worker." }, 500);
  }

  await ensurePostsTable(env.DB);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, nickname, content, created_at FROM posts ORDER BY id DESC LIMIT 100",
    ).all();
    return json({ posts: results || [] });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const nickname = cleanText(body.nickname || "游客", 24) || "游客";
    const content = cleanText(body.content || "", 800);

    if (!content) {
      return json({ error: "留言内容不能为空。" }, 400);
    }

    const createdAt = new Date().toISOString();
    const result = await env.DB.prepare(
      "INSERT INTO posts (nickname, content, created_at) VALUES (?, ?, ?)",
    ).bind(nickname, content, createdAt).run();

    return json({
      post: {
        id: result.meta?.last_row_id,
        nickname,
        content,
        created_at: createdAt,
      },
    }, 201);
  }

  return json({ error: "Use GET or POST request." }, 405);
}

async function ensurePostsTable(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  ).run();
}

const WEREWOLF_ROLES = ["狼人", "狼人", "爪牙", "守夜人", "守夜人", "预言家", "强盗", "捣蛋鬼", "酒鬼", "失眠者"];
const WEREWOLF_PHASES = [
  { key: "werewolf", name: "狼人行动", hint: "狼人互相确认身份。若只有一个狼人，可以知道自己是孤狼。" },
  { key: "minion", name: "爪牙行动", hint: "爪牙查看狼人是谁。爪牙属于狼人阵营，但自己不是狼人。" },
  { key: "mason", name: "守夜人行动", hint: "两个守夜人互相确认。如果只看到自己，说明另一个守夜人在中央牌。" },
  { key: "seer", name: "预言家行动", hint: "预言家可以查看一名玩家，或查看两张中央牌。" },
  { key: "robber", name: "强盗行动", hint: "强盗选择一名玩家交换身份，并查看自己换到的新身份。" },
  { key: "troublemaker", name: "捣蛋鬼行动", hint: "捣蛋鬼交换另外两名玩家的身份，但不查看。" },
  { key: "drunk", name: "酒鬼行动", hint: "酒鬼选择一张中央牌与自己交换，但不查看。" },
  { key: "insomniac", name: "失眠者行动", hint: "失眠者最后查看自己当前身份。" },
];

async function handleWerewolf(request, env, url) {
  if (!env.DB) {
    return json({ error: "Missing D1 binding DB. 多人在线房间需要 Cloudflare D1 数据库。" }, 500);
  }

  await ensureWerewolfTable(env.DB);

  if (request.method === "GET") {
    const code = normalizeRoomCode(url.searchParams.get("room"));
    const playerId = cleanId(url.searchParams.get("playerId"));
    const state = await loadWerewolfRoom(env.DB, code);
    if (!state) return json({ error: "房间不存在。" }, 404);
    return json({ room: sanitizeWerewolfState(state, playerId) });
  }

  if (request.method !== "POST") {
    return json({ error: "Use GET or POST request." }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const playerId = cleanId(body.playerId);
  const name = cleanText(body.name || "游客", 18) || "游客";

  if (!playerId) return json({ error: "Missing playerId." }, 400);

  if (action === "create") {
    const state = createWerewolfRoom(playerId, name);
    await saveWerewolfRoom(env.DB, state);
    return json({ room: sanitizeWerewolfState(state, playerId) }, 201);
  }

  const code = normalizeRoomCode(body.room);
  const state = await loadWerewolfRoom(env.DB, code);
  if (!state) return json({ error: "房间不存在。" }, 404);

  if (action === "join") {
    if (state.status !== "lobby") return json({ error: "游戏已经开始，不能加入。" }, 400);
    upsertPlayer(state, playerId, name);
  } else if (action === "start") {
    requireHost(state, playerId);
    startWerewolfGame(state);
  } else if (action === "next") {
    requireHost(state, playerId);
    advanceWerewolfPhase(state);
  } else if (action === "reset") {
    requireHost(state, playerId);
    resetWerewolfGame(state);
  } else if (action === "roleAction") {
    applyWerewolfRoleAction(state, playerId, body.payload || {});
  } else if (action === "vote") {
    applyWerewolfVote(state, playerId, cleanId(body.targetId));
  } else {
    return json({ error: "Unknown action." }, 400);
  }

  state.updatedAt = new Date().toISOString();
  await saveWerewolfRoom(env.DB, state);
  return json({ room: sanitizeWerewolfState(state, playerId) });
}

async function ensureWerewolfTable(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS werewolf_rooms (
      code TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

function createWerewolfRoom(hostId, hostName) {
  const now = new Date().toISOString();
  const code = makeRoomCode();
  return {
    code,
    hostId,
    status: "lobby",
    phaseIndex: -1,
    players: [{ id: hostId, name: hostName, joinedAt: now }],
    originalRoles: {},
    currentRoles: {},
    center: [],
    actions: {},
    votes: {},
    events: ["房间已创建。"],
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

function resetWerewolfGame(state) {
  state.status = "lobby";
  state.phaseIndex = -1;
  state.originalRoles = {};
  state.currentRoles = {};
  state.center = [];
  state.actions = {};
  state.votes = {};
  state.result = null;
  state.events = ["房主已重开本房，等待重新发牌。"];
}

function upsertPlayer(state, playerId, name) {
  const found = state.players.find((player) => player.id === playerId);
  if (found) {
    found.name = name;
    return;
  }
  if (state.players.length >= 7) {
    throw new Error("本版本是 7 人局，房间已满。");
  }
  state.players.push({ id: playerId, name, joinedAt: new Date().toISOString() });
  state.events.unshift(`${name} 加入房间。`);
}

function startWerewolfGame(state) {
  if (state.players.length !== 7) {
    throw new Error("需要正好 7 名玩家才能开始。");
  }
  const roles = shuffle(WEREWOLF_ROLES);
  state.originalRoles = {};
  state.currentRoles = {};
  state.players.forEach((player, index) => {
    state.originalRoles[player.id] = roles[index];
    state.currentRoles[player.id] = roles[index];
  });
  state.center = roles.slice(7);
  state.status = "night";
  state.phaseIndex = 0;
  state.actions = {};
  state.votes = {};
  state.result = null;
  state.events = ["游戏开始，身份已发放。", "夜晚开始，请按阶段行动。"];
}

function advanceWerewolfPhase(state) {
  if (state.status !== "night") return;
  if (state.phaseIndex >= WEREWOLF_PHASES.length - 1) {
    state.status = "day";
    state.phaseIndex = -1;
    state.events.unshift("天亮了，进入白天讨论和投票。");
  } else {
    state.phaseIndex += 1;
    state.events.unshift(`进入：${WEREWOLF_PHASES[state.phaseIndex].name}。`);
  }
}

function applyWerewolfRoleAction(state, playerId, payload) {
  if (state.status !== "night") throw new Error("当前不是夜晚阶段。");
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  const role = state.originalRoles[playerId];
  if (!canRoleActInPhase(role, phase.key)) {
    throw new Error("当前阶段不是你的行动阶段。");
  }
  if (state.actions[phase.key]?.[playerId]) {
    throw new Error("你已经完成本阶段行动。");
  }
  state.actions[phase.key] ||= {};

  if (phase.key === "seer") {
    if (payload.type !== "seer") throw new Error("预言家行动参数错误。");
    if (payload.mode === "center") {
      state.actions[phase.key][playerId] = { result: `中央牌 1：${state.center[0]}；中央牌 2：${state.center[1]}` };
    } else {
      const targetId = cleanId(payload.targetId);
      state.actions[phase.key][playerId] = { result: `${playerName(state, targetId)} 的当前身份是：${state.currentRoles[targetId] || "未知"}` };
    }
  } else if (phase.key === "robber") {
    const targetId = cleanId(payload.targetId);
    swapRoles(state.currentRoles, playerId, targetId);
    state.actions[phase.key][playerId] = { result: `你和 ${playerName(state, targetId)} 交换了身份。你的当前身份是：${state.currentRoles[playerId]}` };
  } else if (phase.key === "troublemaker") {
    const targetA = cleanId(payload.targetA);
    const targetB = cleanId(payload.targetB);
    if (!targetA || !targetB || targetA === targetB || targetA === playerId || targetB === playerId) {
      throw new Error("捣蛋鬼必须选择另外两名不同玩家。");
    }
    swapRoles(state.currentRoles, targetA, targetB);
    state.actions[phase.key][playerId] = { result: `你交换了 ${playerName(state, targetA)} 和 ${playerName(state, targetB)} 的身份，但不知道内容。` };
  } else if (phase.key === "drunk") {
    const index = Number(payload.centerIndex);
    if (![0, 1, 2].includes(index)) throw new Error("请选择有效中央牌。");
    const old = state.currentRoles[playerId];
    state.currentRoles[playerId] = state.center[index];
    state.center[index] = old;
    state.actions[phase.key][playerId] = { result: "你和一张中央牌交换了身份，但不知道换到了什么。" };
  } else {
    state.actions[phase.key][playerId] = { result: getWerewolfInfoText(state, playerId, phase.key) };
  }
}

function applyWerewolfVote(state, playerId, targetId) {
  if (state.status !== "day") throw new Error("当前不能投票。");
  if (!state.players.some((player) => player.id === targetId)) throw new Error("投票目标不存在。");
  state.votes[playerId] = targetId;
  state.events.unshift(`${playerName(state, playerId)} 已投票。`);
  if (Object.keys(state.votes).length >= state.players.length) {
    finishWerewolfGame(state);
  }
}

function finishWerewolfGame(state) {
  const counts = {};
  Object.values(state.votes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] || 0) + 1;
  });
  const max = Math.max(...Object.values(counts));
  const eliminated = max <= 1
    ? []
    : Object.entries(counts)
      .filter(([, count]) => count === max)
      .map(([id]) => id);
  const wolves = state.players.filter((player) => state.currentRoles[player.id] === "狼人").map((player) => player.id);
  const killedWolf = eliminated.some((id) => wolves.includes(id));
  const noWolfOnTable = wolves.length === 0;
  const villageWin = noWolfOnTable ? eliminated.length === 0 : killedWolf;
  state.status = "ended";
  state.result = {
    eliminated,
    villageWin,
    lines: [
      `出局：${eliminated.length ? eliminated.map((id) => `${playerName(state, id)}（${state.currentRoles[id]}）`).join("、") : "无人出局"}`,
      villageWin ? "好人阵营获胜。" : "狼人阵营获胜。",
      ...state.players.map((player) => `${player.name}：初始 ${state.originalRoles[player.id]}，最终 ${state.currentRoles[player.id]}`),
      `中央牌：${state.center.join("、")}`,
    ],
  };
  state.events.unshift("投票结束，游戏结算完成。");
}

function sanitizeWerewolfState(state, playerId) {
  const phase = state.status === "night" ? WEREWOLF_PHASES[state.phaseIndex] : null;
  const role = state.originalRoles[playerId];
  const actionRecord = phase ? state.actions[phase.key]?.[playerId] : null;
  return {
    code: state.code,
    status: state.status,
    phaseName: getWerewolfPhaseName(state),
    phaseHint: getWerewolfPhaseHint(state),
    isHost: state.hostId === playerId,
    myRole: role || "",
    myRoleHint: getMyRoleHint(state, playerId),
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      isYou: player.id === playerId,
      isHost: player.id === state.hostId,
      readyText: getPlayerReadyText(state, player.id),
    })),
    events: (state.events || []).slice(0, 20),
    availableAction: getAvailableAction(state, playerId, actionRecord),
    waitText: getWaitText(state, playerId),
    voteText: getVoteText(state),
    finalText: state.result?.lines || [],
  };
}

function getWerewolfPhaseName(state) {
  if (state.status === "lobby") return "等待开始";
  if (state.status === "day") return "白天讨论";
  if (state.status === "ended") return "已结算";
  return WEREWOLF_PHASES[state.phaseIndex]?.name || "夜晚";
}

function getWerewolfPhaseHint(state) {
  if (state.status === "lobby") return "等 7 名玩家加入后，房主可以开始。";
  if (state.status === "day") return "所有玩家讨论后投票。";
  if (state.status === "ended") return "本局已结束，房主可以重开。";
  return WEREWOLF_PHASES[state.phaseIndex]?.hint || "";
}

function getMyRoleHint(state, playerId) {
  if (!state.originalRoles[playerId]) return "开始后这里会显示你的身份。";
  if (state.status === "ended") return `你的最终身份：${state.currentRoles[playerId]}`;
  return "注意：夜晚可能换牌，白天按最终身份结算。";
}

function getAvailableAction(state, playerId, actionRecord) {
  if (state.status !== "night") return null;
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  const role = state.originalRoles[playerId];
  if (!canRoleActInPhase(role, phase.key)) return null;
  if (actionRecord) {
    return { type: "info", text: actionRecord.result || "你已完成本阶段行动。" };
  }
  if (phase.key === "werewolf") {
    return { type: "info", text: getWerewolfInfoText(state, playerId, phase.key) };
  }
  if (phase.key === "minion") {
    return { type: "info", text: getWerewolfInfoText(state, playerId, phase.key) };
  }
  if (phase.key === "mason") {
    return { type: "info", text: getWerewolfInfoText(state, playerId, phase.key) };
  }
  if (phase.key === "seer") return { type: "seer" };
  if (phase.key === "robber") return { type: "one-player", role: "robber", text: "强盗：选择一名玩家交换身份，并查看你换到的新身份。" };
  if (phase.key === "troublemaker") return { type: "two-players", text: "捣蛋鬼：选择另外两名玩家交换身份，你不会看到身份内容。" };
  if (phase.key === "drunk") return { type: "center", text: "酒鬼：选择一张中央牌和自己交换，但不会查看。" };
  if (phase.key === "insomniac") return { type: "info", text: `你的当前身份是：${state.currentRoles[playerId]}` };
  return null;
}

function getWerewolfInfoText(state, playerId, phaseKey) {
  if (phaseKey === "werewolf") {
    const wolves = state.players.filter((player) => state.originalRoles[player.id] === "狼人").map((player) => player.name);
    return `狼人名单：${wolves.join("、")}`;
  }
  if (phaseKey === "minion") {
    const wolves = state.players.filter((player) => state.originalRoles[player.id] === "狼人").map((player) => player.name);
    return wolves.length ? `狼人是：${wolves.join("、")}` : "本局狼人都在中央牌，爪牙需要独自帮狼人阵营。";
  }
  if (phaseKey === "mason") {
    const masons = state.players.filter((player) => state.originalRoles[player.id] === "守夜人").map((player) => player.name);
    return `守夜人名单：${masons.join("、")}`;
  }
  if (phaseKey === "insomniac") {
    return `你的当前身份是：${state.currentRoles[playerId]}`;
  }
  return "已确认。";
}

function getWaitText(state, playerId) {
  if (state.status !== "night") return "";
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  const role = state.originalRoles[playerId];
  return `当前是${phase.name}。你的初始身份是${role}，本阶段无需行动，等待房主推进。`;
}

function getPlayerReadyText(state, playerId) {
  if (state.status === "lobby") return "等待发牌";
  if (state.status === "day") return state.votes[playerId] ? "已投票" : "未投票";
  if (state.status === "ended") return `最终身份：${state.currentRoles[playerId]}`;
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  if (!canRoleActInPhase(state.originalRoles[playerId], phase.key)) return "本阶段无需行动";
  return state.actions[phase.key]?.[playerId] ? "已行动" : "待行动";
}

function getVoteText(state) {
  if (state.status !== "day") return "";
  return `投票进度：${Object.keys(state.votes).length}/${state.players.length}`;
}

function canRoleActInPhase(role, phaseKey) {
  return (
    (phaseKey === "werewolf" && role === "狼人") ||
    (phaseKey === "minion" && role === "爪牙") ||
    (phaseKey === "mason" && role === "守夜人") ||
    (phaseKey === "seer" && role === "预言家") ||
    (phaseKey === "robber" && role === "强盗") ||
    (phaseKey === "troublemaker" && role === "捣蛋鬼") ||
    (phaseKey === "drunk" && role === "酒鬼") ||
    (phaseKey === "insomniac" && role === "失眠者")
  );
}

async function loadWerewolfRoom(db, code) {
  if (!code) return null;
  const row = await db.prepare("SELECT state_json FROM werewolf_rooms WHERE code = ?").bind(code).first();
  return row ? JSON.parse(row.state_json) : null;
}

async function saveWerewolfRoom(db, state) {
  await db.prepare(
    `INSERT INTO werewolf_rooms (code, state_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  ).bind(state.code, JSON.stringify(state), state.createdAt, state.updatedAt).run();
}

function requireHost(state, playerId) {
  if (state.hostId !== playerId) throw new Error("只有房主可以操作。");
}

function swapRoles(map, a, b) {
  if (!map[a] || !map[b]) throw new Error("交换目标不存在。");
  const temp = map[a];
  map[a] = map[b];
  map[b] = temp;
}

function playerName(state, playerId) {
  return state.players.find((player) => player.id === playerId)?.name || "未知玩家";
}

function shuffle(values) {
  const list = values.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const target = Math.floor(random * (index + 1));
    [list[index], list[target]] = [list[target], list[index]];
  }
  return list;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length;
    code += alphabet[random];
  }
  return code;
}

function normalizeRoomCode(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
}

function cleanId(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

function cleanText(value, maxLength) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function handleGitHubHot(request, env, url) {
  if (request.method !== "GET") {
    return json({ error: "Use GET request." }, 405);
  }

  const period = normalizePeriod(url.searchParams.get("period"));
  const language = cleanGitHubQuery(url.searchParams.get("language") || "");
  const keyword = cleanGitHubQuery(url.searchParams.get("keyword") || "");
  const since = getSinceDate(period);
  const queryParts = [`created:>=${since}`, "stars:>3"];

  if (language) queryParts.push(`language:${language}`);
  if (keyword) queryParts.push(keyword);

  const apiUrl = new URL("https://api.github.com/search/repositories");
  apiUrl.searchParams.set("q", queryParts.join(" "));
  apiUrl.searchParams.set("sort", "stars");
  apiUrl.searchParams.set("order", "desc");
  apiUrl.searchParams.set("per_page", "80");

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "shxgjqaq-github-hot",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const response = await fetch(apiUrl, { headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json({
      error: data.message || `GitHub request failed: HTTP ${response.status}`,
      status: response.status,
    }, response.status);
  }

  const repos = (data.items || []).map(scoreRepository);
  const fastest = repos
    .slice()
    .sort((a, b) => b.starVelocity - a.starVelocity || b.stars - a.stars)
    .slice(0, 20);
  const practical = repos
    .slice()
    .sort((a, b) => b.practicalScore - a.practicalScore || b.stars - a.stars)
    .slice(0, 20);

  return json({
    period,
    since,
    language,
    keyword,
    totalCount: data.total_count || 0,
    fetchedCount: repos.length,
    fastest,
    practical,
    note: "GitHub API does not provide historical star deltas directly. Star growth is estimated by stars per day among repositories created in the selected time window.",
  });
}

function normalizePeriod(period) {
  return period === "month" ? "month" : "week";
}

function getSinceDate(period) {
  const days = period === "month" ? 30 : 7;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function cleanGitHubQuery(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}_ .#+-]/gu, "")
    .trim()
    .slice(0, 40);
}

function scoreRepository(repo) {
  const createdAt = repo.created_at || new Date().toISOString();
  const updatedAt = repo.updated_at || createdAt;
  const ageDays = Math.max(1, (Date.now() - Date.parse(createdAt)) / 86400000);
  const updatedDays = Math.max(0, (Date.now() - Date.parse(updatedAt)) / 86400000);
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const stars = repo.stargazers_count || 0;
  const forks = repo.forks_count || 0;
  const hasDescription = repo.description ? 1 : 0;
  const hasHomepage = repo.homepage ? 1 : 0;
  const hasLicense = repo.license?.spdx_id ? 1 : 0;
  const recentBonus = Math.max(0, 30 - updatedDays) / 30;

  return {
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description || "暂无简介",
    language: repo.language || "Unknown",
    stars,
    forks,
    openIssues: repo.open_issues_count || 0,
    createdAt,
    updatedAt,
    pushedAt: repo.pushed_at,
    homepage: repo.homepage || "",
    license: repo.license?.spdx_id || "",
    topics: topics.slice(0, 8),
    starVelocity: round(stars / ageDays, 2),
    practicalScore: round(
      stars * 0.55 +
      forks * 1.2 +
      topics.length * 10 +
      hasDescription * 18 +
      hasHomepage * 12 +
      hasLicense * 10 +
      recentBonus * 18,
      1,
    ),
  };
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function callDeepSeek(messages, env) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY secret on this Worker.");
  }

  const data = await postChatCompletion({
    url: "https://api.deepseek.com/chat/completions",
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_MODEL || "deepseek-chat",
    messages,
  });

  return data.choices?.[0]?.message?.content?.trim() || "DeepSeek returned no readable text.";
}

async function callOpenAI(messages, env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY secret on this Worker.");
  }

  const data = await postChatCompletion({
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-4.1-mini",
    messages,
  });

  return data.choices?.[0]?.message?.content?.trim() || "OpenAI returned no readable text.";
}

async function postChatCompletion({ url, apiKey, model, messages }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI provider request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: { message: text } };
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `AI request failed: HTTP ${response.status}`);
  }

  return data;
}

function normalizeProvider(provider) {
  const value = String(provider || "").toLowerCase();
  if (value === "openai" || value === "deepseek") {
    return value;
  }
  throw new Error("Unsupported provider. Use openai or deepseek.");
}

function buildMessages(body) {
  return [
    {
      role: "system",
      content: [
        "你是谨慎的六爻学习参考解读助手。",
        "必须使用用户提供的机器排盘结果分析，不要反问用户补原卦、变卦、世应、六亲等已提供字段。",
        "如果信息不足，可以说明缺少月建或现实背景会影响细断，但仍要基于已有盘面给参考判断。",
        "不要声称确定性，不要恐吓用户，不提供医疗、法律、投资等结论。",
        "回答使用简体中文，控制在 900 字以内。",
      ].join(""),
    },
    {
      role: "user",
      content: buildPrompt(body),
    },
  ];
}

function buildPrompt(body) {
  const chart = body.chart || {};
  const lines = chart.lines || [];
  const movingLines = lines.filter((line) => line.moving);

  return [
    "请解读下面这份六爻机器排盘。注意：这些字段就是本次盘面，不要再要求用户补原卦、变卦、世应、六亲或硬币记录。",
    "",
    "【基础信息】",
    `所问事项：${body.question || chart.question || "未填写"}`,
    `起卦时间：${chart.castTime || "未提供"}`,
    `日辰：${chart.dayGanzhi || "未提供"}`,
    `空亡：${(chart.emptyBranches || []).join("") || "未提供"}`,
    "",
    "【卦象】",
    formatHexagram("本卦", chart.original),
    formatHexagram("变卦", chart.changed),
    `动爻：${movingLines.length ? movingLines.map((line) => `${line.index}爻`).join("、") : "无"}`,
    "",
    "【爻位明细，自上而下】",
    ...lines.slice().reverse().map(formatLine),
    body.chartText ? ["", "【前端生成的可读盘面】", body.chartText].join("\n") : "",
    "",
    "请按以下结构输出：",
    "1. 卦象总观：本卦、变卦、世应与动爻的整体气势。",
    "2. 用神与关键爻：根据所问事项选择可能的用神；如果问题过泛，请说明只能粗看。",
    "3. 生克动变：结合六亲、纳支五行、世应、动爻和空亡。",
    "4. 趋势判断：给出谨慎参考，不作确定断言。",
    "5. 建议：给出可执行建议，并提醒仅供学习参考、相信科学。",
    "",
    "禁止输出“缺少原卦、变卦、世应、六亲排布”等反问，因为上面已经提供。",
  ].join("\n");
}

function formatHexagram(label, hexagram = {}) {
  return `${label}：${hexagram.name || "未知"}（${hexagram.number || "?"}），${hexagram.palace || "?"}宫${hexagram.palaceElement || "?"}，${hexagram.palaceStage || "?"}`;
}

function formatLine(line) {
  const marker = line.marker ? ` ${line.marker}` : "";
  const moving = line.moving ? " 动爻" : "";
  return `${line.index}爻：${line.spirit || ""} ${line.relation || ""} ${line.branch || ""}${line.element || ""} ${line.symbol || ""}${marker}${moving}，变为${line.changedSymbol || ""}`;
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
