const FEEDBACK_EMAIL = "826552635@qq.com";

const feedbackCard = document.querySelector("#feedbackCard");
const feedbackDialog = document.querySelector("#feedbackDialog");
const feedbackText = document.querySelector("#feedbackText");
const feedbackContact = document.querySelector("#feedbackContact");
const feedbackStatus = document.querySelector("#feedbackStatus");
const sendFeedbackButton = document.querySelector("#sendFeedbackButton");

feedbackCard.addEventListener("click", () => {
  feedbackStatus.textContent = "";
  feedbackDialog.showModal();
  feedbackText.focus();
});

sendFeedbackButton.addEventListener("click", async () => {
  const suggestion = feedbackText.value.trim();
  const contact = feedbackContact.value.trim();

  if (!suggestion) {
    feedbackStatus.textContent = "先写一点想法再发送。";
    feedbackText.focus();
    return;
  }

  const body = [
    "十三的小工具留言",
    "",
    "建议：",
    suggestion,
    "",
    `联系方式：${contact || "未填写"}`,
    `时间：${new Date().toLocaleString("zh-CN")}`,
  ].join("\n");

  await copyFeedback(body);
  const mailto = [
    `mailto:${FEEDBACK_EMAIL}`,
    `?subject=${encodeURIComponent("十三的小工具留言")}`,
    `&body=${encodeURIComponent(body)}`,
  ].join("");

  feedbackStatus.textContent = "已复制留言，并尝试打开邮箱发送。";
  window.location.href = mailto;
});

async function copyFeedback(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    feedbackStatus.textContent = "浏览器不支持自动复制，请手动复制后发送。";
  }
}
