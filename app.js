const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const BRANCH_ELEMENT = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

const TRIGRAMS = {
  "111": ["乾", "天", "金"], "110": ["兑", "泽", "金"],
  "101": ["离", "火", "火"], "100": ["震", "雷", "木"],
  "011": ["巽", "风", "木"], "010": ["坎", "水", "水"],
  "001": ["艮", "山", "土"], "000": ["坤", "地", "土"],
};
const TRIGRAM_BITS = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
const HEXAGRAMS = {
  "乾|乾": [1, "乾为天"], "兑|乾": [43, "泽天夬"], "离|乾": [14, "火天大有"], "震|乾": [34, "雷天大壮"],
  "巽|乾": [9, "风天小畜"], "坎|乾": [5, "水天需"], "艮|乾": [26, "山天大畜"], "坤|乾": [11, "地天泰"],
  "乾|兑": [10, "天泽履"], "兑|兑": [58, "兑为泽"], "离|兑": [38, "火泽睽"], "震|兑": [54, "雷泽归妹"],
  "巽|兑": [61, "风泽中孚"], "坎|兑": [60, "水泽节"], "艮|兑": [41, "山泽损"], "坤|兑": [19, "地泽临"],
  "乾|离": [13, "天火同人"], "兑|离": [49, "泽火革"], "离|离": [30, "离为火"], "震|离": [55, "雷火丰"],
  "巽|离": [37, "风火家人"], "坎|离": [63, "水火既济"], "艮|离": [22, "山火贲"], "坤|离": [36, "地火明夷"],
  "乾|震": [25, "天雷无妄"], "兑|震": [17, "泽雷随"], "离|震": [21, "火雷噬嗑"], "震|震": [51, "震为雷"],
  "巽|震": [42, "风雷益"], "坎|震": [3, "水雷屯"], "艮|震": [27, "山雷颐"], "坤|震": [24, "地雷复"],
  "乾|巽": [44, "天风姤"], "兑|巽": [28, "泽风大过"], "离|巽": [50, "火风鼎"], "震|巽": [32, "雷风恒"],
  "巽|巽": [57, "巽为风"], "坎|巽": [48, "水风井"], "艮|巽": [18, "山风蛊"], "坤|巽": [46, "地风升"],
  "乾|坎": [6, "天水讼"], "兑|坎": [47, "泽水困"], "离|坎": [64, "火水未济"], "震|坎": [40, "雷水解"],
  "巽|坎": [59, "风水涣"], "坎|坎": [29, "坎为水"], "艮|坎": [4, "山水蒙"], "坤|坎": [7, "地水师"],
  "乾|艮": [33, "天山遁"], "兑|艮": [31, "泽山咸"], "离|艮": [56, "火山旅"], "震|艮": [62, "雷山小过"],
  "巽|艮": [53, "风山渐"], "坎|艮": [39, "水山蹇"], "艮|艮": [52, "艮为山"], "坤|艮": [15, "地山谦"],
  "乾|坤": [12, "天地否"], "兑|坤": [45, "泽地萃"], "离|坤": [35, "火地晋"], "震|坤": [16, "雷地豫"],
  "巽|坤": [20, "风地观"], "坎|坤": [8, "水地比"], "艮|坤": [23, "山地剥"], "坤|坤": [2, "坤为地"],
};
const PALACE_SEQUENCE = [
  ["本宫", 0b000000, 6], ["一世", 0b000001, 1], ["二世", 0b000011, 2], ["三世", 0b000111, 3],
  ["四世", 0b001111, 4], ["五世", 0b011111, 5], ["游魂", 0b010111, 4], ["归魂", 0b010000, 3],
];
const PALACE_ELEMENT = { 乾: "金", 兑: "金", 离: "火", 震: "木", 巽: "木", 坎: "水", 艮: "土", 坤: "土" };
const NAYIN_BRANCHES = {
  乾: ["子", "寅", "辰", "午", "申", "戌"], 坤: ["未", "巳", "卯", "丑", "亥", "酉"],
  坎: ["寅", "辰", "午", "申", "戌", "子"], 艮: ["辰", "午", "申", "戌", "子", "寅"],
  震: ["子", "寅", "辰", "午", "申", "戌"], 巽: ["丑", "亥", "酉", "未", "巳", "卯"],
  离: ["卯", "丑", "亥", "酉", "未", "巳"], 兑: ["巳", "卯", "丑", "亥", "酉", "未"],
};
const SIX_SPIRITS = {
  甲: ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"], 乙: ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"],
  丙: ["朱雀", "勾陈", "螣蛇", "白虎", "玄武", "青龙"], 丁: ["朱雀", "勾陈", "螣蛇", "白虎", "玄武", "青龙"],
  戊: ["勾陈", "螣蛇", "白虎", "玄武", "青龙", "朱雀"], 己: ["螣蛇", "白虎", "玄武", "青龙", "朱雀", "勾陈"],
  庚: ["白虎", "玄武", "青龙", "朱雀", "勾陈", "螣蛇"], 辛: ["白虎", "玄武", "青龙", "朱雀", "勾陈", "螣蛇"],
  壬: ["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"], 癸: ["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"],
};
const KONG_WANG = {
  0: ["戌", "亥"], 1: ["申", "酉"], 2: ["午", "未"],
  3: ["辰", "巳"], 4: ["寅", "卯"], 5: ["子", "丑"],
};
const LINE_OPTIONS = [
  ["8", "少阴 8"], ["7", "少阳 7"], ["6", "老阴 6 动"], ["9", "老阳 9 动"],
];
const AI_ENDPOINT = "https://suanming-api.826552635.workers.dev";
const AI_TIMEOUT_MS = 75000;

const form = document.querySelector("#chartForm");
const lineTable = document.querySelector("#lineTable");
const summary = document.querySelector("#summary");
const castTimeInput = document.querySelector("#castTime");
const questionInput = document.querySelector("#question");
const dayInput = document.querySelector("#dayGanzhi");
const aiProviderInput = document.querySelector("#aiProvider");
const aiButton = document.querySelector("#aiButton");
const aiPanel = document.querySelector("#aiPanel");
const aiStatus = document.querySelector("#aiStatus");
const aiAnswer = document.querySelector("#aiAnswer");

function init() {
  aiProviderInput.replaceChildren(
    new Option("DeepSeek", "deepseek"),
    new Option("OpenAI", "openai"),
  );
  aiProviderInput.value = "deepseek";

  document.querySelectorAll('select[name^="line"]').forEach((select, index) => {
    LINE_OPTIONS.forEach(([value, label]) => select.add(new Option(label, value)));
    select.value = index % 2 === 0 ? "8" : "7";
    select.addEventListener("change", clearCoins);
  });
  setCurrentTime();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  document.querySelector("#nowButton").addEventListener("click", () => {
    setCurrentTime();
    render();
  });
  document.querySelector("#randomButton").addEventListener("click", () => {
    randomize();
    render();
  });
  aiButton.addEventListener("click", requestAiReading);
  document.querySelector("#clearButton").addEventListener("click", () => {
    questionInput.value = "";
    dayInput.value = "";
    aiProviderInput.value = "deepseek";
    setCurrentTime();
    document.querySelectorAll('select[name^="line"]').forEach((select) => (select.value = "8"));
    clearCoins();
    clearAiPanel();
    render();
  });
  render();
}

function setCurrentTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  castTimeInput.value = local.toISOString().slice(0, 16);
}

function randomize() {
  [1, 2, 3, 4, 5, 6].forEach((line) => {
    const toss = tossCoins();
    document.querySelector(`[name=line${line}]`).value = String(toss.value);
    renderCoins(line, toss.coins);
  });
}

function render() {
  const chart = buildChart();
  renderSummary(chart);
  renderLines(chart);
  return chart;
}

function buildChart() {
  const values = [1, 2, 3, 4, 5, 6].map((line) => document.querySelector(`[name=line${line}]`).value);
  const parsed = values.map(parseLine);
  const originalBits = parsed.map((line) => line.bit);
  const changedBits = parsed.map((line) => (line.moving ? 1 - line.bit : line.bit));
  const original = hexagramInfo(originalBits);
  const changed = hexagramInfo(changedBits);
  const date = castTimeInput.value ? new Date(castTimeInput.value) : new Date();
  const dayGanzhi = normalizeDay(dayInput.value) || dayGanzhiFromDate(date);
  const emptyBranches = kongWang(dayGanzhi);
  const branches = lineBranches(original.lower, original.upper);
  const spirits = SIX_SPIRITS[dayGanzhi[0]];
  const lines = parsed.map((line, index) => {
    const branch = branches[index];
    const element = BRANCH_ELEMENT[branch];
    return {
      index: index + 1,
      spirit: spirits[index],
      relation: lineRelation(original.palaceElement, element),
      branch,
      element,
      symbol: lineSymbol(line.bit, line.moving),
      changedSymbol: lineSymbol(line.moving ? 1 - line.bit : line.bit, false),
      moving: line.moving,
      marker: index + 1 === original.shi ? "世" : index + 1 === original.ying ? "应" : "",
    };
  });
  return {
    question: questionInput.value.trim() || "未填写",
    castTime: castTimeInput.value ? castTimeInput.value.replace("T", " ") : "",
    dayGanzhi,
    emptyBranches,
    original,
    changed,
    lines,
  };
}

function parseLine(value) {
  if (value === "6") return { bit: 0, moving: true };
  if (value === "7") return { bit: 1, moving: false };
  if (value === "8") return { bit: 0, moving: false };
  return { bit: 1, moving: true };
}

function hexagramInfo(bits) {
  const lower = TRIGRAMS[bits.slice(0, 3).join("")][0];
  const upper = TRIGRAMS[bits.slice(3, 6).join("")][0];
  const [number, name] = HEXAGRAMS[`${upper}|${lower}`];
  const [palace, palaceStage, shi] = findPalace(bits);
  const ying = ((shi + 2) % 6) + 1;
  return {
    number, name, upper, lower, palace, palaceStage, shi, ying,
    palaceElement: PALACE_ELEMENT[palace],
  };
}

function findPalace(bits) {
  const value = bitsToInt(bits);
  for (const [palace, trigramBits] of Object.entries(TRIGRAM_BITS)) {
    const base = bitsToInt([...trigramBits, ...trigramBits]);
    for (const [stage, mask, shi] of PALACE_SEQUENCE) {
      if (value === (base ^ mask)) return [palace, stage, shi];
    }
  }
  throw new Error("无法定位八宫");
}

function bitsToInt(bits) {
  return bits.reduce((sum, bit, index) => sum + (bit << index), 0);
}

function lineRelation(palaceElement, lineElement) {
  if (lineElement === palaceElement) return "兄弟";
  if (GENERATES[lineElement] === palaceElement) return "父母";
  if (GENERATES[palaceElement] === lineElement) return "子孙";
  if (CONTROLS[lineElement] === palaceElement) return "官鬼";
  if (CONTROLS[palaceElement] === lineElement) return "妻财";
  return "";
}

function lineBranches(lower, upper) {
  return [...NAYIN_BRANCHES[lower].slice(0, 3), ...NAYIN_BRANCHES[upper].slice(3, 6)];
}

function lineSymbol(bit, moving) {
  if (bit === 1 && moving) return "━━━ ○";
  if (bit === 0 && moving) return "━ ━ ×";
  return bit === 1 ? "━━━" : "━ ━";
}

function dayGanzhiFromDate(date) {
  const anchor = new Date(1900, 0, 31);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = Math.round((today - anchor) / 86400000);
  return STEMS[((offset % 10) + 10) % 10] + BRANCHES[((4 + offset) % 12 + 12) % 12];
}

function kongWang(dayGanzhi) {
  const stemIndex = STEMS.indexOf(dayGanzhi[0]);
  const branchIndex = BRANCHES.indexOf(dayGanzhi[1]);
  const xunIndex = Math.floor(((branchIndex - stemIndex + 12) % 12) / 2);
  return KONG_WANG[xunIndex];
}

function normalizeDay(value) {
  const text = value.trim();
  if (!text) return "";
  if (text.length !== 2 || !STEMS.includes(text[0]) || !BRANCHES.includes(text[1])) {
    alert("日辰请输入类似“甲子”的两个字，或留空自动计算。");
    dayInput.focus();
    throw new Error("invalid day ganzhi");
  }
  return text;
}

function renderSummary(chart) {
  summary.innerHTML = [
    summaryItem("问题", chart.question),
    summaryItem("时间", `${chart.castTime}<span class="summary-small">日辰 ${chart.dayGanzhi}，空亡 ${chart.emptyBranches.join("")}</span>`),
    summaryItem("本卦", `${chart.original.name}（${chart.original.number}）<span class="summary-small">${chart.original.palace}宫${chart.original.palaceElement}，${chart.original.palaceStage}</span>`),
    summaryItem("变卦", `${chart.changed.name}（${chart.changed.number}）<span class="summary-small">${chart.changed.palace}宫${chart.changed.palaceElement}，${chart.changed.palaceStage}</span>`),
  ].join("");
}

function summaryItem(label, value) {
  return `<div class="summary-item"><span class="summary-label">${escapeHtml(label)}</span><span class="summary-value">${value}</span></div>`;
}

function renderLines(chart) {
  lineTable.innerHTML = chart.lines
    .slice()
    .reverse()
    .map((line) => {
      const marker = line.marker ? `<span class="marker">${line.marker}</span>` : `<span class="empty">-</span>`;
      const movingClass = line.moving ? " yao moving" : "yao";
      return `<tr>
        <td>${line.spirit}</td>
        <td>${line.relation}</td>
        <td>${line.branch}${line.element}</td>
        <td class="${movingClass}">${line.symbol}</td>
        <td>${marker}</td>
        <td class="yao">${line.changedSymbol}</td>
      </tr>`;
    })
    .join("");
}

async function requestAiReading() {
  const chart = render();
  aiPanel.hidden = false;
  aiStatus.textContent = "请求中";
  aiAnswer.textContent = "正在连接 Cloudflare Worker，移动网络下可能需要 10-30 秒...";
  aiButton.disabled = true;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const slowNoticeId = setTimeout(() => {
    aiStatus.textContent = "仍在等待";
    aiAnswer.textContent = "AI 还在生成。如果手机网络较慢，可以稍等片刻，或切换 Wi-Fi 后重试。";
  }, 18000);

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        provider: aiProviderInput.value,
        question: chart.question,
        chart: chartToPayload(chart),
      }),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { answer: text };
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || `请求失败：HTTP ${response.status}`);
    }

    aiStatus.textContent = "已返回";
    aiAnswer.textContent = data.answer || data.result || data.message || JSON.stringify(data, null, 2);
  } catch (error) {
    aiStatus.textContent = "失败";
    const message = error.name === "AbortError"
      ? "请求超时。手机网络下 AI 生成可能被浏览器中断，请切换 Wi-Fi 或稍后再试。"
      : `没有拿到可用结果：${error.message}`;
    aiAnswer.textContent = message;
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(slowNoticeId);
    aiButton.disabled = false;
  }
}

function chartToPayload(chart) {
  return {
    question: chart.question,
    castTime: chart.castTime,
    dayGanzhi: chart.dayGanzhi,
    emptyBranches: chart.emptyBranches,
    original: chart.original,
    changed: chart.changed,
    lines: chart.lines.map((line) => ({
      index: line.index,
      spirit: line.spirit,
      relation: line.relation,
      branch: line.branch,
      element: line.element,
      symbol: line.symbol,
      changedSymbol: line.changedSymbol,
      moving: line.moving,
      marker: line.marker,
    })),
  };
}

function clearAiPanel() {
  aiPanel.hidden = true;
  aiStatus.textContent = "待请求";
  aiAnswer.textContent = "";
}

function tossCoins() {
  const coins = Array.from({ length: 3 }, () => (Math.random() < 0.5 ? "正" : "背"));
  const value = coins.reduce((sum, coin) => sum + (coin === "正" ? 3 : 2), 0);
  return { coins, value };
}

function renderCoins(line, coins) {
  const output = document.querySelector(`[data-coins="${line}"]`);
  output.innerHTML = coins.map((coin) => `<span class="coin-face">${coin}</span>`).join("");
  output.title = `三枚铜钱：${coins.join("、")}`;
}

function clearCoins() {
  document.querySelectorAll("[data-coins]").forEach((output) => {
    output.innerHTML = "";
    output.removeAttribute("title");
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

init();
