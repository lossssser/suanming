const STORAGE_KEY = "shisan_hot100_plan_v1";
const state = loadState();

document.querySelectorAll(".status-select").forEach((select) => {
  select.value = state.status[select.dataset.problem] || "todo";
  select.addEventListener("change", () => {
    state.status[select.dataset.problem] = select.value;
    saveState();
    updateProgress();
  });
});

const noteArea = document.querySelector("#studyNote");
noteArea.value = state.note || "";
let noteTimer;
noteArea.addEventListener("input", () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    state.note = noteArea.value;
    saveState();
    document.querySelector("#saveState").textContent = "笔记已保存到当前浏览器";
  }, 350);
});

function updateProgress() {
  const selects = [...document.querySelectorAll(".status-select")];
  const mastered = selects.filter((item) => item.value === "mastered").length;
  const practicing = selects.filter((item) => item.value === "practicing").length;
  const completed = mastered + practicing;
  const percent = selects.length ? Math.round((completed / selects.length) * 100) : 0;
  document.querySelector("#progressFill").style.width = `${percent}%`;
  document.querySelector("#progressText").textContent = `${completed} / ${selects.length} 题已开始`;
  document.querySelector("#masteredText").textContent = `${mastered} 题已掌握`;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored && stored.status ? stored : { status: {}, note: "" };
  } catch (_) {
    return { status: {}, note: "" };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

updateProgress();
