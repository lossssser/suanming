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
      throw new Error(data.error || `Worker 请求失败：HTTP ${response.status}`);
    }

    renderData(data);
  } catch (error) {
    await loadDirectFromGitHub(error);
  } finally {
    setLoading(false);
  }
}

async function loadDirectFromGitHub(workerError) {
  const period = periodSelect.value;
  const since = getSinceDate(period);
  const queryParts = [`created:>=${since}`, "stars:>3"];

  if (languageSelect.value) queryParts.push(`language:${languageSelect.value}`);
  if (keywordInput.value.trim()) queryParts.push(keywordInput.value.trim());

  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", queryParts.join(" "));
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "80");

  try {
    hotStatus.textContent = "Worker 暂不可用，正在直连 GitHub API。";
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || `GitHub 请求失败：HTTP ${response.status}`);
    }

    const repos = (data.items || []).map(scoreRepository);
    renderData({
      period,
      since,
      language: languageSelect.value,
      keyword: keywordInput.value.trim(),
      totalCount: data.total_count || 0,
      fetchedCount: repos.length,
      fastest: repos
        .slice()
        .sort((a, b) => b.starVelocity - a.starVelocity || b.stars - a.stars)
        .slice(0, 20),
      practical: repos
        .slice()
        .sort((a, b) => b.practicalScore - a.practicalScore || b.stars - a.stars)
        .slice(0, 20),
      note: `当前使用浏览器直连 GitHub API。Worker 状态：${workerError.message}`,
    });
  } catch (error) {
    hotStatus.textContent = error.message || "加载失败，请稍后再试。";
    fastestList.innerHTML = "";
    practicalList.innerHTML = "";
    fastestMeta.textContent = "-";
    practicalMeta.textContent = "-";
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

function getSinceDate(period) {
  const days = period === "month" ? 30 : 7;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
