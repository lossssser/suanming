const RECORDS_KEY = "shisan_quant_test_records_v1";
const NOTES_KEY = "shisan_quant_test_notes_v1";

const form = document.querySelector("#recordForm");
const fields = {
  date: document.querySelector("#tradeDate"),
  name: document.querySelector("#tradeName"),
  code: document.querySelector("#tradeCode"),
  buyPrice: document.querySelector("#buyPrice"),
  buyShares: document.querySelector("#buyShares"),
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
  const buyPrice = optionalPositiveNumber(fields.buyPrice.value);
  const sellPrice = optionalPositiveNumber(fields.sellPrice.value);
  const buyShares = optionalPositiveNumber(fields.buyShares.value);

  if (buyPrice == null && sellPrice == null) {
    setStatus("买入价和卖出价至少填写一项。", true);
    return;
  }
  if (fields.buyPrice.value !== "" && buyPrice == null) {
    setStatus("买入价必须大于 0。", true);
    return;
  }
  if (fields.sellPrice.value !== "" && sellPrice == null) {
    setStatus("卖出价必须大于 0。", true);
    return;
  }
  if (fields.buyShares.value !== "" && buyShares == null) {
    setStatus("买入股数必须大于 0。", true);
    return;
  }

  const oldRecord = records.find((item) => item.id === editingId);
  const record = {
    id: editingId || makeId(),
    date: fields.date.value,
    name: fields.name.value.trim(),
    code: fields.code.value.trim().toUpperCase(),
    buyPrice,
    buyShares,
    sellPrice,
    change: isCompletedPrice(buyPrice, sellPrice) ? calculateChange(buyPrice, sellPrice) : null,
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
    <td>${item.buyPrice == null ? '<span class="pending-value">待补充</span>' : formatNumber(item.buyPrice, 4)}</td>
    <td>${item.buyShares == null ? '<span class="pending-value">待补充</span>' : formatNumber(item.buyShares, 0)}</td>
    <td>${item.sellPrice == null ? '<span class="pending-value">待补充</span>' : formatNumber(item.sellPrice, 4)}</td>
    <td class="${item.change == null ? "" : item.change >= 0 ? "positive" : "negative"}">${item.change == null ? '<span class="pending-value">待完成</span>' : formatPercent(item.change)}</td>
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
  const completed = records.filter((item) => (
    isCompletedPrice(item.buyPrice, item.sellPrice) && Number(item.buyShares) > 0
  ));
  const totalCost = completed.reduce((sum, item) => sum + item.buyPrice * item.buyShares, 0);
  const totalProfit = completed.reduce((sum, item) => (
    sum + (item.sellPrice - item.buyPrice) * item.buyShares
  ), 0);
  const allCompleted = completed.length === records.length;
  const totalChange = allCompleted && totalCost > 0 ? totalProfit / totalCost * 100 : null;
  averageChange.textContent = totalChange == null ? "--" : formatPercent(totalChange);
  averageChange.className = totalChange == null ? "" : totalChange >= 0 ? "positive" : "negative";
  const latest = records.find((item) => item.marketValue != null);
  latestMarketValue.textContent = latest ? formatMoney(latest.marketValue) : "--";
}

function updateChangePreview() {
  const buy = optionalPositiveNumber(fields.buyPrice.value);
  const sell = optionalPositiveNumber(fields.sellPrice.value);
  changeRate.value = isCompletedPrice(buy, sell) ? formatPercent(calculateChange(buy, sell)) : "待买卖价格齐全";
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
    ["日期", "名字", "交易代码", "买入价", "买入股数", "卖出价", "涨幅", "卖出后市值", "备注"],
    ...records.map((item) => [
      item.date, item.name, item.code, item.buyPrice ?? "", item.buyShares ?? "", item.sellPrice ?? "",
      item.change == null ? "" : formatPercent(item.change), item.marketValue ?? "", item.remark,
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

function isCompletedPrice(buy, sell) {
  return Number(buy) > 0 && Number(sell) > 0;
}

function optionalPositiveNumber(value) {
  if (String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
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
