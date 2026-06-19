const HEROES = {
  swordsman: { name: "剑士", hp: 42, attack: 5, gold: 8, text: "剑士举盾前行。" },
  mage: { name: "术士", hp: 30, attack: 7, gold: 10, text: "术士点燃一盏冷火。" },
  ranger: { name: "游侠", hp: 34, attack: 5, gold: 16, text: "游侠听见金币落袋的声音。" },
};

const CARDS = [
  { title: "小妖", type: "combat", text: "战斗后获得金币。", weight: 14, run: (s) => fight(s, 7, 5, "击退小妖。") },
  { title: "铁皮怪", type: "combat", text: "更硬，也更值钱。", weight: 8, run: (s) => fight(s, 12, 9, "铁皮怪碎成一地铁片。") },
  { title: "血瓶", type: "heal", text: "恢复 9 点生命。", weight: 10, run: (s) => heal(s, 9, "血瓶暖得像一小团火。") },
  { title: "破盾", type: "defense", text: "获得 8 点护甲。", weight: 9, run: (s) => addShield(s, 8, "旧盾挡在身前。") },
  { title: "旧剑", type: "gear", text: "攻击 +1。", weight: 7, run: (s) => buffAttack(s, 1, "剑锋重新亮了一下。") },
  { title: "钱袋", type: "gold", text: "获得 10 金币。", weight: 9, run: (s) => addGold(s, 10, "捡到一个沉甸甸的钱袋。") },
  { title: "陷阱", type: "danger", text: "失去 8 生命，命数 +1。", weight: 7, run: (s) => trap(s, 8, "地面突然张开。") },
  { title: "黑雾", type: "fate", text: "命数 +2，获得随机祝福。", weight: 5, run: (s) => darkMist(s) },
  { title: "篝火", type: "rest", text: "恢复 12 生命，移除一个诅咒。", weight: 5, run: (s) => campfire(s) },
  { title: "商人", type: "shop", text: "花 10 金币，攻击 +1 并恢复 4 生命。", weight: 5, run: (s) => merchant(s) },
  { title: "深渊门", type: "floor", text: "进入下一层，命数 +1。", weight: 6, run: (s) => nextFloor(s, "你推开一扇没有门框的门。") },
  { title: "宝箱", type: "treasure", text: "随机获得金币、攻击或祝福。", weight: 7, run: (s) => treasure(s) },
];

const BLESSINGS = [
  { name: "锋利", apply: (s) => { s.attack += 1; } },
  { name: "余烬", apply: (s) => { s.hp = Math.min(s.maxHp, s.hp + 8); } },
  { name: "守心", apply: (s) => { s.shield += 10; } },
  { name: "贪财", apply: (s) => { s.gold += 14; } },
];

let state;

const heroSelect = document.querySelector("#heroSelect");
const gameBoard = document.querySelector("#gameBoard");
const gameOver = document.querySelector("#gameOver");
const cardChoices = document.querySelector("#cardChoices");
const eventText = document.querySelector("#eventText");
const restartButton = document.querySelector("#restartButton");

heroSelect.addEventListener("click", (event) => {
  const button = event.target.closest("[data-hero]");
  if (!button) return;
  startGame(button.dataset.hero);
});
restartButton.addEventListener("click", () => {
  gameOver.hidden = true;
  gameBoard.hidden = true;
  heroSelect.hidden = false;
});

function startGame(heroKey) {
  const hero = HEROES[heroKey];
  state = {
    heroKey,
    heroName: hero.name,
    floor: 1,
    maxHp: hero.hp,
    hp: hero.hp,
    shield: 0,
    attack: hero.attack,
    gold: hero.gold,
    fate: 0,
    blessings: [],
    curses: [],
    ended: false,
  };
  heroSelect.hidden = true;
  gameBoard.hidden = false;
  eventText.textContent = hero.text;
  drawChoices();
  render();
}

function drawChoices() {
  const pool = [...CARDS];
  if (state.floor % 5 === 0) {
    pool.push({ title: "守门者", type: "boss", text: "阶段 Boss。胜利后进入下一层并获得祝福。", weight: 12, run: boss });
  }
  const choices = [];
  while (choices.length < 4) {
    const card = weightedPick(pool);
    if (!choices.includes(card)) choices.push(card);
  }

  cardChoices.innerHTML = choices.map((card, index) => `
    <button class="choice-card card-${card.type}" type="button" data-index="${index}">
      <span>${card.type}</span>
      <strong>${card.title}</strong>
      <p>${card.text}</p>
    </button>
  `).join("");

  cardChoices.querySelectorAll(".choice-card").forEach((button, index) => {
    button.addEventListener("click", () => chooseCard(choices[index]));
  });
}

function chooseCard(card) {
  if (state.ended) return;
  card.run(state);
  if (state.hp <= 0) {
    endGame(false);
    return;
  }
  if (state.floor > 20) {
    endGame(true);
    return;
  }
  drawChoices();
  render();
}

function fight(s, power, reward, text) {
  const damage = Math.max(0, power + Math.floor(s.fate / 2) - s.attack);
  takeDamage(s, damage);
  s.gold += reward + (s.heroKey === "ranger" ? 2 : 0);
  eventText.textContent = `${text} 受到 ${damage} 点伤害，获得 ${reward} 金币。`;
}

function boss(s) {
  const damage = Math.max(0, 18 + s.fate - s.attack);
  takeDamage(s, damage);
  addBlessing(s);
  nextFloor(s, `击败守门者，承受 ${damage} 点伤害。`);
}

function heal(s, amount, text) {
  s.hp = Math.min(s.maxHp, s.hp + amount);
  eventText.textContent = text;
}

function addShield(s, amount, text) {
  s.shield += amount;
  eventText.textContent = text;
}

function buffAttack(s, amount, text) {
  s.attack += amount;
  eventText.textContent = text;
}

function addGold(s, amount, text) {
  s.gold += amount + (s.heroKey === "ranger" ? 3 : 0);
  eventText.textContent = text;
}

function trap(s, damage, text) {
  takeDamage(s, damage);
  s.fate += 1;
  s.curses.push("裂伤");
  eventText.textContent = `${text} 失去 ${damage} 生命，命数上升。`;
}

function darkMist(s) {
  s.fate += 2;
  addBlessing(s);
  if (s.heroKey === "mage") addBlessing(s);
  eventText.textContent = "黑雾钻进掌心，命数变重，祝福也随之降临。";
}

function campfire(s) {
  s.hp = Math.min(s.maxHp, s.hp + 12);
  const removed = s.curses.shift();
  eventText.textContent = removed ? `篝火烧掉了诅咒：${removed}。` : "篝火安静燃烧，恢复了生命。";
}

function merchant(s) {
  if (s.gold < 10) {
    eventText.textContent = "商人看了看你的钱袋，摇了摇头。";
    return;
  }
  s.gold -= 10;
  s.attack += 1;
  s.hp = Math.min(s.maxHp, s.hp + 4);
  eventText.textContent = "商人卖给你一把不太新的好刀。";
}

function nextFloor(s, text) {
  s.floor += 1;
  s.fate += 1;
  if (s.heroKey === "swordsman") s.shield += 2;
  eventText.textContent = text;
}

function treasure(s) {
  const roll = randomInt(3);
  if (roll === 0) addGold(s, 18, "宝箱里全是金币。");
  if (roll === 1) buffAttack(s, 2, "宝箱里躺着一枚剑形护符。");
  if (roll === 2) {
    addBlessing(s);
    eventText.textContent = "宝箱打开时，里面飞出一枚祝福。";
  }
}

function addBlessing(s) {
  const blessing = BLESSINGS[randomInt(BLESSINGS.length)];
  s.blessings.push(blessing.name);
  blessing.apply(s);
}

function takeDamage(s, amount) {
  const blocked = Math.min(s.shield, amount);
  s.shield -= blocked;
  s.hp -= amount - blocked;
}

function render() {
  document.querySelector("#heroName").textContent = state.heroName;
  document.querySelector("#floorValue").textContent = state.floor;
  document.querySelector("#hpValue").textContent = `${state.hp}/${state.maxHp}`;
  document.querySelector("#shieldValue").textContent = state.shield;
  document.querySelector("#attackValue").textContent = state.attack;
  document.querySelector("#goldValue").textContent = state.gold;
  document.querySelector("#fateValue").textContent = state.fate;
  renderTags("#blessingList", state.blessings, "暂无祝福");
  renderTags("#curseList", state.curses, "暂无诅咒");
}

function renderTags(selector, items, emptyText) {
  const target = document.querySelector(selector);
  target.innerHTML = items.length
    ? items.map((item) => `<span>${item}</span>`).join("")
    : `<em>${emptyText}</em>`;
}

function endGame(won) {
  state.ended = true;
  gameBoard.hidden = true;
  gameOver.hidden = false;
  document.querySelector("#gameOverTitle").textContent = won ? "你走出了深渊" : "深渊止步";
  document.querySelector("#gameOverText").textContent = won
    ? `通关成功。最终命数 ${state.fate}，金币 ${state.gold}。`
    : `你倒在第 ${state.floor} 层。最终命数 ${state.fate}，金币 ${state.gold}。`;
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[0];
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}
