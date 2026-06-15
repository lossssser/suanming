export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
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
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1200,
    }),
  });

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
