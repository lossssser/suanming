export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST request." }, 405);
    }

    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: "Missing DEEPSEEK_API_KEY secret on this Worker." }, 500);
    }

    try {
      const body = await request.json();
      const messages = buildMessages(body);
      const answer = await callDeepSeek(messages, env);
      return json({ answer });
    } catch (error) {
      return json({ error: error.message || "AI reading failed." }, 500);
    }
  },
};

async function callDeepSeek(messages, env) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
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
    throw new Error(data.error?.message || `DeepSeek request failed: HTTP ${response.status}`);
  }

  return data.choices?.[0]?.message?.content?.trim() || "DeepSeek returned no readable text.";
}

function buildMessages(body) {
  return [
    {
      role: "system",
      content: [
        "你是一位谨慎的六爻排盘解读助手。",
        "只根据用户提供的盘面作传统术数风格的分析，不声称结果必然发生。",
        "输出要清楚、克制、可读，避免恐吓、绝对化承诺和医疗/法律/投资定论。",
        "如果信息不足，说明需要结合月建、用神取法、现实背景再判断。",
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
    "请解读下面这个六爻盘。",
    "",
    `所问事项：${body.question || chart.question || "未填写"}`,
    `起卦时间：${chart.castTime || "未填写"}`,
    `日辰：${chart.dayGanzhi || "未填写"}`,
    `空亡：${(chart.emptyBranches || []).join("") || "未填写"}`,
    "",
    formatHexagram("本卦", chart.original),
    formatHexagram("变卦", chart.changed),
    `动爻：${movingLines.length ? movingLines.map((line) => `${line.index}爻`).join("、") : "无动爻"}`,
    "",
    "爻位明细（从上爻到初爻）：",
    ...lines.slice().reverse().map(formatLine),
    "",
    "请按以下结构输出：",
    "1. 盘面总览",
    "2. 用神和关键爻提示",
    "3. 生克动变分析",
    "4. 趋势判断",
    "5. 行动建议",
  ].join("\n");
}

function formatHexagram(label, hexagram = {}) {
  return `${label}：${hexagram.name || "未知"}（${hexagram.number || "?"}），${hexagram.palace || "?"}宫${hexagram.palaceElement || "?"}，${hexagram.palaceStage || "?"}`;
}

function formatLine(line) {
  const marker = line.marker ? ` ${line.marker}` : "";
  const moving = line.moving ? " 动" : "";
  return `${line.index}爻：${line.spirit || ""} ${line.relation || ""} ${line.branch || ""}${line.element || ""} ${line.symbol || ""}${marker}${moving} -> ${line.changedSymbol || ""}`;
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
