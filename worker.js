export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "请使用 POST 请求。" },
        { status: 405, headers: corsHeaders() },
      );
    }

    const body = await request.json();
    const question = body.question || "未填写";
    const chart = body.chart || {};
    const original = chart.original?.name || "未知本卦";
    const changed = chart.changed?.name || "未知变卦";
    const movingLines = (chart.lines || [])
      .filter((line) => line.moving)
      .map((line) => `${line.index}爻`)
      .join("、") || "无动爻";

    return Response.json(
      {
        answer: [
          `问题：${question}`,
          `本卦：${original}`,
          `变卦：${changed}`,
          `动爻：${movingLines}`,
          "",
          "Cloudflare Worker 已经连通。下一步可以在这里接入 AI，让它根据完整盘面生成断卦文字。",
        ].join("\n"),
      },
      { headers: corsHeaders() },
    );
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}
