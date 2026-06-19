export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname === "/posts") {
      return handlePosts(request, env);
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
