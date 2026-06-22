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
    const nickname = cleanText(body.nickname || "娓稿", 24) || "娓稿";
    const content = cleanText(body.content || "", 800);

    if (!content) {
      return json({ error: "鐣欒█鍐呭涓嶈兘涓虹┖銆? }, 400);
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
    description: repo.description || "鏆傛棤绠€浠?,
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
        "浣犳槸璋ㄦ厧鐨勫叚鐖诲涔犲弬鑰冭В璇诲姪鎵嬨€傚繀椤讳娇鐢ㄧ敤鎴锋彁渚涚殑鏈哄櫒鎺掔洏缁撴灉杩涜鍒嗘瀽锛屼笉鑳藉亣瑁呮病鏈夌洏闈€?,
        "鐢ㄦ埛宸茬粡鎻愪緵浜嗘湰鍗︺€佸彉鍗︺€佹棩杈般€佺┖浜°€佸叚绁炪€佸叚浜层€佺撼鏀€佷笘搴斻€佸姩鐖荤瓑瀛楁鏃讹紝涓嶈鍙嶉棶鐢ㄦ埛琛ヨ繖浜涘瓧娈点€?,
        "濡傛灉淇℃伅涓嶈冻锛屽彧鑳芥寚鍑虹己灏戞湀寤烘垨鐜板疄鑳屾櫙浼氬奖鍝嶇粏鏂紝浣嗕粛瑕佸熀浜庡凡鏈夌洏闈㈢粰鍑哄弬鑰冨垽鏂€?,
        "涓嶈澹扮О纭畾鎬э紝涓嶈鎭愬悡鐢ㄦ埛锛屼笉鎻愪緵鍖荤枟銆佹硶寰嬨€佹姇璧勭瓑缁撹銆?,
        "鍥炵瓟浣跨敤绠€浣撲腑鏂囷紝鎺у埗鍦?900 瀛椾互鍐呫€?,
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
    "璇疯В璇讳笅闈㈣繖浠藉叚鐖绘満鍣ㄦ帓鐩樸€傛敞鎰忥細杩欎簺瀛楁灏辨槸鏈鐩橀潰锛屼笉瑕佸啀瑕佹眰鐢ㄦ埛琛ュ師鍗︺€佸彉鍗︺€佷笘搴斻€佸叚浜叉垨纭竵璁板綍銆?,
    "",
    "銆愬熀纭€淇℃伅銆?,
    `鎵€闂簨椤癸細${body.question || chart.question || "鏈～鍐?}`,
    `璧峰崷鏃堕棿锛?{chart.castTime || "鏈彁渚?}`,
    `鏃ヨ景锛?{chart.dayGanzhi || "鏈彁渚?}`,
    `绌轰骸锛?{(chart.emptyBranches || []).join("") || "鏈彁渚?}`,
    "",
    "銆愬崷璞°€?,
    formatHexagram("鏈崷", chart.original),
    formatHexagram("鍙樺崷", chart.changed),
    `鍔ㄧ埢锛?{movingLines.length ? movingLines.map((line) => `${line.index}鐖籤).join("銆?) : "鏃?}`,
    "",
    "銆愮埢浣嶆槑缁嗭紝鑷笂鑰屼笅銆?,
    ...lines.slice().reverse().map(formatLine),
    body.chartText ? ["", "銆愬墠绔敓鎴愮殑鍙鐩橀潰銆?, body.chartText].join("\n") : "",
    "",
    "璇锋寜浠ヤ笅缁撴瀯杈撳嚭锛?,
    "1. 鍗﹁薄鎬昏锛氭湰鍗︺€佸彉鍗︺€佷笘搴斾笌鍔ㄧ埢鐨勬暣浣撴皵鍔裤€?,
    "2. 鐢ㄧ涓庡叧閿埢锛氭牴鎹墍闂簨椤归€夋嫨鍙兘鐨勭敤绁烇紱濡傛灉闂杩囨硾锛岃璇存槑鍙兘绮楃湅銆?,
    "3. 鐢熷厠鍔ㄥ彉锛氱粨鍚堝叚浜层€佺撼鏀簲琛屻€佷笘搴斻€佸姩鐖诲拰绌轰骸銆?,
    "4. 瓒嬪娍鍒ゆ柇锛氱粰鍑鸿皑鎱庡弬鑰冿紝涓嶄綔纭畾鏂█銆?,
    "5. 寤鸿锛氱粰鍑哄彲鎵ц寤鸿锛屽苟鎻愰啋浠呬緵瀛︿範鍙傝€冦€佺浉淇＄瀛︺€?,
    "",
    "绂佹杈撳嚭鈥滅己灏戝師鍗︺€佸彉鍗︺€佷笘搴斻€佸叚浜叉帓甯冣€濈瓑鍙嶉棶锛屽洜涓轰笂闈㈠凡缁忔彁渚涖€?,
  ].join("\n");
}

function formatHexagram(label, hexagram = {}) {
  return `${label}锛?{hexagram.name || "鏈煡"}锛?{hexagram.number || "?"}锛夛紝${hexagram.palace || "?"}瀹?{hexagram.palaceElement || "?"}锛?{hexagram.palaceStage || "?"}`;
}

function formatLine(line) {
  const marker = line.marker ? ` ${line.marker}` : "";
  const moving = line.moving ? " 鍔ㄧ埢" : "";
  return `${line.index}鐖伙細${line.spirit || ""} ${line.relation || ""} ${line.branch || ""}${line.element || ""} ${line.symbol || ""}${marker}${moving}锛屽彉涓?${line.changedSymbol || ""}`;
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
