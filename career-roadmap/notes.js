const noteKey = `career-roadmap:${location.pathname}:notes`;
const textarea = document.querySelector("#lessonNotes");
const saveButton = document.querySelector("#saveNotes");
const clearButton = document.querySelector("#clearNotes");
const statusText = document.querySelector("#noteStatus");

textarea.value = localStorage.getItem(noteKey) || "";
updateStatus(textarea.value ? "已加载本地笔记。" : "还没有保存。");

saveButton.addEventListener("click", () => {
  localStorage.setItem(noteKey, textarea.value);
  updateStatus("已保存。");
});

clearButton.addEventListener("click", () => {
  textarea.value = "";
  localStorage.removeItem(noteKey);
  updateStatus("已清空。");
});

textarea.addEventListener("input", () => {
  updateStatus("编辑中，记得保存。");
});

function updateStatus(message) {
  statusText.textContent = message;
}
