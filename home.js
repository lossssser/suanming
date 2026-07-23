const searchForm = document.querySelector("#toolSearchForm");
const searchInput = document.querySelector("#toolSearch");
const searchHint = document.querySelector("#searchHint");
const cards = Array.from(document.querySelectorAll(".tool-card"));

searchInput.addEventListener("input", applySearch);
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (getQuery() === "868") {
    window.location.href = "quant-record.html";
    return;
  }
  if (getQuery() === "202") {
    window.location.href = "trpg.html";
    return;
  }
  if (getQuery() === "13") {
    window.location.href = "resume.html";
    return;
  }
  if (getQuery() === "7788") {
    window.location.href = "interview-7788.html";
    return;
  }
  applySearch();
});

function applySearch() {
  const query = getQuery();
  let visibleCount = 0;

  cards.forEach((card) => {
    const haystack = [
      card.textContent,
      card.dataset.keywords || "",
    ].join(" ").toLowerCase();

    const matched = !query || haystack.includes(query);
    card.hidden = !matched;
    if (matched) visibleCount += 1;
  });

  if (query && visibleCount === 0) {
    searchHint.textContent = "没有找到匹配的小工具。";
  } else {
    searchHint.textContent = "输入关键词可以筛选已有小工具。";
  }
}

function getQuery() {
  return searchInput.value.trim().toLowerCase();
}
