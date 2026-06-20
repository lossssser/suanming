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
    const messages = buildBaziZiweiMessages(body.chart || {});
    const answer = provider === "openai"
      ? await callOpenAI(messages, env)
      : await callDeepSeek(messages, env);

    return json({ answer, provider });
  } catch (error) {
    return json({ error: error.message || "Bazi Ziwei reading failed." }, 500);
  }
}

function buildBaziZiweiMessages(chart) {
  return [
    {
      role: "system",
      content: [
        "You are a cautious traditional culture study assistant for Bazi and Ziwei charts. ",
        "Answer in Simplified Chinese. ",
        "Use the provided chart only as cultural-study material. ",
        "Do not claim certainty, do not make medical, legal, investment, marriage, or life-changing decisions for the user. ",
        "Clearly remind the user to believe in science and treat this as learning reference. ",
        "Keep the answer concise, practical, and within about 700 Chinese characters.",
      ].join(""),
    },
    {
      role: "user",
      content: buildBaziZiweiPrompt(chart),
    },
  ];
}

function buildBaziZiweiPrompt(chart) {
  const pillars = chart.pillars || {};
  const counts = chart.elementCounts || {};
  const ziwei = chart.ziwei || {};
  const palaces = ziwei.palaces || [];

  return [
    "Please give a cautious Bazi + Ziwei learning-reference reading.",
    "",
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
    "Use this structure:",
    "1. Bazi overview",
    "2. Element balance learning notes",
    "3. Ziwei palace-frame notes",
    "4. Practical reflection questions",
    "5. Scientific disclaimer",
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
        "You are a cautious Liuyao divination chart reading assistant. ",
        "Answer in Simplified Chinese. ",
        "Analyze only from the chart provided by the user. ",
        "Do not claim certainty, do not intimidate the user, and do not provide medical, legal, or investment conclusions. ",
        "If important context is missing, say that month branch, useful-god selection, and real-world context are needed for a firmer reading.",
        "Keep the answer concise, within about 700 Chinese characters.",
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
    "Please read this Liuyao chart and answer in Simplified Chinese.",
    "",
    `Question: ${body.question || chart.question || "not provided"}`,
    `Cast time: ${chart.castTime || "not provided"}`,
    `Day ganzhi: ${chart.dayGanzhi || "not provided"}`,
    `Empty branches: ${(chart.emptyBranches || []).join("") || "not provided"}`,
    "",
    formatHexagram("Original hexagram", chart.original),
    formatHexagram("Changed hexagram", chart.changed),
    `Moving lines: ${movingLines.length ? movingLines.map((line) => `${line.index}`).join(", ") : "none"}`,
    "",
    "Line details, top to bottom:",
    ...lines.slice().reverse().map(formatLine),
    "",
    "Use this structure:",
    "1. Chart overview",
    "2. Useful god and key lines",
    "3. Generating, controlling, moving, and changing relations",
    "4. Trend judgment",
    "5. Practical advice",
    "",
    "Please keep the answer concise and practical.",
  ].join("\n");
}

function formatHexagram(label, hexagram = {}) {
  return `${label}: ${hexagram.name || "unknown"} (${hexagram.number || "?"}), palace ${hexagram.palace || "?"}${hexagram.palaceElement || "?"}, stage ${hexagram.palaceStage || "?"}`;
}

function formatLine(line) {
  const marker = line.marker ? ` ${line.marker}` : "";
  const moving = line.moving ? " moving" : "";
  return `${line.index}: ${line.spirit || ""} ${line.relation || ""} ${line.branch || ""}${line.element || ""} ${line.symbol || ""}${marker}${moving} -> ${line.changedSymbol || ""}`;
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
