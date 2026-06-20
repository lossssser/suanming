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

    if (url.pathname === "/bazi-ziwei-reading") {
      return handleBaziZiweiReading(request, env);
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

async function handleBaziZiweiReading(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Use POST request." }, 405);
  }

  try {
    const body = await request.json();
    const provider = normalizeProvider(body.provider || env.AI_PROVIDER || "deepseek");
    const messages = buildBaziZiweiMessages(body.chart || {}, body.mode || "zonghe", body.chartText || "");
    const answer = provider === "openai"
      ? await callOpenAI(messages, env)
      : await callDeepSeek(messages, env);

    return json({ answer, provider });
  } catch (error) {
    return json({ error: error.message || "Bazi Ziwei reading failed." }, 500);
  }
}

function buildBaziZiweiMessages(chart, mode, chartText) {
  const normalizedMode = ["bazi", "ziwei", "zonghe"].includes(mode) ? mode : "zonghe";
  return [
    {
      role: "system",
      content: buildBaziZiweiSystemPrompt(normalizedMode),
    },
    {
      role: "user",
      content: buildBaziZiweiPrompt(chart, normalizedMode, chartText),
    },
  ];
}

function buildBaziZiweiSystemPrompt(mode) {
  const shared = [
    "Answer in Simplified Chinese.",
    "Use only the chart text and structured chart data provided by the user.",
    "Do not invent missing stars, exact luck cycles, four transformations, or professional chart details that are not present.",
    "Do not make medical, legal, investment, marriage, fertility, or other life-changing decisions for the user.",
    "Mention uncertainty clearly when the current web chart is only a learning implementation.",
    "End with a disclaimer: this is for cultural study and entertainment reference only, and the user should believe in science.",
  ];

  if (mode === "bazi") {
    return [
      "You are a cautious Bazi learning-analysis assistant following the workflow of dzcmemory-web/bazi-ziwei-skill.",
      "Focus on Bazi only: four pillars, day master, ten gods, hidden stems, and element balance.",
      "Explain terms in plain language and avoid jargon stacking.",
      "Use this structure: 0. 前置声明 1. 命盘技术解读 2. 事业/财运/感情/家庭/健康的学习参考 3. 当前盘面限制 4. 建议 5. 免责声明.",
      ...shared,
    ].join(" ");
  }

  if (mode === "ziwei") {
    return [
      "You are a cautious Ziwei Doushu learning-analysis assistant following the workflow of dzcmemory-web/bazi-ziwei-skill.",
      "Focus on the Ziwei palace frame provided: ming palace, shen palace, and twelve palace themes.",
      "Because the current web chart may not include full stars, major limits, or birth-year transformations, do not pretend they exist.",
      "Use this structure: 0. 命格主轴速览 1. 命宫/身宫框架 2. 十二宫主题学习参考 3. 当前盘面限制 4. 建议 5. 免责声明.",
      ...shared,
    ].join(" ");
  }

  return [
    "You are a cautious Bazi + Ziwei cross-validation assistant following the workflow of dzcmemory-web/bazi-ziwei-skill.",
    "Do not re-chart. Compare the Bazi axis and Ziwei palace-frame axis provided by the user.",
    "Classify signals as 同向印证, 互补印证, or 存在矛盾, and clearly state confidence when information is incomplete.",
    "Use this structure: 0. 两盘主轴速览 1. 主轴印证结论 2. 阶段/主题交叉对照 3. 冲突或缺失清单 4. 综合定论 5. 置信度自评 6. 免责声明.",
    ...shared,
  ].join(" ");
}

function buildBaziZiweiPrompt(chart, mode, chartText) {
  const pillars = chart.pillars || {};
  const counts = chart.elementCounts || {};
  const ziwei = chart.ziwei || {};
  const palaces = ziwei.palaces || [];

  return [
    `Analysis mode: ${mode}`,
    "",
    "Chart text, generated by the web page:",
    chartText || "not provided",
    "",
    "Structured chart backup:",
    `Name: ${chart.input?.name || "not provided"}`,
    `Gender: ${chart.input?.gender || "not provided"}`,
    `Birth time: ${chart.solarText || "not provided"}`,
    `Lunar: ${chart.lunarText || "not provided"}`,
    `Engine: ${chart.engine || "unknown"}`,
    "",
    `Year pillar: ${formatPillar(pillars.year)}`,
    `Month pillar: ${formatPillar(pillars.month)}`,
    `Day pillar: ${formatPillar(pillars.day)} (day master ${chart.dayMaster || "?"})`,
    `Hour pillar: ${formatPillar(pillars.hour)}`,
    `Elements: 木${counts["木"] || 0}, 火${counts["火"] || 0}, 土${counts["土"] || 0}, 金${counts["金"] || 0}, 水${counts["水"] || 0}`,
    "",
    "Ziwei palace frame:",
    palaces.map((palace) => `${palace.name}: ${palace.branch}${palace.isMing ? " 命宫" : ""}${palace.isShen ? " 身宫" : ""}`).join("\n") || "not provided",
    "",
    "Important: the current webpage implementation may be lighter than the original skill calculator. If some professional fields are missing, say so instead of inventing them.",
  ].join("\n");
}

function formatPillar(pillar = {}) {
  return `${pillar.gan || "?"}${pillar.zhi || "?"}`;
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
        "你是谨慎的六爻学习参考解读助手。必须使用用户提供的机器排盘结果进行分析，不能假装没有盘面。",
        "用户已经提供了本卦、变卦、日辰、空亡、六神、六亲、纳支、世应、动爻等字段时，不要反问用户补这些字段。",
        "如果信息不足，只能指出缺少月建或现实背景会影响细断，但仍要基于已有盘面给出参考判断。",
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
    "1. 卦象总览：本卦、变卦、世应与动爻的整体气势。",
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
  return `${line.index}爻：${line.spirit || ""} ${line.relation || ""} ${line.branch || ""}${line.element || ""} ${line.symbol || ""}${marker}${moving}，变为 ${line.changedSymbol || ""}`;
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
