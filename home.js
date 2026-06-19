const searchInput = document.querySelector("#toolSearch");
const searchHint = document.querySelector("#searchHint");
const cards = Array.from(document.querySelectorAll(".tool-card"));
const secretCards = Array.from(document.querySelectorAll(".secret-tool"));

searchInput.addEventListener("input", applySearch);

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();
  const secretUnlocked = query === "888";
  let visibleCount = 0;

  secretCards.forEach((card) => {
    card.hidden = !secretUnlocked;
  });

  cards.forEach((card) => {
    if (card.classList.contains("secret-tool") && !secretUnlocked) {
      return;
    }

    const haystack = [
      card.textContent,
      card.dataset.keywords || "",
      card.dataset.secret || "",
    ].join(" ").toLowerCase();

    const matched = !query || haystack.includes(query) || secretUnlocked;
    card.hidden = !matched;
    if (matched) visibleCount += 1;
  });

  if (secretUnlocked) {
    searchHint.textContent = "隐藏项目已解锁。";
  } else if (query && visibleCount === 0) {
    searchHint.textContent = "没有找到匹配的小工具。";
  } else {
    searchHint.textContent = "输入关键词可以筛选已有小工具。";
  }
}
