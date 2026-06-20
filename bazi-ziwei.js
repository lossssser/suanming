const ASTRO_AI_ENDPOINT = "https://api.shxgjqaq.com/bazi-ziwei-reading";

const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ELEMENT_BY_GAN = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
};
const ELEMENT_BY_ZHI = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};
const CANG_GAN = {
  子: ["癸"],
  丑: ["己", "癸", "辛"],
  寅: ["甲", "丙", "戊"],
  卯: ["乙"],
  辰: ["戊", "乙", "癸"],
  巳: ["丙", "庚", "戊"],
  午: ["丁", "己"],
  未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"],
  酉: ["辛"],
  戌: ["戊", "辛", "丁"],
  亥: ["壬", "甲"],
};
const PALACE_NAMES = ["命宫", "兄弟", "夫妻", "子女", "财帛", "疾厄", "迁移", "交友", "官禄", "田宅", "福德", "父母"];
const BRANCH_TO_HOUR = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

let lastChart = null;

const form = document.querySelector("#astroForm");
const sampleButton = document.querySelector("#sampleAstroButton");
const clearButton = document.querySelector("#clearAstroButton");
const aiButton = document.querySelector("#astroAiButton");
const astroEmpty = document.querySelector("#astroEmpty");
const astroOutput = document.querySelector("#astroOutput");
const basicSummary = document.querySelector("#basicSummary");
const baziTable = document.querySelector("#baziTable");
const elementBars = document.querySelector("#elementBars");
const palaceGrid = document.querySelector("#palaceGrid");
const astroReading = document.querySelector("#astroReading");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateChart();
});
sampleButton.addEventListener("click", () => {
  document.querySelector("#personName").value = "示例";
  document.querySelector("#gender").value = "male";
  document.querySelector("#birthDate").value = "2000-01-01";
  document.querySelector("#birthTime").value = "12:00";
});
clearButton.addEventListener("click", () => {
  form.reset();
  document.querySelector("#birthTime").value = "12:00";
  lastChart = null;
  astroOutput.hidden = true;
  astroEmpty.hidden = false;
});
aiButton.addEventListener("click", requestAiReading);

async function generateChart() {
  const input = readInput();
  if (!input) return;

  astroReading.innerHTML = `<p>正在排盘...</p>`;
  try {
    lastChart = await buildChart(input);
  } catch {
    lastChart = buildFallbackChart(input);
  }

  renderChart(lastChart);
}

function readInput() {
  const dateValue = document.querySelector("#birthDate").value;
  const timeValue = document.querySelector("#birthTime").value;
  if (!dateValue || !timeValue) return null;

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  return {
    name: document.querySelector("#personName").value.trim() || "未命名",
    gender: document.querySelector("#gender").value,
    year,
    month,
    day,
    hour,
    minute,
    calendarType: document.querySelector("#calendarType").value,
    timezone: Number(document.querySelector("#timezone").value || 8),
  };
}

async function buildChart(input) {
  const { Solar } = await import("https://esm.sh/lunar-typescript@1.8.6");
  const solar = Solar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const pillars = {
    year: splitGanzhi(eightChar.getYear()),
    month: splitGanzhi(eightChar.getMonth()),
    day: splitGanzhi(eightChar.getDay()),
    hour: splitGanzhi(eightChar.getTime()),
  };

  const lunarMonth = Number(lunar.getMonth());
  const lunarDay = Number(lunar.getDay());

  return enrichChart({
    input,
    engine: "lunar-typescript",
    solarText: `${input.year}-${pad(input.month)}-${pad(input.day)} ${pad(input.hour)}:${pad(input.minute)}`,
    lunarText: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    pillars,
    lunarMonth,
    lunarDay,
  });
}

function buildFallbackChart(input) {
  const date = new Date(input.year, input.month - 1, input.day, input.hour, input.minute);
  const dayIndex = Math.floor(Date.UTC(input.year, input.month - 1, input.day) / 86400000 + 40) % 60;
  const yearIndex = positiveMod(input.year - 4, 60);
  const monthBranchIndex = positiveMod(input.month + 1, 12);
  const monthGanIndex = positiveMod((yearIndex % 5) * 2 + input.month, 10);
  const hourBranchIndex = getHourBranchIndex(input.hour);
  const hourGanIndex = positiveMod((dayIndex % 5) * 2 + hourBranchIndex, 10);

  return enrichChart({
    input,
    engine: "fallback",
    solarText: `${input.year}-${pad(input.month)}-${pad(input.day)} ${pad(input.hour)}:${pad(input.minute)}`,
    lunarText: "未加载农历库，显示公历学习盘",
    pillars: {
      year: ganzhiByIndex(yearIndex),
      month: { gan: GAN[monthGanIndex], zhi: ZHI[monthBranchIndex] },
      day: ganzhiByIndex(dayIndex),
      hour: { gan: GAN[hourGanIndex], zhi: ZHI[hourBranchIndex] },
    },
    lunarMonth: input.month,
    lunarDay: input.day,
    date,
  });
}

function enrichChart(chart) {
  const dayMaster = chart.pillars.day.gan;
  const elementCounts = countElements(chart.pillars);
  const ziwei = buildZiweiFrame(chart);

  return {
    ...chart,
    dayMaster,
    elementCounts,
    shiShen: {
      year: getShiShen(dayMaster, chart.pillars.year.gan),
      month: getShiShen(dayMaster, chart.pillars.month.gan),
      day: "日主",
      hour: getShiShen(dayMaster, chart.pillars.hour.gan),
    },
    cangGan: {
      year: CANG_GAN[chart.pillars.year.zhi] || [],
      month: CANG_GAN[chart.pillars.month.zhi] || [],
      day: CANG_GAN[chart.pillars.day.zhi] || [],
      hour: CANG_GAN[chart.pillars.hour.zhi] || [],
    },
    ziwei,
    reading: buildLocalReading(dayMaster, elementCounts, ziwei),
  };
}

function renderChart(chart) {
  astroEmpty.hidden = true;
  astroOutput.hidden = false;

  basicSummary.innerHTML = [
    ["姓名", chart.input.name],
    ["性别", chart.input.gender === "male" ? "男" : "女"],
    ["公历", chart.solarText],
    ["农历", chart.lunarText],
    ["排盘引擎", chart.engine === "lunar-typescript" ? "lunar-typescript" : "简化兜底"],
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");

  const order = [
    ["year", "年柱"],
    ["month", "月柱"],
    ["day", "日柱"],
    ["hour", "时柱"],
  ];
  baziTable.innerHTML = order.map(([key, label]) => {
    const pillar = chart.pillars[key];
    const cang = chart.cangGan[key].join("、") || "-";
    return `
      <article>
        <span>${label}</span>
        <strong>${pillar.gan}${pillar.zhi}</strong>
        <p>${chart.shiShen[key]} · ${ELEMENT_BY_GAN[pillar.gan]}${ELEMENT_BY_ZHI[pillar.zhi]}</p>
        <em>藏干：${cang}</em>
      </article>
    `;
  }).join("");

  const maxCount = Math.max(...Object.values(chart.elementCounts), 1);
  elementBars.innerHTML = ["木", "火", "土", "金", "水"].map((element) => {
    const count = chart.elementCounts[element] || 0;
    const width = Math.max(8, Math.round((count / maxCount) * 100));
    return `
      <div class="element-row">
        <span>${element}</span>
        <div><i style="width:${width}%"></i></div>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");

  palaceGrid.innerHTML = chart.ziwei.palaces.map((palace) => `
    <article class="${palace.isMing ? "is-ming" : ""} ${palace.isShen ? "is-shen" : ""}">
      <span>${palace.branch}</span>
      <strong>${palace.name}</strong>
      <p>${palace.note}</p>
    </article>
  `).join("");

  astroReading.innerHTML = chart.reading.map((item) => `<p>${item}</p>`).join("");
}

async function requestAiReading() {
  if (!lastChart) return;

  aiButton.disabled = true;
  aiButton.textContent = "请求中...";
  astroReading.innerHTML = `<p>正在请求 AI 深度解读...</p>`;

  try {
    const response = await fetch(ASTRO_AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart: lastChart }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败：HTTP ${response.status}`);
    astroReading.innerHTML = `<p>${escapeHtml(data.answer || "没有拿到可用结果。").replaceAll("\n", "</p><p>")}</p>`;
  } catch {
    astroReading.innerHTML = lastChart.reading.map((item) => `<p>${item}</p>`).join("");
    astroReading.insertAdjacentHTML("beforeend", "<p>AI 接口暂不可用，已显示本地学习参考解读。</p>");
  } finally {
    aiButton.disabled = false;
    aiButton.textContent = "AI 深度解读";
  }
}

function buildZiweiFrame(chart) {
  const monthIndex = positiveMod(chart.lunarMonth - 1, 12);
  const hourIndex = getHourBranchIndex(chart.input.hour);
  const mingIndex = positiveMod(2 + monthIndex - hourIndex, 12);
  const shenIndex = positiveMod(2 + monthIndex + hourIndex, 12);

  const palaces = PALACE_NAMES.map((name, index) => {
    const branchIndex = positiveMod(mingIndex + index, 12);
    const branch = BRANCH_TO_HOUR[branchIndex];
    const isMing = index === 0;
    const isShen = branchIndex === shenIndex;
    return {
      name,
      branch,
      isMing,
      isShen,
      note: [isMing ? "命宫" : "", isShen ? "身宫" : ""].filter(Boolean).join(" / ") || "宫位",
    };
  });

  return { mingIndex, shenIndex, palaces };
}

function buildLocalReading(dayMaster, counts, ziwei) {
  const strongest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  const weakest = Object.entries(counts).sort((a, b) => a[1] - b[1])[0]?.[0] || "-";
  const mingPalace = ziwei.palaces.find((palace) => palace.isMing);
  const shenPalace = ziwei.palaces.find((palace) => palace.isShen);

  return [
    `日主为 ${dayMaster}${ELEMENT_BY_GAN[dayMaster] || ""}，可先从日主五行与月令环境入手做学习分析。`,
    `当前盘面五行统计中，${strongest}相对较多，${weakest}相对较少。这里是天干地支的学习版粗略统计，不等同完整旺衰定论。`,
    `紫微框架中，命宫落 ${mingPalace?.branch || "-"}，身宫落 ${shenPalace?.branch || "-"}，可作为后续学习十二宫主题的入口。`,
    "本结果仅供学习参考。传统术数内容不具备科学预测确定性，请相信科学，理性使用。",
  ];
}

function countElements(pillars) {
  const counts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  Object.values(pillars).forEach((pillar) => {
    counts[ELEMENT_BY_GAN[pillar.gan]] += 1;
    counts[ELEMENT_BY_ZHI[pillar.zhi]] += 1;
  });
  return counts;
}

function getShiShen(dayGan, targetGan) {
  const dayElement = ELEMENT_BY_GAN[dayGan];
  const targetElement = ELEMENT_BY_GAN[targetGan];
  const sameYinYang = GAN.indexOf(dayGan) % 2 === GAN.indexOf(targetGan) % 2;
  if (dayGan === targetGan) return "比肩";
  if (dayElement === targetElement) return sameYinYang ? "比肩" : "劫财";
  if (generates(dayElement, targetElement)) return sameYinYang ? "食神" : "伤官";
  if (generates(targetElement, dayElement)) return sameYinYang ? "偏印" : "正印";
  if (controls(dayElement, targetElement)) return sameYinYang ? "偏财" : "正财";
  if (controls(targetElement, dayElement)) return sameYinYang ? "七杀" : "正官";
  return "关系";
}

function generates(a, b) {
  return { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" }[a] === b;
}

function controls(a, b) {
  return { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" }[a] === b;
}

function splitGanzhi(value) {
  return { gan: value.slice(0, 1), zhi: value.slice(1, 2) };
}

function ganzhiByIndex(index) {
  return { gan: GAN[positiveMod(index, 10)], zhi: ZHI[positiveMod(index, 12)] };
}

function getHourBranchIndex(hour) {
  return Math.floor((hour + 1) / 2) % 12;
}

function positiveMod(value, length) {
  return ((value % length) + length) % length;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
