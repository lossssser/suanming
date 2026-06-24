const POSTS_ENDPOINT = "https://api.shxgjqaq.com/posts";
const PAGE_SIZE = 20;

const postName = document.querySelector("#postName");
const postCategory = document.querySelector("#postCategory");
const postTitle = document.querySelector("#postTitle");
const postContent = document.querySelector("#postContent");
const postWebsite = document.querySelector("#postWebsite");
const postStatus = document.querySelector("#postStatus");
const postCounter = document.querySelector("#postCounter");
const submitPostButton = document.querySelector("#submitPostButton");
const refreshPostsButton = document.querySelector("#refreshPostsButton");
const loadMoreButton = document.querySelector("#loadMoreButton");
const postFilters = document.querySelector("#postFilters");
const postsList = document.querySelector("#postsList");
const postsCount = document.querySelector("#postsCount");

let activeCategory = "";
let nextCursor = null;
let loadedPosts = [];
let loading = false;

submitPostButton.addEventListener("click", submitPost);
refreshPostsButton.addEventListener("click", () => loadPosts({ reset: true }));
loadMoreButton.addEventListener("click", () => loadPosts({ reset: false }));
postContent.addEventListener("input", updateCounter);
postFilters.addEventListener("click", handleFilterClick);

updateCounter();
loadPosts({ reset: true });

async function submitPost() {
  const nickname = postName.value.trim() || "游客";
  const category = postCategory.value;
  const title = postTitle.value.trim();
  const content = postContent.value.trim();

  if (!title) {
    setStatus("请先写一个标题。", "error");
    postTitle.focus();
    return;
  }
  if (content.length < 4) {
    setStatus("详细内容至少写 4 个字，方便大家看懂。", "error");
    postContent.focus();
    return;
  }

  submitPostButton.disabled = true;
  setStatus("正在发布...", "pending");

  try {
    const response = await fetch(POSTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname,
        category,
        title,
        content,
        website: postWebsite.value,
      }),
    });
    const data = await readJson(response);

    postTitle.value = "";
    postContent.value = "";
    updateCounter();
    setStatus("发布成功，你的帖子已经出现在留言板中。", "success");
    await loadPosts({ reset: true });
  } catch (error) {
    setStatus(error.message || "发布失败，请稍后再试。", "error");
  } finally {
    submitPostButton.disabled = false;
  }
}

async function loadPosts({ reset }) {
  if (loading) return;
  loading = true;
  refreshPostsButton.disabled = true;
  loadMoreButton.disabled = true;

  if (reset) {
    nextCursor = null;
    loadedPosts = [];
    postsList.innerHTML = '<div class="history-empty">正在加载留言...</div>';
  }

  try {
    const url = new URL(POSTS_ENDPOINT);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (activeCategory) url.searchParams.set("category", activeCategory);
    if (!reset && nextCursor) url.searchParams.set("before", String(nextCursor));

    const response = await fetch(url, { method: "GET" });
    const data = await readJson(response);
    loadedPosts = reset ? data.posts : loadedPosts.concat(data.posts || []);
    nextCursor = data.nextCursor || null;
    postsCount.textContent = `${data.total || 0} 条`;
    renderPosts(loadedPosts);
    loadMoreButton.hidden = !nextCursor;
  } catch (error) {
    if (reset) {
      postsList.innerHTML = `<div class="history-empty">${escapeHtml(error.message || "加载失败，请稍后再试。")}</div>`;
      postsCount.textContent = "";
    }
  } finally {
    loading = false;
    refreshPostsButton.disabled = false;
    loadMoreButton.disabled = false;
  }
}

function handleFilterClick(event) {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category || "";
  postFilters.querySelectorAll(".filter-button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  loadPosts({ reset: true });
}

function renderPosts(posts) {
  if (!posts.length) {
    postsList.innerHTML = '<div class="history-empty">这个分类还没有留言，来发布第一帖吧。</div>';
    return;
  }

  postsList.innerHTML = posts.map((post) => {
    const title = post.title || "留言建议";
    const category = post.category || "其他";
    return `<article class="post-card">
      <header>
        <div class="post-author">
          <span class="post-avatar" aria-hidden="true">${escapeHtml(getInitial(post.nickname))}</span>
          <div>
            <strong>${escapeHtml(post.nickname || "游客")}</strong>
            <time datetime="${escapeHtml(post.created_at || "")}">${escapeHtml(formatTime(post.created_at))}</time>
          </div>
        </div>
        <span class="post-category">${escapeHtml(category)}</span>
      </header>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(post.content || "")}</p>
      <footer>#${escapeHtml(post.id || "")}</footer>
    </article>`;
  }).join("");
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：HTTP ${response.status}`);
  }
  return data;
}

function updateCounter() {
  postCounter.textContent = `${postContent.value.length} / 800`;
}

function setStatus(message, state) {
  postStatus.textContent = message;
  postStatus.dataset.state = state;
}

function getInitial(value) {
  return Array.from(String(value || "游").trim())[0] || "游";
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}
