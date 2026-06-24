const RECORDS_KEY = "shisan_quant_test_records_v1";
const NOTES_KEY = "shisan_quant_test_notes_v1";

const form = document.querySelector("#recordForm");
const fields = {
  date: document.querySelector("#tradeDate"),
  name: document.querySelector("#tradeName"),
  code: document.querySelector("#tradeCode"),
  buyPrice: document.querySelector("#buyPrice"),
  sellPrice: document.querySelector("#sellPrice"),
  marketValue: document.querySelector("#marketValue"),
  remark: document.querySelector("#tradeRemark"),
};
const changeRate = document.querySelector("#changeRate");
const formTitle = document.querySelector("#formTitle");
const formStatus = document.querySelector("#formStatus");
const cancelEditButton = document.querySelector("#cancelEditButton");
const recordRows = document.querySelector("#recordRows");
const emptyRecords = document.querySelector("#emptyRecords");
const recordSearch = document.querySelector("#recordSearch");
const recordCount = document.querySelector("#recordCount");
const averageChange = document.querySelector("#averageChange");
const latestMarketValue = document.querySelector("#latestMarketValue");
const exportButton = document.querySelector("#exportButton");
const clearButton = document.querySelector("#clearButton");
const notes = document.querySelector("#recordNotes");
const noteStatus = document.querySelector("#noteStatus");
const noteCounter = document.querySelector("#noteCounter");
const clearNotesButton = document.querySelector("#clearNotesButton");

let records = loadJson(RECORDS_KEY, []);
let editingId = null;
let noteTimer = null;

fields.date.value = localDate();
notes.value = localStorage.getItem(NOTES_KEY) || "";
updateChangePreview();
updateNoteCounter();
render();

form.addEventListener("submit", saveRecord);
fields.buyPrice.addEventListener("input", updateChangePreview);
fields.sellPrice.addEventListener("input", updateChangePreview);
recordSearch.addEventListener("input", render);
cancelEditButton.addEventListener("click", resetForm);
exportButton.addEventListener("click", exportCsv);
clearButton.addEventListener("click", clearRecords);
clearNotesButton.addEventListener("click", clearNotes);
recordRows.addEventListener("click", handleRowAction);
notes.addEventListener("input", scheduleNotesSave);

function saveRecord(event) {
  event.preventDefault();
  const buyPrice = Number(fields.buyPrice.value);
  const sellPrice = Number(fields.sellPrice.value);
  if (!(buyPrice > 0) || !(sellPrice >= 0)) {
    setStatus("请填写有效的买入价和卖出价。", true);
    return;
  }

  const oldRecord = records.find((item) => item.id === editingId);
  const record = {
    id: editingId || makeId(),
    date: fields.date.value,
    name: fields.name.value.trim(),
    code: fields.code.value.trim().toUpperCase(),
    buyPrice,
    sellPrice,
    change: calculateChange(buyPrice, sellPrice),
    marketValue: fields.marketValue.value === "" ? null : Number(fields.marketValue.value),
    remark: fields.remark.value.trim(),
    createdAt: oldRecord?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (editingId) {
    records = records.map((item) => item.id === editingId ? record : item);
  } else {
    records.unshift(record);
  }
  persistRecords();
  setStatus(editingId ? "记录已更新。" : "记录已保存。");
  resetForm(false);
  render();
}

function handleRowAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "edit") editRecord(id);
  if (button.dataset.action === "delete") deleteRecord(id);
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  editingId = id;
  Object.entries(fields).forEach(([key, input]) => {
    input.value = record[key] ?? "";
  });
  formTitle.textContent = "编辑交易记录";
  cancelEditButton.hidden = false;
  updateChangePreview();
  document.querySelector(".entry-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteRecord(id) {
  if (!confirm("确定删除这条记录吗？")) return;
  records = records.filter((item) => item.id !== id);
  persistRecords();
  if (editingId === id) resetForm();
  render();
}

function clearRecords() {
  if (!records.length || !confirm("确定清空全部交易记录吗？此操作无法撤销。")) return;
  records = [];
  persistRecords();
  resetForm();
  render();
}

function resetForm(clearStatus = true) {
  editingId = null;
  form.reset();
  fields.date.value = localDate();
  formTitle.textContent = "新增交易记录";
  cancelEditButton.hidden = true;
  updateChangePreview();
  if (clearStatus) setStatus("");
}

function render() {
  const query = recordSearch.value.trim().toLowerCase();
  const visible = records.filter((item) => {
    return !query || `${item.name} ${item.code} ${item.remark}`.toLowerCase().includes(query);
  });

  recordRows.innerHTML = visible.map((item) => `<tr>
    <td>${escapeHtml(item.date)}</td>
    <td>${escapeHtml(item.name)}</td>
    <td class="code-cell">${escapeHtml(item.code)}</td>
    <td>${formatNumber(item.buyPrice, 4)}</td>
    <td>${formatNumber(item.sellPrice, 4)}</td>
    <td class="${item.change >= 0 ? "positive" : "negative"}">${formatPercent(item.change)}</td>
    <td>${item.marketValue == null ? "--" : formatMoney(item.marketValue)}</td>
    <td>${escapeHtml(item.remark || "--")}</td>
    <td><div class="row-actions">
      <button type="button" data-action="edit" data-id="${item.id}">编辑</button>
      <button type="button" data-action="delete" data-id="${item.id}">删除</button>
    </div></td>
  </tr>`).join("");

  emptyRecords.hidden = visible.length > 0;
  updateSummary();
}

function updateSummary() {
  recordCount.textContent = records.length;
  if (!records.length) {
    averageChange.textContent = "--";
    averageChange.className = "";
    latestMarketValue.textContent = "--";
    return;
  }
  const average = records.reduce((sum, item) => sum + Number(item.change || 0), 0) / records.length;
  averageChange.textContent = formatPercent(average);
  averageChange.className = average >= 0 ? "positive" : "negative";
  const latest = records.find((item) => item.marketValue != null);
  latestMarketValue.textContent = latest ? formatMoney(latest.marketValue) : "--";
}

function updateChangePreview() {
  const buy = Number(fields.buyPrice.value);
  const sell = Number(fields.sellPrice.value);
  changeRate.value = buy > 0 && sell >= 0 ? formatPercent(calculateChange(buy, sell)) : "";
}

function scheduleNotesSave() {
  updateNoteCounter();
  noteStatus.textContent = "保存中...";
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    localStorage.setItem(NOTES_KEY, notes.value);
    noteStatus.textContent = "已自动保存";
  }, 400);
}

function clearNotes() {
  if (!notes.value || !confirm("确定清空右侧全部笔记吗？")) return;
  notes.value = "";
  localStorage.removeItem(NOTES_KEY);
  noteStatus.textContent = "笔记已清空";
  updateNoteCounter();
}

function exportCsv() {
  if (!records.length) {
    setStatus("目前没有可导出的记录。", true);
    return;
  }
  const rows = [
    ["日期", "名字", "交易代码", "买入价", "卖出价", "涨幅", "卖出后市值", "备注"],
    ...records.map((item) => [
      item.date, item.name, item.code, item.buyPrice, item.sellPrice,
      formatPercent(item.change), item.marketValue ?? "", item.remark,
    ]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `量化测试数据_${localDate()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function persistRecords() {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function calculateChange(buy, sell) {
  return ((sell - buy) / buy) * 100;
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

function formatNumber(value, digits) {
  return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatMoney(value) {
  return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function setStatus(message, isError = false) {
  formStatus.textContent = message;
  formStatus.style.color = isError ? "#cf222e" : "#1a7f37";
}

function updateNoteCounter() {
  noteCounter.textContent = `${notes.value.length} / 20000`;
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}
