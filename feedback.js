const POSTS_ENDPOINT = "https://api.shxgjqaq.com/posts";

const postName = document.querySelector("#postName");
const postContent = document.querySelector("#postContent");
const postStatus = document.querySelector("#postStatus");
const submitPostButton = document.querySelector("#submitPostButton");
const refreshPostsButton = document.querySelector("#refreshPostsButton");
const postsList = document.querySelector("#postsList");

submitPostButton.addEventListener("click", submitPost);
refreshPostsButton.addEventListener("click", loadPosts);

loadPosts();

async function submitPost() {
  const nickname = postName.value.trim() || "游客";
  const content = postContent.value.trim();

  if (!content) {
    postStatus.textContent = "先写一点想法再发布。";
    postContent.focus();
    return;
  }

  submitPostButton.disabled = true;
  postStatus.textContent = "正在发布...";

  try {
    const response = await fetch(POSTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, content }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `发布失败：HTTP ${response.status}`);
    }

    postContent.value = "";
    postStatus.textContent = "发布成功。";
    await loadPosts();
  } catch (error) {
    postStatus.textContent = error.message || "发布失败，请稍后再试。";
  } finally {
    submitPostButton.disabled = false;
  }
}

async function loadPosts() {
  postsList.innerHTML = '<div class="history-empty">正在加载留言...</div>';
  try {
    const response = await fetch(POSTS_ENDPOINT, { method: "GET" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `加载失败：HTTP ${response.status}`);
    }

    renderPosts(data.posts || []);
  } catch (error) {
    postsList.innerHTML = `<div class="history-empty">${escapeHtml(error.message || "加载失败，请稍后再试。")}</div>`;
  }
}

function renderPosts(posts) {
  if (!posts.length) {
    postsList.innerHTML = '<div class="history-empty">还没有留言，来坐第一排。</div>';
    return;
  }

  postsList.innerHTML = posts.map((post) => {
    return `<article class="post-card">
      <header>
        <strong>${escapeHtml(post.nickname || "游客")}</strong>
        <time>${escapeHtml(formatTime(post.created_at))}</time>
      </header>
      <p>${escapeHtml(post.content || "")}</p>
    </article>`;
  }).join("");
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
