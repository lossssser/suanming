const API_ENDPOINT = "https://api.shxgjqaq.com/github-hot";

const periodSelect = document.querySelector("#periodSelect");
const languageSelect = document.querySelector("#languageSelect");
const keywordInput = document.querySelector("#keywordInput");
const loadButton = document.querySelector("#loadHotButton");
const hotStatus = document.querySelector("#hotStatus");
const hotNote = document.querySelector("#hotNote");
const fastestMeta = document.querySelector("#fastestMeta");
const practicalMeta = document.querySelector("#practicalMeta");
const fastestList = document.querySelector("#fastestList");
const practicalList = document.querySelector("#practicalList");

loadButton.addEventListener("click", loadHotRepos);
keywordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadHotRepos();
});

loadHotRepos();

async function loadHotRepos() {
  setLoading(true);
  const params = new URLSearchParams({
    period: periodSelect.value,
  });

  if (languageSelect.value) params.set("language", languageSelect.value);
  if (keywordInput.value.trim()) params.set("keyword", keywordInput.value.trim());

  try {
    const response = await fetch(`${API_ENDPOINT}?${params.toString()}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `请求失败：HTTP ${response.status}`);
    }

    renderData(data);
  } catch (error) {
    hotStatus.textContent = error.message || "加载失败，请稍后再试。";
    fastestList.innerHTML = "";
    practicalList.innerHTML = "";
    fastestMeta.textContent = "-";
    practicalMeta.textContent = "-";
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  loadButton.disabled = loading;
  loadButton.textContent = loading ? "加载中..." : "刷新榜单";
  if (loading) {
    hotStatus.textContent = "正在从 GitHub 拉取仓库数据。";
  }
}

function renderData(data) {
  const rangeText = data.period === "month" ? "最近一月" : "最近一周";
  const languageText = data.language ? `，语言：${data.language}` : "";
  const keywordText = data.keyword ? `，关键词：${data.keyword}` : "";

  hotStatus.textContent = `${rangeText}${languageText}${keywordText}，从 ${data.since} 起统计，读取 ${data.fetchedCount} 个候选仓库。`;
  hotNote.textContent = data.note || "榜单仅供发现项目使用。";
  fastestMeta.textContent = `${data.fastest.length} 个`;
  practicalMeta.textContent = `${data.practical.length} 个`;
  fastestList.innerHTML = renderRepos(data.fastest, "velocity");
  practicalList.innerHTML = renderRepos(data.practical, "practical");
}

function renderRepos(repos, mode) {
  if (!repos.length) {
    return `<p class="repo-empty">没有找到匹配的仓库，可以换一个语言或关键词。</p>`;
  }

  return repos.map((repo, index) => {
    const topics = repo.topics.length
      ? `<div class="repo-topics">${repo.topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}</div>`
      : "";
    const scoreLabel = mode === "velocity"
      ? `日均 ${repo.starVelocity} stars`
      : `实用分 ${repo.practicalScore}`;

    return `
      <article class="repo-card">
        <div class="repo-rank">${index + 1}</div>
        <div class="repo-content">
          <header>
            <a href="${repo.url}" target="_blank" rel="noreferrer">${escapeHtml(repo.fullName)}</a>
            <span>${scoreLabel}</span>
          </header>
          <p>${escapeHtml(repo.description)}</p>
          <div class="repo-meta">
            <span>${escapeHtml(repo.language)}</span>
            <span>${repo.stars.toLocaleString()} stars</span>
            <span>${repo.forks.toLocaleString()} forks</span>
            <span>更新 ${formatDate(repo.updatedAt)}</span>
          </div>
          ${topics}
        </div>
      </article>
    `;
  }).join("");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
