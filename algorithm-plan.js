const STORAGE_KEY = "shisan_hot100_plan_v1";
const state = loadState();

const week1 = document.querySelector("#week1");
const week1Mount = document.querySelector("#week1Mount");
week1Mount.appendChild(week1);

document.querySelectorAll(".week-route").forEach((route) => {
  route.addEventListener("toggle", () => {
    if (route.open && route.id === "weekRoute1") {
      requestAnimationFrame(() => route.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  });
});

if (new URLSearchParams(window.location.search).get("week") === "1") {
  document.querySelector("#weekRoute1").open = true;
}

document.querySelectorAll("pre code").forEach(buildCodeEditor);

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

function buildCodeEditor(code) {
  const source = code.textContent.replace(/^\n|\n$/g, "");
  const editor = document.createElement("div");
  editor.className = "code-editor";

  const bar = document.createElement("div");
  bar.className = "code-editor-bar";
  bar.innerHTML = '<span class="editor-dot"></span><span class="editor-dot"></span><span class="editor-dot"></span><span>solution.cpp</span>';

  const pre = code.parentElement;
  pre.before(editor);
  editor.append(bar, pre);
  code.innerHTML = source.split("\n").map((line, index) =>
    `<span class="code-line"><span class="line-number">${index + 1}</span>${highlightCpp(line) || "&nbsp;"}</span>`
  ).join("");
}

function highlightCpp(line) {
  const tokenPattern = /(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#\s*[A-Za-z_]+|\b(?:alignas|alignof|and|auto|break|case|catch|class|const|continue|default|delete|do|else|enum|explicit|false|for|if|namespace|new|noexcept|nullptr|operator|or|private|protected|public|return|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typename|using|virtual|while)\b|\b(?:bool|char|double|float|int|long|short|signed|string|unsigned|void|vector|array|unordered_map|unordered_set)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*(?=\s*\())/g;
  let result = "";
  let lastIndex = 0;
  for (const match of line.matchAll(tokenPattern)) {
    result += escapeHtml(line.slice(lastIndex, match.index));
    const token = match[0];
    let className = "tok-function";
    if (token.startsWith("//")) className = "tok-comment";
    else if (token.startsWith('"') || token.startsWith("'")) className = "tok-string";
    else if (token.startsWith("#")) className = "tok-preprocessor";
    else if (/^\d/.test(token)) className = "tok-number";
    else if (/^(bool|char|double|float|int|long|short|signed|string|unsigned|void|vector|array|unordered_map|unordered_set)$/.test(token)) className = "tok-type";
    else if (!/^[A-Za-z_]\w*$/.test(token) || /^(alignas|alignof|and|auto|break|case|catch|class|const|continue|default|delete|do|else|enum|explicit|false|for|if|namespace|new|noexcept|nullptr|operator|or|private|protected|public|return|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typename|using|virtual|while)$/.test(token)) className = "tok-keyword";
    result += `<span class="${className}">${escapeHtml(token)}</span>`;
    lastIndex = match.index + token.length;
  }
  return result + escapeHtml(line.slice(lastIndex));
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

updateProgress();
