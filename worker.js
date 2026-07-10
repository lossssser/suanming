export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname === "/posts") {
      try {
        return await handlePosts(request, env, url);
      } catch (error) {
        return json({ error: error.message || "留言服务暂时不可用。" }, 500);
      }
    }

    if (url.pathname === "/github-hot") {
      return handleGitHubHot(request, env, url);
    }

    if (url.pathname === "/quant-data") {
      try {
        return await handleQuantData(request, env);
      } catch (error) {
        return json({ error: error.message || "量化记录服务暂时不可用。" }, 500);
      }
    }

    if (url.pathname === "/trpg") {
      try {
        return await handleTrpg(request, env, url);
      } catch (error) {
        return json({ error: error.message || "跑团服务暂时不可用。" }, 500);
      }
    }

    if (url.pathname === "/werewolf") {
      try {
        return await handleWerewolf(request, env, url);
      } catch (error) {
        return json({ error: error.message || "Werewolf request failed." }, 500);
      }
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST request." }, 405);
    }

    try {
      const body = await request.json();
      const provider = normalizeProvider(body.provider || env.AI_PROVIDER || "deepseek");
      const messages = buildMessages(body);
      const answer = provider === "openai"
        ? await callOpenAI(messages, env)
        : await callDeepSeek(messages, env);

      return json({ answer, provider });
    } catch (error) {
      return json({ error: error.message || "AI reading failed." }, 500);
    }
  },
};

const POST_CATEGORIES = new Set(["工具建议", "功能改进", "问题反馈", "其他"]);

async function handlePosts(request, env, url) {
  if (!env.DB) {
    return json({ error: "留言数据库尚未连接，请检查 Worker 的 DB 绑定。" }, 500);
  }

  await ensurePostsTable(env.DB);

  if (request.method === "GET") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
    const before = Math.max(Number(url.searchParams.get("before")) || 0, 0);
    const category = normalizePostCategory(url.searchParams.get("category"), true);
    const conditions = [];
    const bindings = [];

    if (before) {
      conditions.push("id < ?");
      bindings.push(before);
    }
    if (category) {
      conditions.push("category = ?");
      bindings.push(category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT id, nickname, title, category, content, created_at
      FROM posts ${where} ORDER BY id DESC LIMIT ?`;
    const { results } = await env.DB.prepare(query).bind(...bindings, limit + 1).all();
    const rows = results || [];
    const hasMore = rows.length > limit;
    const posts = hasMore ? rows.slice(0, limit) : rows;

    const countQuery = category
      ? env.DB.prepare("SELECT COUNT(*) AS total FROM posts WHERE category = ?").bind(category)
      : env.DB.prepare("SELECT COUNT(*) AS total FROM posts");
    const countRow = await countQuery.first();

    return json({
      posts,
      total: Number(countRow?.total || 0),
      nextCursor: hasMore ? posts[posts.length - 1]?.id || null : null,
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (cleanText(body.website || "", 120)) {
      return json({ error: "提交未通过验证。" }, 400);
    }

    const nickname = cleanText(body.nickname || "游客", 24) || "游客";
    const title = cleanText(body.title || "", 60);
    const category = normalizePostCategory(body.category);
    const content = cleanText(body.content || "", 800);

    if (!title) {
      return json({ error: "帖子标题不能为空。" }, 400);
    }
    if (content.length < 4) {
      return json({ error: "详细内容至少需要 4 个字。" }, 400);
    }

    const createdAt = new Date().toISOString();
    const result = await env.DB.prepare(
      "INSERT INTO posts (nickname, title, category, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(nickname, title, category, content, createdAt).run();

    return json({
      post: {
        id: result.meta?.last_row_id,
        nickname,
        title,
        category,
        content,
        created_at: createdAt,
      },
    }, 201);
  }

  return json({ error: "Use GET or POST request." }, 405);
}

async function ensurePostsTable(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '留言建议',
      category TEXT NOT NULL DEFAULT '其他',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  ).run();

  const { results } = await db.prepare("PRAGMA table_info(posts)").all();
  const columns = new Set((results || []).map((column) => column.name));
  if (!columns.has("title")) {
    await db.prepare("ALTER TABLE posts ADD COLUMN title TEXT NOT NULL DEFAULT '留言建议'").run();
  }
  if (!columns.has("category")) {
    await db.prepare("ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT '其他'").run();
  }
}

function normalizePostCategory(value, allowEmpty = false) {
  const category = cleanText(value || "", 12);
  if (allowEmpty && !category) return "";
  return POST_CATEGORIES.has(category) ? category : "其他";
}

async function handleQuantData(request, env) {
  if (!env.DB) {
    return json({ error: "量化记录数据库尚未连接，请检查 Worker 的 DB 绑定。" }, 500);
  }

  await ensureQuantTables(env.DB);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, trade_date, name, code, buy_price, buy_shares, sell_price,
        market_value, remark, created_at, updated_at
       FROM quant_records
       ORDER BY trade_date DESC, created_at DESC`,
    ).all();
    const note = await env.DB.prepare(
      "SELECT content, updated_at FROM quant_notes WHERE id = 1",
    ).first();

    return json({
      records: (results || []).map(quantRowToRecord),
      notes: note?.content || "",
      notesUpdatedAt: note?.updated_at || "",
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Use GET or POST request." }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "saveRecord") {
    const record = normalizeQuantRecord(body.record);
    await upsertQuantRecord(env.DB, record);
    return json({ record });
  }

  if (action === "deleteRecord") {
    const id = cleanId(body.id);
    if (!id) return json({ error: "记录 ID 无效。" }, 400);
    await env.DB.prepare("DELETE FROM quant_records WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (action === "clearRecords") {
    await env.DB.prepare("DELETE FROM quant_records").run();
    return json({ ok: true });
  }

  if (action === "saveNotes") {
    const content = String(body.content || "").slice(0, 20000);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO quant_notes (id, content, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    ).bind(content, updatedAt).run();
    return json({ notes: content, updatedAt });
  }

  if (action === "import") {
    const records = Array.isArray(body.records) ? body.records.slice(0, 1000) : [];
    for (const value of records) {
      await upsertQuantRecord(env.DB, normalizeQuantRecord(value));
    }
    if (typeof body.notes === "string" && body.notes) {
      const updatedAt = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO quant_notes (id, content, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = CASE WHEN quant_notes.content = '' THEN excluded.content ELSE quant_notes.content END,
           updated_at = excluded.updated_at`,
      ).bind(body.notes.slice(0, 20000), updatedAt).run();
    }
    return json({ imported: records.length });
  }

  return json({ error: "Unknown action." }, 400);
}

async function ensureQuantTables(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS quant_records (
      id TEXT PRIMARY KEY,
      trade_date TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      buy_price REAL,
      buy_shares REAL,
      sell_price REAL,
      market_value REAL,
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS quant_notes (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

function normalizeQuantRecord(value = {}) {
  const id = cleanId(value.id) || crypto.randomUUID();
  const tradeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || ""))
    ? String(value.date)
    : new Date().toISOString().slice(0, 10);
  const name = cleanText(value.name || "", 40);
  const code = cleanText(value.code || "", 30).toUpperCase();
  const buyPrice = optionalQuantNumber(value.buyPrice);
  const buyShares = optionalQuantNumber(value.buyShares);
  const sellPrice = optionalQuantNumber(value.sellPrice);
  const marketValue = optionalQuantNumber(value.marketValue, true);

  if (!name || !code) throw new Error("名字和交易代码不能为空。");
  if (buyPrice == null && sellPrice == null) throw new Error("买入价和卖出价至少填写一项。");

  const now = new Date().toISOString();
  return {
    id,
    date: tradeDate,
    name,
    code,
    buyPrice,
    buyShares,
    sellPrice,
    marketValue,
    remark: cleanText(value.remark || "", 200),
    createdAt: validIsoDate(value.createdAt) || now,
    updatedAt: validIsoDate(value.updatedAt) || now,
  };
}

async function upsertQuantRecord(db, record) {
  await db.prepare(
    `INSERT INTO quant_records (
      id, trade_date, name, code, buy_price, buy_shares, sell_price,
      market_value, remark, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      trade_date = excluded.trade_date,
      name = excluded.name,
      code = excluded.code,
      buy_price = excluded.buy_price,
      buy_shares = excluded.buy_shares,
      sell_price = excluded.sell_price,
      market_value = excluded.market_value,
      remark = excluded.remark,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at >= quant_records.updated_at`,
  ).bind(
    record.id,
    record.date,
    record.name,
    record.code,
    record.buyPrice,
    record.buyShares,
    record.sellPrice,
    record.marketValue,
    record.remark,
    record.createdAt,
    record.updatedAt,
  ).run();
}

function quantRowToRecord(row) {
  const buyPrice = row.buy_price == null ? null : Number(row.buy_price);
  const sellPrice = row.sell_price == null ? null : Number(row.sell_price);
  return {
    id: row.id,
    date: row.trade_date,
    name: row.name,
    code: row.code,
    buyPrice,
    buyShares: row.buy_shares == null ? null : Number(row.buy_shares),
    sellPrice,
    change: buyPrice > 0 && sellPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : null,
    marketValue: row.market_value == null ? null : Number(row.market_value),
    remark: row.remark || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function optionalQuantNumber(value, allowZero = false) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (allowZero ? number < 0 : number <= 0) return null;
  return number;
}

function validIsoDate(value) {
  const text = String(value || "");
  return Number.isNaN(Date.parse(text)) ? "" : new Date(text).toISOString();
}

const TRPG_PRESETS = [
  {
    id: "jessie",
    name: "杰西·威廉姆斯",
    age: 20,
    occupation: "历史系学生",
    specialty: "历史研究、图书馆调查与人际交往",
    hp: 11,
    san: 65,
    attributes: { 力量: 45, 体质: 55, 体型: 55, 敏捷: 65, 外貌: 70, 智力: 75, 意志: 65, 教育: 65 },
    skills: { 图书馆使用: 70, 历史: 75, 侦查: 55, 说服: 60, 心理学: 50, 聆听: 45, 闪避: 32, 斗殴: 30 },
    background: "密斯卡托尼克大学历史系学生，未解之谜探索协会中最擅长整理旧档案的人。对被主流记录忽略的社区历史格外敏感。",
    inventory: "笔记本、钢笔、袖珍相机、大学图书馆借阅证",
  },
  {
    id: "nevada",
    name: "内华达·琼斯",
    age: 35,
    occupation: "考古学教授",
    specialty: "神秘学、考古、野外行动与古物判断",
    hp: 13,
    san: 60,
    attributes: { 力量: 60, 体质: 65, 体型: 60, 敏捷: 55, 外貌: 50, 智力: 75, 意志: 60, 教育: 80 },
    skills: { 考古学: 75, 神秘学: 60, 侦查: 60, 图书馆使用: 55, 攀爬: 50, 追踪: 45, 闪避: 27, 斗殴: 45 },
    background: "考古学教授，习惯亲自验证传闻。把异常器物视作需要证据而非迷信的问题，但曾见过足以动摇这种信念的遗物。",
    inventory: "手电筒、放大镜、皮革手套、便携工具包",
  },
  {
    id: "lois",
    name: "洛伊丝·卢索",
    age: 19,
    occupation: "工程系学生",
    specialty: "机械维修、电气维修与快速分析",
    hp: 10,
    san: 70,
    attributes: { 力量: 40, 体质: 50, 体型: 50, 敏捷: 70, 外貌: 60, 智力: 80, 意志: 70, 教育: 60 },
    skills: { 机械维修: 75, 电气维修: 70, 侦查: 55, 科学工程: 65, 锁匠: 45, 急救: 40, 闪避: 35, 斗殴: 25 },
    background: "年轻的工程系学生，擅长拆解机械结构。对乐器的构造和异常声学现象有天然兴趣，不轻易接受所谓魔法解释。",
    inventory: "多用工具、线圈、绝缘胶带、小型测量仪",
  },
  {
    id: "wentworth",
    name: "温特沃夫·埃夫伯里",
    age: 58,
    occupation: "语言学教授",
    specialty: "语言、密码、文献与学术知识",
    hp: 10,
    san: 55,
    attributes: { 力量: 35, 体质: 45, 体型: 55, 敏捷: 45, 外貌: 55, 智力: 85, 意志: 55, 教育: 90 },
    skills: { 语言学: 80, 图书馆使用: 80, 神秘学: 55, 历史: 65, 心理学: 55, 说服: 50, 闪避: 22, 斗殴: 20 },
    background: "资深语言学教授，能辨识多种古代文字。阅历让他保持克制，但他也知道有些符号并不属于任何人类语言。",
    inventory: "老花镜、词源笔记、手杖、装有参考书的皮包",
  },
  {
    id: "keiko",
    name: "惠子·凯恩",
    age: 21,
    occupation: "理科生",
    specialty: "医学常识、化学分析与细致观察",
    hp: 11,
    san: 65,
    attributes: { 力量: 45, 体质: 55, 体型: 50, 敏捷: 70, 外貌: 65, 智力: 80, 意志: 65, 教育: 65 },
    skills: { 医学: 60, 急救: 70, 科学化学: 65, 侦查: 65, 聆听: 55, 心理学: 45, 闪避: 35, 斗殴: 25 },
    background: "理科生，正在接受医学与化学训练。对尸体反应和药物影响有专业认识，习惯用观察结果挑战不合理的结论。",
    inventory: "急救包、采样瓶、口罩、袖珍手电",
  },
];

const TRPG_TOOTH_FAIRY_PRESETS = [
  {
    id: "caretaker",
    name: "艾琳·惠特曼",
    age: 27,
    occupation: "家庭教师",
    specialty: "照看孩子、讲故事、心理观察与交涉",
    hp: 10,
    san: 70,
    attributes: { 力量: 40, 体质: 50, 体型: 50, 敏捷: 60, 外貌: 65, 智力: 70, 意志: 70, 教育: 75 },
    skills: { 说服: 70, 心理学: 60, 聆听: 60, 侦查: 55, 图书馆使用: 55, 急救: 45, 神秘学: 25, 闪避: 30, 斗殴: 25 },
    background: "受马修父母委托来家中照看孩子的家庭教师。你擅长让孩子安心，也习惯从孩子随口说出的童话里听出真正的恐惧。",
    inventory: "故事书、钢笔、记事本、怀表、简易急救用品、重要之物：母亲留下的银质书签",
  },
  {
    id: "medical-student",
    name: "托马斯·里德",
    age: 24,
    occupation: "医学生",
    specialty: "急救、医学判断、理性分析与体力行动",
    hp: 12,
    san: 60,
    attributes: { 力量: 55, 体质: 60, 体型: 55, 敏捷: 55, 外貌: 50, 智力: 75, 意志: 60, 教育: 70 },
    skills: { 医学: 60, 急救: 75, 侦查: 55, 聆听: 50, 科学药学: 50, 心理学: 40, 跳跃: 45, 闪避: 27, 斗殴: 40 },
    background: "你是这家人的熟人，临时过来帮忙。你相信儿童噩梦多半来自饮食、压力或疾病，但今晚的症状很快会超出课本解释。",
    inventory: "医学生包、绷带、听诊器、小手电、薄荷糖、重要之物：毕业前导师送的袖扣",
  },
  {
    id: "folklorist",
    name: "玛格丽特·布莱克",
    age: 32,
    occupation: "民俗研究者",
    specialty: "童话、民间传说、神秘学与梦境联想",
    hp: 11,
    san: 65,
    attributes: { 力量: 45, 体质: 55, 体型: 50, 敏捷: 60, 外貌: 60, 智力: 80, 意志: 65, 教育: 80 },
    skills: { 神秘学: 70, 民俗学: 75, 图书馆使用: 70, 侦查: 55, 聆听: 50, 说服: 45, 博物学: 45, 闪避: 30, 斗殴: 25 },
    background: "你研究儿童故事与民间信仰，正在收集美国本土的牙仙子传说。马修口中的黄牙齿和陌生绘本，让你隐约觉得这不只是童言童语。",
    inventory: "民俗笔记、放大镜、铅笔、儿童故事剪报、重要之物：一本祖母留下的童话集",
  },
];

const TRPG_DEFAULT_SCENARIO = {
  id: "dead-stomp",
  title: "死者的顿足舞",
  system: "COC 7版简化规则",
  players: "2至5名",
  minPlayers: 2,
  maxPlayers: 5,
  startChapter: "club",
  startSceneTitle: "斯默的天堂",
  sourceNote: "基于用户提供的《死者的顿足舞》资料做结构化私用改编。",
  setting: "1925年，纽约哈莱姆区",
  tone: "爵士时代的都市调查与超自然恐怖。涉及历史种族歧视、枪击、死亡和复生尸体；避免猎奇渲染。",
  premise: "调查员在斯默的天堂夜店目睹一名男子遭枪击后随爵士乐复生。线索逐渐指向落魄小号手勒罗伊·特纳与一支来历异常的四键小号。",
  opening: "调查员们因一次约会或调查相聚在哈莱姆区斯默的天堂。俱乐部灯火辉煌，查理·约翰逊的天堂乐团正在演奏，角落桌边的陌生会计皮特·马努斯科似乎在等待某人。",
  chapters: [
    {
      id: "club",
      title: "斯默的天堂",
      purpose: "营造爵士夜店氛围；让玩家认识马努斯科、特纳和乐团；枪手乔伊·拉松杀死马努斯科；音乐令死者短暂复生。",
      criticalClues: ["枪手乘灰色帕卡德逃走", "复生与乐曲及特纳的小号存在关联", "查理·约翰逊将参加法耶特的葬礼"],
    },
    {
      id: "investigation",
      title: "次日调查",
      purpose: "允许玩家调查警方、报纸、查理·约翰逊、特纳和街坊，不应因检定失败失去关键线索。",
      criticalClues: ["验尸确认马努斯科第一枪就应死亡", "拉松是波纳托帮派打手", "特纳拥有一支异常四键小号", "法耶特葬礼是下一关键事件"],
    },
    {
      id: "funeral",
      title: "法耶特的葬礼",
      purpose: "葬礼乐声令尸体复生；进行理智检定；明确特纳的演奏能唤醒死者。",
      criticalClues: ["音乐停止后复生者倒下", "特纳逐渐意识到小号的力量", "特纳希望借此让亡故爱人归来"],
    },
    {
      id: "trumpet",
      title: "小号的秘密",
      purpose: "调查四键小号、特纳经历和所谓赠予者；确认真正的路易斯·阿姆斯特朗从未赠送小号。",
      criticalClues: ["小号有四个键和无法辨识的环形符号", "阿姆斯特朗否认见过特纳", "赠予者实际是奈亚拉托提普的伪装"],
    },
    {
      id: "kidnapping",
      title: "绑架与追踪",
      purpose: "拉松与帮派绑架特纳；玩家追踪灰色帕卡德至西135街旧车库。",
      criticalClues: ["绑匪沿西125街前往河滨道", "灰色帕卡德停在旧车库外"],
    },
    {
      id: "climax",
      title: "车库与墓园",
      purpose: "波纳托逼迫特纳展示力量，暴力与复生引发失控；特纳逃向墓园并持续演奏。玩家必须阻止号声。",
      endings: ["夺走或破坏小号并救下特纳", "杀死或制服特纳使号声停止", "特纳死亡后再次复生，灾难扩大", "玩家未能阻止，墓园死者踏上复仇之路"],
    },
  ],
  keeperFacts: [
    "小号由奈亚拉托提普伪装成路易斯·阿姆斯特朗赠给特纳。",
    "天赋演奏者吹响小号时，音乐会唤起听见乐声的死者并驱使其复仇。",
    "特纳起初不知道小号的力量，后来因想复活爱人而逐渐疯狂。",
    "关键线索不能因一次失败检定永久丢失；失败应带来时间、风险或关系上的代价。",
    "绑架只能在葬礼和主要调查信息出现后触发。",
    "高潮前不要直接揭露奈亚拉托提普，只能给出无法解释的符号与身份矛盾。",
  ],
  importantNpcs: [
    "勒罗伊·特纳：28岁，落魄而嗜酒的小号手，艺术/小号92，HP15，SAN39。",
    "乔伊·拉松：24岁，波纳托手下打手，危险且狡诈，是枪击案凶手。",
    "查理·约翰逊：39岁，友善的乐团领队，了解特纳，是重要线索来源。",
    "罗杰·丹尼尔：31岁，联邦探员，循规蹈矩，可成为调查员盟友。",
    "阿尔奇·波纳托：46岁，残忍的黑帮头目，想利用小号复生死者的能力。",
  ],
  startPrompt: "请依据剧本开场描述1925年哈莱姆的斯默的天堂，并邀请每位玩家介绍调查员。不要提前发生枪击，先给玩家交谈和观察的机会。",
};

const TRPG_TOOTH_FAIRY_SCENARIO = {
  id: "tooth-fairy",
  title: "牙仙子",
  system: "COC 7版简化规则",
  players: "1至3名",
  minPlayers: 1,
  maxPlayers: 3,
  startChapter: "babysitting",
  startSceneTitle: "马修家的夜晚",
  sourceNote: "基于布罗克方块创作的 COC7th 模组《牙仙子》v1.0 做结构化私用改编；保留作者署名，非商业学习交流使用。",
  setting: "1926年2月28日，美国一户普通家庭与孩子的梦境菜园",
  tone: "童话外壳下的梦境恐怖。包含儿童惊吓、牙齿、追逐、梦中死亡、迷魅鼠和理智损失；避免血腥猎奇描写，保护小马修的能动性。",
  premise: "调查员受托照看六岁的马修。马修分享了据说来自牙仙子的糖果，夜里调查员随他进入以《彼得兔》为素材的梦境，并被伪装成牙仙子的迷魅鼠夺走重要之物。",
  opening: "马修的父母外出，调查员需要监督他在晚上十点前睡觉。马修掉了一颗门牙，兴奋地谈起牙仙子，并把自己珍视的糖果分享给新朋友。",
  chapters: [
    {
      id: "babysitting",
      title: "睡前照看",
      purpose: "建立现实场景；让马修分享糖果；让调查员注意换牙、牙仙子传说和房间里奇怪的假绘本。",
      criticalClues: ["马修处于换牙期并相信牙仙子", "他分享的糖果来源异常", "床与墙缝隙里有一本无署名、画风别扭的假绘本"],
    },
    {
      id: "dream-entry",
      title: "入梦时分",
      purpose: "调查员在坠落感中进入马修梦境；根据意志对抗决定能具现多少随身物品；确认马修也在寻找牙仙子。",
      criticalClues: ["此处是马修的梦", "糖果让调查员被拉入梦境", "随身物品会按马修认知发生童话式变形"],
    },
    {
      id: "tooth-fairy",
      title: "你好，牙仙子",
      purpose: "伪装成牙仙子的迷魅鼠登场，夺走马修的牙齿和调查员重要之物，引诱众人追赶。",
      criticalClues: ["牙仙子手中有黄灿灿的玉米粒", "它能夺走象征性重要之物", "所谓惩罚是为了引诱调查员进入更深梦境"],
    },
    {
      id: "mushroom-ring",
      title: "蘑菇林与仙女环",
      purpose: "让调查员选择穿越或绕开蘑菇圈；展示浅眠七十级阶梯的诱惑；给出幻梦境入口线索。",
      criticalClues: ["仙女环与螺旋阶梯相连", "继续下行会通往浅眠七十级阶梯", "越过而不下行可获得短暂祝福"],
    },
    {
      id: "garden",
      title: "麦奎尼的菜园",
      purpose: "开放式探索菜园，寻找大门离开梦境；可遭遇黄瓜架、醋栗丛、洋葱田老鼠、工具棚、池塘与猫。",
      criticalClues: ["离开菜园会让马修的普通梦境结束", "大门是安全醒来的方向", "猫知道牙仙子的真相并暗示它们藏着尖牙"],
    },
    {
      id: "chase",
      title: "麦奎尼先生的追赶",
      purpose: "用追逐和压力推动行动；麦奎尼是被迷魅鼠嫁接的恐惧，不应长期纠缠；必要时发起潜行、敏捷或理智检定。",
      criticalClues: ["麦奎尼不会真正沟通", "直面其非人面容会造成理智损失", "迷魅鼠想逼迫调查员走阶梯或跳下悬崖"],
    },
    {
      id: "ending",
      title: "梦境出口",
      purpose: "根据选择进入不同结局：大杉树下安全醒来、拾级而下进入幻梦境、天降馅饼、牙仙赠礼或一夜无梦。",
      endings: ["从白色栅栏大门离开，取回重要之物并醒来", "走下七十级阶梯，接受纳什特与卡曼扎的判断", "跳入梦中悬崖，落入迷魅鼠陷阱", "在普通梦境中死亡后惊醒并失去重要之物", "未吃糖果则马修独自遭遇可怖牙仙赠礼"],
    },
  ],
  keeperFacts: [
    "牙仙子其实是一群伪装成小仙子的迷魅鼠，也叫祖各，来自普通梦与幻梦境之间。",
    "马修读过一本仿照《彼得兔》的假绘本，绘本用秘法让读者更容易做带有启示的梦。",
    "马修用玉米粒假装黄牙齿试探牙仙子，迷魅鼠真正感兴趣的是他异常的梦。",
    "糖果能让吃下的人更容易被拉入梦境，也更容易被迷魅鼠进入梦中。",
    "迷魅鼠夺走牙齿和重要之物，是为了诱导调查员追逐它们，走上浅眠七十级阶梯或跳下梦中悬崖。",
    "离开菜园会结束马修的普通梦境，使迷魅鼠的干扰失败；关键线索不能因一次检定失败永久丢失。",
    "如果调查员未吃糖果，不会入梦，但马修会在夜里独自遭遇牙仙赠礼。",
  ],
  importantNpcs: [
    "小马修 Matthew：6岁，换牙期孩子，STR25 CON40 SIZ45 INT70 POW70 DEX55 APP50 EDU25 SAN70 HP9；潜行50、侦查40、聆听45、讲故事80、主动认错100。",
    "麦奎尼先生 Mr. McGregor：故事反派与被利用的恐惧，STR50 CON45 SIZ60 INT60 POW45 DEX70 APP0 EDU50 HP10；斗殴40、耙45、侦查60、聆听80；直面非人面容 SC0/1D4。",
    "伪装牙仙子的迷魅鼠：巴掌大的小仙子外形，面纱遮住触须和尖牙；真正目标是引诱猎物进入幻梦境。",
    "菜园里的猫：懒散但敏锐，知道迷魅鼠计划的一部分，可能提示牙仙子无法真正带走属于调查员的东西。",
    "菜园里的老鼠：熟悉菜园布局，不懂牙仙子真相，但可指出大门方向或分享仙女环传说。",
    "纳什特与卡曼扎：浅眠七十级阶梯尽头的两位祭司，判断入梦者是否有资格继续进入幻梦境。",
  ],
  startPrompt: "请从1926年2月28日晚，调查员受托照看六岁马修开始。让马修分享糖果、谈到牙仙子和掉牙，并邀请玩家说明自己如何陪他度过睡前时间。不要直接入梦，先给玩家查看房间、绘本和与马修交谈的机会。",
};

const TRPG_SCENARIOS = {
  "dead-stomp": { scenario: TRPG_DEFAULT_SCENARIO, presets: TRPG_PRESETS },
  "tooth-fairy": { scenario: TRPG_TOOTH_FAIRY_SCENARIO, presets: TRPG_TOOTH_FAIRY_PRESETS },
};

async function handleTrpg(request, env, url) {
  if (!env.DB) {
    return json({ error: "跑团数据库尚未连接，请检查 Worker 的 DB 绑定。" }, 500);
  }
  await ensureTrpgTable(env.DB);

  if (request.method === "GET") {
    const code = normalizeRoomCode(url.searchParams.get("room"));
    const playerId = cleanId(url.searchParams.get("playerId"));
    const state = await loadTrpgRoom(env.DB, code);
    if (!state) return json({ error: "房间不存在。" }, 404);
    if (!state.players.some((player) => player.id === playerId)) {
      return json({ error: "你尚未加入这个房间。" }, 403);
    }
    return json({ room: sanitizeTrpgState(state, playerId) });
  }

  if (request.method !== "POST") {
    return json({ error: "Use GET or POST request." }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const playerId = cleanId(body.playerId);
  if (!playerId) return json({ error: "缺少玩家标识。" }, 400);

  if (action === "create") {
    const name = cleanText(body.name || "调查员", 18) || "调查员";
    const state = createTrpgRoom(playerId, name, cleanId(body.scenarioId));
    await saveTrpgRoom(env.DB, state);
    return json({ room: sanitizeTrpgState(state, playerId) }, 201);
  }

  const code = normalizeRoomCode(body.room);
  const state = await loadTrpgRoom(env.DB, code);
  if (!state) return json({ error: "房间不存在。" }, 404);

  if (action === "join") {
    if (state.status === "ended") return json({ error: "房间已经结束，请让创建者重开。" }, 400);
    const name = cleanText(body.name || "调查员", 18) || "调查员";
    upsertTrpgPlayer(state, playerId, name);
  } else {
    requireTrpgPlayer(state, playerId);
    if (action === "selectPreset") {
      if (state.status !== "lobby") return json({ error: "游戏开始后不能更换调查员。" }, 400);
      selectTrpgPreset(state, playerId, cleanId(body.presetId));
    } else if (action === "start") {
      requireTrpgOwner(state, playerId);
      const config = getTrpgScenarioConfig(state);
      if (state.status === "playing") return json({ error: "冒险已经开始。" }, 400);
      if (state.players.length < config.scenario.minPlayers || state.players.length > config.scenario.maxPlayers) {
        return json({ error: `《${config.scenario.title}》需要 ${config.scenario.players}。` }, 400);
      }
      if (state.players.some((player) => !state.characters[player.id]?.presetId)) {
        return json({ error: "所有玩家都选择预设调查员后才能开始。" }, 400);
      }
      state.status = "playing";
      state.chapterId = config.scenario.startChapter;
      state.sceneTitle = config.scenario.startSceneTitle;
      addTrpgMessage(state, "system", "系统", `《${config.scenario.title}》开始，DeepSeek 已接管守秘人。`);
      await runTrpgAiTurn(state, env, {
        trigger: "start",
        actorId: playerId,
        playerText: config.scenario.startPrompt,
      });
    } else if (action === "send") {
      requireTrpgPlaying(state);
      if (state.pendingCheck) return json({ error: "请先完成当前检定。" }, 400);
      const text = cleanMultiline(body.text || "", 800);
      if (!text) return json({ error: "行动内容不能为空。" }, 400);
      addTrpgMessage(state, "player", trpgPlayerName(state, playerId), text, { playerId });
      await runTrpgAiTurn(state, env, { trigger: "action", actorId: playerId, playerText: text });
    } else if (action === "roll") {
      requireTrpgPlaying(state);
      const checkId = cleanId(body.checkId);
      const pending = state.pendingCheck;
      if (pending && (!checkId || checkId !== pending.id)) {
        return json({ error: "当前存在待完成的检定，请使用检定按钮投骰。" }, 400);
      }
      if (checkId) {
        if (!pending || pending.id !== checkId) return json({ error: "检定已经失效。" }, 400);
        if (pending.playerId !== playerId) return json({ error: "这不是你的检定。" }, 403);
      }
      const roll = pending
        ? rollCocCheck(pending.target, pending.difficulty, pending.bonusDice)
        : rollDiceExpression(cleanDiceExpression(body.expression));
      const label = pending ? `${pending.skill}检定` : "自由投骰";
      let rollText = pending
        ? `${trpgPlayerName(state, playerId)} 进行${label}：D100 = ${roll.total} / ${pending.target}，${roll.outcomeLabel}`
        : `${trpgPlayerName(state, playerId)} 进行${label}：${roll.expression} = ${roll.detail}，总计 ${roll.total}`;

      let sanityLoss = 0;
      if (pending?.sanLoss) {
        const lossExpression = roll.success ? pending.sanLoss.success : pending.sanLoss.failure;
        sanityLoss = rollLossExpression(lossExpression);
        const card = state.characters[playerId];
        card.san = Math.max(0, card.san - sanityLoss);
        rollText += `；理智损失 ${sanityLoss}，当前 SAN ${card.san}`;
      }
      addTrpgMessage(
        state,
        "roll",
        "骰子",
        rollText,
        { playerId, roll },
      );
      state.pendingCheck = null;
      await runTrpgAiTurn(state, env, {
        trigger: "roll",
        actorId: playerId,
        playerText: pending
          ? `${label}结果：${roll.total}/${pending.target}，${roll.outcomeLabel}，理智损失${sanityLoss}`
          : `${label}结果：${roll.total}（${roll.expression}；${roll.detail}）`,
        roll,
        check: pending || null,
      });
    } else if (action === "saveCharacter") {
      return json({ error: "本模组使用锁定的预设调查员。" }, 400);
    } else if (action === "saveNotes") {
      state.notes[playerId] = String(body.notes || "").slice(0, 10000);
    } else if (action === "pause") {
      requireTrpgOwner(state, playerId);
      state.status = "paused";
      addTrpgMessage(state, "system", "系统", "冒险已暂停。");
    } else if (action === "resume") {
      requireTrpgOwner(state, playerId);
      state.status = "playing";
      addTrpgMessage(state, "system", "系统", "冒险继续。");
    } else if (action === "reset") {
      requireTrpgOwner(state, playerId);
      resetTrpgRoom(state);
    } else {
      return json({ error: "未知操作。" }, 400);
    }
  }

  state.updatedAt = new Date().toISOString();
  await saveTrpgRoom(env.DB, state);
  return json({ room: sanitizeTrpgState(state, playerId) });
}

async function ensureTrpgTable(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS trpg_rooms (
      code TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

function getTrpgScenarioConfig(value = "") {
  const scenarioId = typeof value === "object"
    ? cleanId(value.scenarioId || value.scenario?.id || "dead-stomp")
    : cleanId(value || "dead-stomp");
  return TRPG_SCENARIOS[scenarioId] || TRPG_SCENARIOS["dead-stomp"];
}

function createTrpgRoom(ownerId, ownerName, scenarioId = "") {
  const now = new Date().toISOString();
  const config = getTrpgScenarioConfig(scenarioId);
  return {
    code: makeRoomCode(),
    ownerId,
    scenarioId: config.scenario.id,
    status: "lobby",
    sceneTitle: "等待冒险开始",
    chapterId: "lobby",
    players: [{ id: ownerId, name: ownerName, joinedAt: now }],
    characters: {},
    notes: { [ownerId]: "" },
    clues: { [ownerId]: [] },
    messages: [
      makeTrpgMessage("system", "系统", `《${config.scenario.title}》房间已创建。所有玩家加入并选择人物卡后，创建者可以开始冒险。`),
    ],
    pendingCheck: null,
    memory: {
      summary: "冒险尚未开始。",
      facts: [],
      hidden: config.scenario.keeperFacts.slice(),
    },
    aiThinking: false,
    scenario: config.scenario,
    createdAt: now,
    updatedAt: now,
  };
}

function resetTrpgRoom(state) {
  const config = getTrpgScenarioConfig(state);
  state.status = "lobby";
  state.sceneTitle = "等待冒险开始";
  state.chapterId = "lobby";
  state.characters = {};
  state.notes = Object.fromEntries(state.players.map((player) => [player.id, ""]));
  state.clues = Object.fromEntries(state.players.map((player) => [player.id, []]));
  state.messages = [makeTrpgMessage("system", "系统", "房间已重开，等待创建者开始冒险。")];
  state.pendingCheck = null;
  state.memory = {
    summary: "冒险尚未开始。",
    facts: [],
    hidden: config.scenario.keeperFacts.slice(),
  };
  state.scenario = config.scenario;
  state.aiThinking = false;
}

function upsertTrpgPlayer(state, playerId, name) {
  const config = getTrpgScenarioConfig(state);
  const player = state.players.find((item) => item.id === playerId);
  if (player) {
    player.name = name;
    return;
  }
  if (state.players.length >= config.scenario.maxPlayers) throw new Error(`《${config.scenario.title}》最多支持 ${config.scenario.maxPlayers} 名玩家。`);
  state.players.push({ id: playerId, name, joinedAt: new Date().toISOString() });
  state.notes[playerId] = "";
  state.clues[playerId] = [];
  addTrpgMessage(state, "system", "系统", `${name} 加入了房间。`);
}

function selectTrpgPreset(state, playerId, presetId) {
  const config = getTrpgScenarioConfig(state);
  const preset = config.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error("预设调查员不存在。");
  const occupied = Object.entries(state.characters).find(
    ([otherId, card]) => otherId !== playerId && card?.presetId === presetId,
  );
  if (occupied) throw new Error("这名调查员已经被其他玩家选择。");
  state.characters[playerId] = normalizeTrpgCard({ ...preset, presetId });
  addTrpgMessage(
    state,
    "system",
    "系统",
    `${trpgPlayerName(state, playerId)} 选择了调查员 ${preset.name}。`,
  );
}

async function runTrpgAiTurn(state, env, context) {
  state.aiThinking = true;
  try {
    if (!env.DEEPSEEK_API_KEY) throw new Error("Worker 尚未配置 DEEPSEEK_API_KEY");
    const messages = buildTrpgMessages(state, context);
    const raw = await callDeepSeek(messages, env, { maxTokens: 1400, temperature: 0.8 });
    const result = parseTrpgAiResult(raw);
    applyTrpgAiResult(state, result, context.actorId);
  } catch (error) {
    addTrpgMessage(
      state,
      "system",
      "系统",
      `AI 主持本回合未能响应：${cleanText(error.message || "未知错误", 180)}。请稍后重新描述行动。`,
    );
  } finally {
    state.aiThinking = false;
  }
}

function buildTrpgMessages(state, context) {
  const config = getTrpgScenarioConfig(state);
  const recentMessages = state.messages.slice(-24).map((message) => ({
    type: message.type,
    author: message.author,
    content: message.content,
  }));
  const playerCards = state.players.map((player) => ({
    id: player.id,
    playerName: player.name,
    character: state.characters[player.id] || {},
  }));
  const chapterIds = config.scenario.chapters.map((chapter) => chapter.id).join("/");

  return [
    {
      role: "system",
      content: [
        "你是多人在线文字跑团的唯一主持人和所有 NPC。请使用简体中文。",
        "你必须公平、连贯、给玩家选择空间，不替玩家决定行动，不提前泄露隐藏秘密。",
        "只有不确定且有代价的行动才要求检定。普通观察、交谈和合理行动直接推进。",
        `当前剧本是《${config.scenario.title}》。必须严格按照该剧本的章节顺序、关键线索和守秘人事实主持，不要自行替换核心真相。`,
        "不要逐字复述剧本原文，要用自然的主持语言改写场景。",
        "关键线索不能因检定失败而永久丢失；失败应产生时间、危险、关系或理智方面的代价。",
        "只有当前章节目标完成后才能进入下一章节。不要把后期真相提前讲给玩家。",
        "理智检定使用技能名“理智”，并提供 sanLoss，例如成功0、失败1D6。",
        "你的回复必须是单个 JSON 对象，不要使用 Markdown 代码块。",
        `chapterId 只能使用这些值之一：${chapterIds}。`,
        '结构：{"narration":"给所有玩家看的主持内容","sceneTitle":"短场景名","chapterId":"当前剧本章节ID","check":null或{"skill":"人物卡技能或属性名","difficulty":"普通/困难/极难","bonusDice":0,"reason":"检定原因","sanLoss":null或{"success":"0","failure":"1D6"}},"clues":[{"playerId":"玩家ID或all","title":"线索标题","content":"线索内容"}],"privateMessages":[{"playerId":"玩家ID","content":"只有该玩家看见的信息"}],"statusUpdates":[{"playerId":"玩家ID","hp":10,"san":9,"reason":"变化原因"}],"facts":["新增永久事实"],"summary":"截至当前的简短剧情摘要","end":false}',
        "check 一次只能给当前行动玩家；若无需检定必须为 null。",
        "骰点发生后必须根据结果和难度清楚描述成功、失败或代价，并继续剧情。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        scenario: config.scenario,
        currentChapter: state.chapterId,
        sceneTitle: state.sceneTitle,
        status: state.status,
        players: playerCards,
        memory: state.memory,
        recentMessages,
        currentEvent: context,
      }),
    },
  ];
}

function parseTrpgAiResult(raw) {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    return {
      narration: text || "雾气短暂遮住了视线，主持人没有给出有效回应，请再尝试一次行动。",
      sceneTitle: "",
      check: null,
      clues: [],
      facts: [],
      summary: "",
      end: false,
    };
  }
}

function applyTrpgAiResult(state, result, actorId) {
  const config = getTrpgScenarioConfig(state);
  const narration = cleanMultiline(result.narration || "", 4000);
  if (narration) addTrpgMessage(state, "gm", "AI 主持", narration);
  const sceneTitle = cleanText(result.sceneTitle || "", 50);
  if (sceneTitle) state.sceneTitle = sceneTitle;
  const chapterId = cleanId(result.chapterId);
  if (config.scenario.chapters.some((chapter) => chapter.id === chapterId)) {
    state.chapterId = chapterId;
  }

  state.pendingCheck = null;
  if (result.check && typeof result.check === "object") {
    const skill = cleanText(result.check.skill || "幸运", 30);
    const target = getTrpgCheckTarget(state.characters[actorId], skill);
    state.pendingCheck = {
      id: crypto.randomUUID(),
      playerId: actorId,
      skill,
      target,
      expression: "1D100",
      difficulty: normalizeCocDifficulty(result.check.difficulty),
      bonusDice: clampNumber(result.check.bonusDice, -2, 2, 0),
      reason: cleanText(result.check.reason || "行动结果存在不确定性。", 160),
      sanLoss: normalizeSanLoss(result.check.sanLoss),
      createdAt: new Date().toISOString(),
    };
  }

  for (const clue of Array.isArray(result.clues) ? result.clues.slice(0, 8) : []) {
    const targets = clue.playerId === "all"
      ? state.players.map((player) => player.id)
      : [cleanId(clue.playerId) || actorId];
    for (const targetId of targets) {
      if (!state.clues[targetId]) continue;
      const item = {
        id: crypto.randomUUID(),
        title: cleanText(clue.title || "新线索", 60),
        content: cleanMultiline(clue.content || "", 800),
        createdAt: new Date().toISOString(),
      };
      state.clues[targetId].push(item);
      addTrpgMessage(state, "system", "系统", `${trpgPlayerName(state, targetId)} 获得了线索：${item.title}`, {
        privateTo: targetId,
      });
    }
  }

  for (const message of Array.isArray(result.privateMessages) ? result.privateMessages.slice(0, 8) : []) {
    const targetId = cleanId(message.playerId);
    if (!state.characters[targetId]) continue;
    const content = cleanMultiline(message.content || "", 1000);
    if (content) addTrpgMessage(state, "gm", "AI 主持 · 私密", content, { privateTo: targetId });
  }

  for (const update of Array.isArray(result.statusUpdates) ? result.statusUpdates.slice(0, 8) : []) {
    const targetId = cleanId(update.playerId);
    const card = state.characters[targetId];
    if (!card) continue;
    if (update.hp != null) card.hp = clampNumber(update.hp, 0, 999, card.hp);
    if (update.san != null) card.san = clampNumber(update.san, 0, 999, card.san);
    const reason = cleanText(update.reason || "状态发生变化", 100);
    addTrpgMessage(
      state,
      "system",
      "系统",
      `${trpgPlayerName(state, targetId)}：HP ${card.hp}，SAN ${card.san}（${reason}）`,
    );
  }

  const newFacts = Array.isArray(result.facts)
    ? result.facts.map((item) => cleanText(item, 300)).filter(Boolean)
    : [];
  state.memory.facts = Array.from(new Set([...state.memory.facts, ...newFacts])).slice(-80);
  const summary = cleanMultiline(result.summary || "", 2000);
  if (summary) state.memory.summary = summary;
  if (result.end === true) {
    state.status = "ended";
    state.pendingCheck = null;
    addTrpgMessage(state, "system", "系统", "本次冒险已经结束。");
  }
}

function sanitizeTrpgState(state, playerId) {
  const config = getTrpgScenarioConfig(state);
  const messages = state.messages
    .filter((message) => !message.privateTo || message.privateTo === playerId)
    .slice(-120)
    .map((message) => ({
      ...message,
      private: Boolean(message.privateTo),
      privateTo: undefined,
    }));
  return {
    code: state.code,
    status: state.status,
    scenarioId: config.scenario.id,
    scenarioTitle: config.scenario.title,
    scenarioMeta: `${config.scenario.system} · ${config.scenario.players} · ${config.scenario.setting}`,
    sceneTitle: state.sceneTitle,
    chapterId: state.chapterId || "lobby",
    isOwner: state.ownerId === playerId,
    aiThinking: Boolean(state.aiThinking),
    players: state.players.map((player) => {
      const card = state.characters[player.id] || {};
      return {
        id: player.id,
        name: player.name,
        isYou: player.id === playerId,
        isOwner: player.id === state.ownerId,
        characterName: card.name || "",
        hp: Number(card.hp ?? 10),
        san: Number(card.san ?? 10),
      };
    }),
    messages,
    pendingCheck: state.pendingCheck?.playerId === playerId ? state.pendingCheck : null,
    myPresetId: state.characters[playerId]?.presetId || "",
    presets: config.presets.map((preset) => {
      const owner = state.players.find((player) => state.characters[player.id]?.presetId === preset.id);
      return {
        id: preset.id,
        name: preset.name,
        age: preset.age,
        occupation: preset.occupation,
        specialty: preset.specialty,
        takenBy: owner?.name || "",
      };
    }),
    myCharacter: state.characters[playerId] || normalizeTrpgCard({}),
    myNotes: state.notes[playerId] || "",
    myClues: state.clues[playerId] || [],
    updatedAt: state.updatedAt,
  };
}

function normalizeTrpgCard(card = {}) {
  return {
    presetId: cleanId(card.presetId),
    name: cleanText(card.name || "", 30),
    age: clampNumber(card.age, 0, 120, 0),
    occupation: cleanText(card.occupation || "", 50),
    hp: clampNumber(card.hp, 0, 999, 10),
    san: clampNumber(card.san, 0, 999, 10),
    attributes: normalizeTrpgStats(card.attributes),
    skills: normalizeTrpgStats(card.skills),
    background: cleanMultiline(card.background || "", 1000),
    inventory: cleanMultiline(card.inventory || "", 1000),
  };
}

function normalizeTrpgStats(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  return Object.fromEntries(
    Object.entries(values)
      .slice(0, 40)
      .map(([name, value]) => [cleanText(name, 20), clampNumber(value, 0, 100, 0)])
      .filter(([name]) => name),
  );
}

function getTrpgCheckTarget(card, skill) {
  if (!card) return 50;
  if (skill === "理智") return clampNumber(card.san, 1, 99, 50);
  if (skill === "幸运") return clampNumber(card.attributes?.意志, 1, 99, 50);
  const direct = card.skills?.[skill] ?? card.attributes?.[skill];
  if (direct != null) return clampNumber(direct, 1, 99, 50);
  const match = [...Object.entries(card.skills || {}), ...Object.entries(card.attributes || {})]
    .find(([name]) => name.includes(skill) || skill.includes(name));
  return match ? clampNumber(match[1], 1, 99, 50) : 50;
}

function normalizeCocDifficulty(value) {
  return ["普通", "困难", "极难"].includes(value) ? value : "普通";
}

function normalizeSanLoss(value) {
  if (!value || typeof value !== "object") return null;
  return {
    success: normalizeLossExpression(value.success || "0"),
    failure: normalizeLossExpression(value.failure || "0"),
  };
}

function normalizeLossExpression(value) {
  const expression = String(value || "0").toUpperCase().replace(/\s+/g, "");
  return /^(?:0|\d{1,2}|[1-9]\d?D(?:3|4|6|8|10|12|20|100)(?:[+-]\d{1,2})?)$/.test(expression)
    ? expression
    : "0";
}

function rollLossExpression(expression) {
  const normalized = normalizeLossExpression(expression);
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return Math.max(0, rollDiceExpression(normalized).total);
}

function rollCocCheck(target, difficulty, bonusDice = 0) {
  const unit = randomInt(0, 9);
  const tensCount = 1 + Math.abs(bonusDice);
  const candidates = [];
  for (let index = 0; index < tensCount; index += 1) {
    const tens = randomInt(0, 9);
    candidates.push(tens === 0 && unit === 0 ? 100 : tens * 10 + unit);
  }
  const total = bonusDice > 0
    ? Math.min(...candidates)
    : bonusDice < 0 ? Math.max(...candidates) : candidates[0];
  const threshold = difficulty === "极难"
    ? Math.floor(target / 5)
    : difficulty === "困难" ? Math.floor(target / 2) : target;
  const critical = total === 1;
  const fumble = total === 100 || (target < 50 && total >= 96);
  const success = !fumble && (critical || total <= threshold);
  const outcomeLabel = critical
    ? "大成功"
    : fumble ? "大失败"
      : success
        ? (total <= Math.floor(target / 5) ? "极难成功" : total <= Math.floor(target / 2) ? "困难成功" : "普通成功")
        : "失败";
  return {
    expression: "1D100",
    total,
    candidates,
    target,
    difficulty,
    bonusDice,
    success,
    critical,
    fumble,
    outcomeLabel,
    detail: candidates.join(" / "),
  };
}

function randomInt(min, max) {
  const range = max - min + 1;
  return min + crypto.getRandomValues(new Uint32Array(1))[0] % range;
}

function requireTrpgPlayer(state, playerId) {
  if (!state.players.some((player) => player.id === playerId)) throw new Error("你不在这个房间中。");
}

function requireTrpgOwner(state, playerId) {
  if (state.ownerId !== playerId) throw new Error("只有房间创建者可以执行此操作。");
}

function requireTrpgPlaying(state) {
  if (state.status === "paused") throw new Error("冒险当前处于暂停状态。");
  if (state.status !== "playing") throw new Error("冒险尚未开始。");
  if (state.aiThinking) throw new Error("AI 主持正在处理上一项行动。");
}

function addTrpgMessage(state, type, author, content, options = {}) {
  state.messages.push(makeTrpgMessage(type, author, content, options));
  if (state.messages.length > 300) state.messages = state.messages.slice(-260);
}

function makeTrpgMessage(type, author, content, options = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    author,
    content: cleanMultiline(content || "", 5000),
    playerId: options.playerId || "",
    privateTo: options.privateTo || "",
    roll: options.roll || null,
    createdAt: new Date().toISOString(),
  };
}

function cleanDiceExpression(value) {
  let expression = String(value || "1D100").toUpperCase().replace(/\s+/g, "");
  if (/^D\d/.test(expression)) expression = `1${expression}`;
  if (!/^[1-9]\d?D(?:3|4|6|8|10|12|20|100)(?:[+-]\d{1,3})?$/.test(expression)) {
    throw new Error("骰子表达式无效，示例：1D100、2D6+3。");
  }
  const count = Number(expression.match(/^(\d+)D/)[1]);
  if (count > 20) throw new Error("一次最多投 20 枚骰子。");
  return expression;
}

function rollDiceExpression(value) {
  const expression = cleanDiceExpression(value);
  const match = expression.match(/^(\d+)D(\d+)(?:([+-])(\d+))?$/);
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(`${match[3]}${match[4]}`) : 0;
  const rolls = [];
  for (let index = 0; index < count; index += 1) {
    rolls.push(crypto.getRandomValues(new Uint32Array(1))[0] % sides + 1);
  }
  const total = rolls.reduce((sum, item) => sum + item, 0) + modifier;
  const detail = `${rolls.join(" + ")}${modifier ? ` ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}` : ""}`;
  return { expression, rolls, modifier, detail, total };
}

function trpgPlayerName(state, playerId) {
  return state.players.find((player) => player.id === playerId)?.name || "未知玩家";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function cleanMultiline(value, maxLength) {
  return String(value).replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

async function loadTrpgRoom(db, code) {
  if (!code) return null;
  const row = await db.prepare("SELECT state_json FROM trpg_rooms WHERE code = ?").bind(code).first();
  return row ? JSON.parse(row.state_json) : null;
}

async function saveTrpgRoom(db, state) {
  await db.prepare(
    `INSERT INTO trpg_rooms (code, state_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  ).bind(state.code, JSON.stringify(state), state.createdAt, state.updatedAt).run();
}

const WEREWOLF_ROLES = ["狼人", "狼人", "爪牙", "守夜人", "守夜人", "预言家", "强盗", "捣蛋鬼", "酒鬼", "失眠者"];
const WEREWOLF_PHASES = [
  { key: "werewolf", name: "狼人行动", hint: "狼人互相确认身份。若只有一个狼人，可以知道自己是孤狼。" },
  { key: "minion", name: "爪牙行动", hint: "爪牙查看狼人是谁。爪牙属于狼人阵营，但自己不是狼人。" },
  { key: "mason", name: "守夜人行动", hint: "两个守夜人互相确认。如果只看到自己，说明另一个守夜人在中央牌。" },
  { key: "seer", name: "预言家行动", hint: "预言家可以查看一名玩家，或查看两张中央牌。" },
  { key: "robber", name: "强盗行动", hint: "强盗选择一名玩家交换身份，并查看自己换到的新身份。" },
  { key: "troublemaker", name: "捣蛋鬼行动", hint: "捣蛋鬼交换另外两名玩家的身份，但不查看。" },
  { key: "drunk", name: "酒鬼行动", hint: "酒鬼选择一张中央牌与自己交换，但不查看。" },
  { key: "insomniac", name: "失眠者行动", hint: "失眠者最后查看自己当前身份。" },
];

async function handleWerewolf(request, env, url) {
  if (!env.DB) {
    return json({ error: "Missing D1 binding DB. 多人在线房间需要 Cloudflare D1 数据库。" }, 500);
  }

  await ensureWerewolfTable(env.DB);

  if (request.method === "GET") {
    const code = normalizeRoomCode(url.searchParams.get("room"));
    const playerId = cleanId(url.searchParams.get("playerId"));
    const state = await loadWerewolfRoom(env.DB, code);
    if (!state) return json({ error: "房间不存在。" }, 404);
    return json({ room: sanitizeWerewolfState(state, playerId) });
  }

  if (request.method !== "POST") {
    return json({ error: "Use GET or POST request." }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const playerId = cleanId(body.playerId);
  const name = cleanText(body.name || "游客", 18) || "游客";

  if (!playerId) return json({ error: "Missing playerId." }, 400);

  if (action === "create") {
    const state = createWerewolfRoom(playerId, name);
    await saveWerewolfRoom(env.DB, state);
    return json({ room: sanitizeWerewolfState(state, playerId) }, 201);
  }

  const code = normalizeRoomCode(body.room);
  const state = await loadWerewolfRoom(env.DB, code);
  if (!state) return json({ error: "房间不存在。" }, 404);

  if (action === "join") {
    if (state.status !== "lobby") return json({ error: "游戏已经开始，不能加入。" }, 400);
    upsertPlayer(state, playerId, name);
  } else if (action === "start") {
    requireHost(state, playerId);
    startWerewolfGame(state);
  } else if (action === "next") {
    requireHost(state, playerId);
    advanceWerewolfPhase(state);
  } else if (action === "reset") {
    requireHost(state, playerId);
    resetWerewolfGame(state);
  } else if (action === "roleAction") {
    applyWerewolfRoleAction(state, playerId, body.payload || {});
  } else if (action === "vote") {
    applyWerewolfVote(state, playerId, cleanId(body.targetId));
  } else {
    return json({ error: "Unknown action." }, 400);
  }

  state.updatedAt = new Date().toISOString();
  await saveWerewolfRoom(env.DB, state);
  return json({ room: sanitizeWerewolfState(state, playerId) });
}

async function ensureWerewolfTable(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS werewolf_rooms (
      code TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

function createWerewolfRoom(hostId, hostName) {
  const now = new Date().toISOString();
  const code = makeRoomCode();
  return {
    code,
    hostId,
    status: "lobby",
    phaseIndex: -1,
    players: [{ id: hostId, name: hostName, joinedAt: now }],
    originalRoles: {},
    currentRoles: {},
    center: [],
    actions: {},
    votes: {},
    events: ["房间已创建。"],
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

function resetWerewolfGame(state) {
  state.status = "lobby";
  state.phaseIndex = -1;
  state.originalRoles = {};
  state.currentRoles = {};
  state.center = [];
  state.actions = {};
  state.votes = {};
  state.result = null;
  state.events = ["房主已重开本房，等待重新发牌。"];
}

function upsertPlayer(state, playerId, name) {
  const found = state.players.find((player) => player.id === playerId);
  if (found) {
    found.name = name;
    return;
  }
  if (state.players.length >= 7) {
    throw new Error("本版本是 7 人局，房间已满。");
  }
  state.players.push({ id: playerId, name, joinedAt: new Date().toISOString() });
  state.events.unshift(`${name} 加入房间。`);
}

function startWerewolfGame(state) {
  if (state.players.length !== 7) {
    throw new Error("需要正好 7 名玩家才能开始。");
  }
  const roles = shuffle(WEREWOLF_ROLES);
  state.originalRoles = {};
  state.currentRoles = {};
  state.players.forEach((player, index) => {
    state.originalRoles[player.id] = roles[index];
    state.currentRoles[player.id] = roles[index];
  });
  state.center = roles.slice(7);
  state.status = "night";
  state.phaseIndex = 0;
  state.actions = {};
  state.votes = {};
  state.result = null;
  state.events = ["游戏开始，身份已发放。", "夜晚开始，请按阶段行动。"];
}

function advanceWerewolfPhase(state) {
  if (state.status !== "night") return;
  if (state.phaseIndex >= WEREWOLF_PHASES.length - 1) {
    state.status = "day";
    state.phaseIndex = -1;
    state.events.unshift("天亮了，进入白天讨论和投票。");
  } else {
    state.phaseIndex += 1;
    state.events.unshift(`进入：${WEREWOLF_PHASES[state.phaseIndex].name}。`);
  }
}

function applyWerewolfRoleAction(state, playerId, payload) {
  if (state.status !== "night") throw new Error("当前不是夜晚阶段。");
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  const role = state.originalRoles[playerId];
  if (!canRoleActInPhase(role, phase.key)) {
    throw new Error("当前阶段不是你的行动阶段。");
  }
  if (state.actions[phase.key]?.[playerId]) {
    throw new Error("你已经完成本阶段行动。");
  }
  state.actions[phase.key] ||= {};

  if (phase.key === "seer") {
    if (payload.type !== "seer") throw new Error("预言家行动参数错误。");
    if (payload.mode === "center") {
      state.actions[phase.key][playerId] = { result: `中央牌 1：${state.center[0]}；中央牌 2：${state.center[1]}` };
    } else {
      const targetId = cleanId(payload.targetId);
      state.actions[phase.key][playerId] = { result: `${playerName(state, targetId)} 的当前身份是：${state.currentRoles[targetId] || "未知"}` };
    }
  } else if (phase.key === "robber") {
    const targetId = cleanId(payload.targetId);
    swapRoles(state.currentRoles, playerId, targetId);
    state.actions[phase.key][playerId] = { result: `你和 ${playerName(state, targetId)} 交换了身份。你的当前身份是：${state.currentRoles[playerId]}` };
  } else if (phase.key === "troublemaker") {
    const targetA = cleanId(payload.targetA);
    const targetB = cleanId(payload.targetB);
    if (!targetA || !targetB || targetA === targetB || targetA === playerId || targetB === playerId) {
      throw new Error("捣蛋鬼必须选择另外两名不同玩家。");
    }
    swapRoles(state.currentRoles, targetA, targetB);
    state.actions[phase.key][playerId] = { result: `你交换了 ${playerName(state, targetA)} 和 ${playerName(state, targetB)} 的身份，但不知道内容。` };
  } else if (phase.key === "drunk") {
    const index = Number(payload.centerIndex);
    if (![0, 1, 2].includes(index)) throw new Error("请选择有效中央牌。");
    const old = state.currentRoles[playerId];
    state.currentRoles[playerId] = state.center[index];
    state.center[index] = old;
    state.actions[phase.key][playerId] = { result: "你和一张中央牌交换了身份，但不知道换到了什么。" };
  } else {
    state.actions[phase.key][playerId] = { result: getWerewolfInfoText(state, playerId, phase.key) };
  }
}

function applyWerewolfVote(state, playerId, targetId) {
  if (state.status !== "day") throw new Error("当前不能投票。");
  if (!state.players.some((player) => player.id === targetId)) throw new Error("投票目标不存在。");
  state.votes[playerId] = targetId;
  state.events.unshift(`${playerName(state, playerId)} 已投票。`);
  if (Object.keys(state.votes).length >= state.players.length) {
    finishWerewolfGame(state);
  }
}

function finishWerewolfGame(state) {
  const counts = {};
  Object.values(state.votes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] || 0) + 1;
  });
  const max = Math.max(...Object.values(counts));
  const eliminated = max <= 1
    ? []
    : Object.entries(counts)
      .filter(([, count]) => count === max)
      .map(([id]) => id);
  const wolves = state.players.filter((player) => state.currentRoles[player.id] === "狼人").map((player) => player.id);
  const killedWolf = eliminated.some((id) => wolves.includes(id));
  const noWolfOnTable = wolves.length === 0;
  const villageWin = noWolfOnTable ? eliminated.length === 0 : killedWolf;
  state.status = "ended";
  state.result = {
    eliminated,
    villageWin,
    lines: [
      `出局：${eliminated.length ? eliminated.map((id) => `${playerName(state, id)}（${state.currentRoles[id]}）`).join("、") : "无人出局"}`,
      villageWin ? "好人阵营获胜。" : "狼人阵营获胜。",
      ...state.players.map((player) => `${player.name}：初始 ${state.originalRoles[player.id]}，最终 ${state.currentRoles[player.id]}`),
      `中央牌：${state.center.join("、")}`,
    ],
  };
  state.events.unshift("投票结束，游戏结算完成。");
}

function sanitizeWerewolfState(state, playerId) {
  const phase = state.status === "night" ? WEREWOLF_PHASES[state.phaseIndex] : null;
  const role = state.originalRoles[playerId];
  const actionRecord = phase ? state.actions[phase.key]?.[playerId] : null;
  return {
    code: state.code,
    status: state.status,
    phaseName: getWerewolfPhaseName(state),
    phaseHint: getWerewolfPhaseHint(state),
    isHost: state.hostId === playerId,
    myRole: role || "",
    myRoleHint: getMyRoleHint(state, playerId),
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      isYou: player.id === playerId,
      isHost: player.id === state.hostId,
      readyText: getPlayerReadyText(state, player.id),
    })),
    events: (state.events || []).slice(0, 20),
    availableAction: getAvailableAction(state, playerId, actionRecord),
    waitText: getWaitText(state, playerId),
    voteText: getVoteText(state),
    finalText: state.result?.lines || [],
  };
}

function getWerewolfPhaseName(state) {
  if (state.status === "lobby") return "等待开始";
  if (state.status === "day") return "白天讨论";
  if (state.status === "ended") return "已结算";
  return WEREWOLF_PHASES[state.phaseIndex]?.name || "夜晚";
}

function getWerewolfPhaseHint(state) {
  if (state.status === "lobby") return "等 7 名玩家加入后，房主可以开始。";
  if (state.status === "day") return "所有玩家讨论后投票。";
  if (state.status === "ended") return "本局已结束，房主可以重开。";
  return WEREWOLF_PHASES[state.phaseIndex]?.hint || "";
}

function getMyRoleHint(state, playerId) {
  if (!state.originalRoles[playerId]) return "开始后这里会显示你的身份。";
  if (state.status === "ended") return `你的最终身份：${state.currentRoles[playerId]}`;
  return "注意：夜晚可能换牌，白天按最终身份结算。";
}

function getAvailableAction(state, playerId, actionRecord) {
  if (state.status !== "night") return null;
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  const role = state.originalRoles[playerId];
  if (!canRoleActInPhase(role, phase.key)) return null;
  if (actionRecord) {
    return { type: "info", text: actionRecord.result || "你已完成本阶段行动。" };
  }
  if (phase.key === "werewolf") {
    return { type: "info", text: getWerewolfInfoText(state, playerId, phase.key) };
  }
  if (phase.key === "minion") {
    return { type: "info", text: getWerewolfInfoText(state, playerId, phase.key) };
  }
  if (phase.key === "mason") {
    return { type: "info", text: getWerewolfInfoText(state, playerId, phase.key) };
  }
  if (phase.key === "seer") return { type: "seer" };
  if (phase.key === "robber") return { type: "one-player", role: "robber", text: "强盗：选择一名玩家交换身份，并查看你换到的新身份。" };
  if (phase.key === "troublemaker") return { type: "two-players", text: "捣蛋鬼：选择另外两名玩家交换身份，你不会看到身份内容。" };
  if (phase.key === "drunk") return { type: "center", text: "酒鬼：选择一张中央牌和自己交换，但不会查看。" };
  if (phase.key === "insomniac") return { type: "info", text: `你的当前身份是：${state.currentRoles[playerId]}` };
  return null;
}

function getWerewolfInfoText(state, playerId, phaseKey) {
  if (phaseKey === "werewolf") {
    const wolves = state.players.filter((player) => state.originalRoles[player.id] === "狼人").map((player) => player.name);
    return `狼人名单：${wolves.join("、")}`;
  }
  if (phaseKey === "minion") {
    const wolves = state.players.filter((player) => state.originalRoles[player.id] === "狼人").map((player) => player.name);
    return wolves.length ? `狼人是：${wolves.join("、")}` : "本局狼人都在中央牌，爪牙需要独自帮狼人阵营。";
  }
  if (phaseKey === "mason") {
    const masons = state.players.filter((player) => state.originalRoles[player.id] === "守夜人").map((player) => player.name);
    return `守夜人名单：${masons.join("、")}`;
  }
  if (phaseKey === "insomniac") {
    return `你的当前身份是：${state.currentRoles[playerId]}`;
  }
  return "已确认。";
}

function getWaitText(state, playerId) {
  if (state.status !== "night") return "";
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  const role = state.originalRoles[playerId];
  return `当前是${phase.name}。你的初始身份是${role}，本阶段无需行动，等待房主推进。`;
}

function getPlayerReadyText(state, playerId) {
  if (state.status === "lobby") return "等待发牌";
  if (state.status === "day") return state.votes[playerId] ? "已投票" : "未投票";
  if (state.status === "ended") return `最终身份：${state.currentRoles[playerId]}`;
  const phase = WEREWOLF_PHASES[state.phaseIndex];
  if (!canRoleActInPhase(state.originalRoles[playerId], phase.key)) return "本阶段无需行动";
  return state.actions[phase.key]?.[playerId] ? "已行动" : "待行动";
}

function getVoteText(state) {
  if (state.status !== "day") return "";
  return `投票进度：${Object.keys(state.votes).length}/${state.players.length}`;
}

function canRoleActInPhase(role, phaseKey) {
  return (
    (phaseKey === "werewolf" && role === "狼人") ||
    (phaseKey === "minion" && role === "爪牙") ||
    (phaseKey === "mason" && role === "守夜人") ||
    (phaseKey === "seer" && role === "预言家") ||
    (phaseKey === "robber" && role === "强盗") ||
    (phaseKey === "troublemaker" && role === "捣蛋鬼") ||
    (phaseKey === "drunk" && role === "酒鬼") ||
    (phaseKey === "insomniac" && role === "失眠者")
  );
}

async function loadWerewolfRoom(db, code) {
  if (!code) return null;
  const row = await db.prepare("SELECT state_json FROM werewolf_rooms WHERE code = ?").bind(code).first();
  return row ? JSON.parse(row.state_json) : null;
}

async function saveWerewolfRoom(db, state) {
  await db.prepare(
    `INSERT INTO werewolf_rooms (code, state_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  ).bind(state.code, JSON.stringify(state), state.createdAt, state.updatedAt).run();
}

function requireHost(state, playerId) {
  if (state.hostId !== playerId) throw new Error("只有房主可以操作。");
}

function swapRoles(map, a, b) {
  if (!map[a] || !map[b]) throw new Error("交换目标不存在。");
  const temp = map[a];
  map[a] = map[b];
  map[b] = temp;
}

function playerName(state, playerId) {
  return state.players.find((player) => player.id === playerId)?.name || "未知玩家";
}

function shuffle(values) {
  const list = values.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const target = Math.floor(random * (index + 1));
    [list[index], list[target]] = [list[target], list[index]];
  }
  return list;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length;
    code += alphabet[random];
  }
  return code;
}

function normalizeRoomCode(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
}

function cleanId(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

function cleanText(value, maxLength) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function handleGitHubHot(request, env, url) {
  if (request.method !== "GET") {
    return json({ error: "Use GET request." }, 405);
  }

  const period = normalizePeriod(url.searchParams.get("period"));
  const language = cleanGitHubQuery(url.searchParams.get("language") || "");
  const keyword = cleanGitHubQuery(url.searchParams.get("keyword") || "");
  const since = getSinceDate(period);
  const queryParts = [`created:>=${since}`, "stars:>3"];

  if (language) queryParts.push(`language:${language}`);
  if (keyword) queryParts.push(keyword);

  const apiUrl = new URL("https://api.github.com/search/repositories");
  apiUrl.searchParams.set("q", queryParts.join(" "));
  apiUrl.searchParams.set("sort", "stars");
  apiUrl.searchParams.set("order", "desc");
  apiUrl.searchParams.set("per_page", "80");

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "shxgjqaq-github-hot",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const response = await fetch(apiUrl, { headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json({
      error: data.message || `GitHub request failed: HTTP ${response.status}`,
      status: response.status,
    }, response.status);
  }

  const repos = (data.items || []).map(scoreRepository);
  const fastest = repos
    .slice()
    .sort((a, b) => b.starVelocity - a.starVelocity || b.stars - a.stars)
    .slice(0, 20);
  const practical = repos
    .slice()
    .sort((a, b) => b.practicalScore - a.practicalScore || b.stars - a.stars)
    .slice(0, 20);

  return json({
    period,
    since,
    language,
    keyword,
    totalCount: data.total_count || 0,
    fetchedCount: repos.length,
    fastest,
    practical,
    note: "GitHub API does not provide historical star deltas directly. Star growth is estimated by stars per day among repositories created in the selected time window.",
  });
}

function normalizePeriod(period) {
  return period === "month" ? "month" : "week";
}

function getSinceDate(period) {
  const days = period === "month" ? 30 : 7;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function cleanGitHubQuery(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}_ .#+-]/gu, "")
    .trim()
    .slice(0, 40);
}

function scoreRepository(repo) {
  const createdAt = repo.created_at || new Date().toISOString();
  const updatedAt = repo.updated_at || createdAt;
  const ageDays = Math.max(1, (Date.now() - Date.parse(createdAt)) / 86400000);
  const updatedDays = Math.max(0, (Date.now() - Date.parse(updatedAt)) / 86400000);
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const stars = repo.stargazers_count || 0;
  const forks = repo.forks_count || 0;
  const hasDescription = repo.description ? 1 : 0;
  const hasHomepage = repo.homepage ? 1 : 0;
  const hasLicense = repo.license?.spdx_id ? 1 : 0;
  const recentBonus = Math.max(0, 30 - updatedDays) / 30;

  return {
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description || "暂无简介",
    language: repo.language || "Unknown",
    stars,
    forks,
    openIssues: repo.open_issues_count || 0,
    createdAt,
    updatedAt,
    pushedAt: repo.pushed_at,
    homepage: repo.homepage || "",
    license: repo.license?.spdx_id || "",
    topics: topics.slice(0, 8),
    starVelocity: round(stars / ageDays, 2),
    practicalScore: round(
      stars * 0.55 +
      forks * 1.2 +
      topics.length * 10 +
      hasDescription * 18 +
      hasHomepage * 12 +
      hasLicense * 10 +
      recentBonus * 18,
      1,
    ),
  };
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function callDeepSeek(messages, env, options = {}) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY secret on this Worker.");
  }

  const data = await postChatCompletion({
    url: "https://api.deepseek.com/chat/completions",
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_MODEL || "deepseek-chat",
    messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  return data.choices?.[0]?.message?.content?.trim() || "DeepSeek returned no readable text.";
}

async function callOpenAI(messages, env, options = {}) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY secret on this Worker.");
  }

  const data = await postChatCompletion({
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-4.1-mini",
    messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  return data.choices?.[0]?.message?.content?.trim() || "OpenAI returned no readable text.";
}

async function postChatCompletion({ url, apiKey, model, messages, maxTokens = 800, temperature = 0.7 }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI provider request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: { message: text } };
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `AI request failed: HTTP ${response.status}`);
  }

  return data;
}

function normalizeProvider(provider) {
  const value = String(provider || "").toLowerCase();
  if (value === "openai" || value === "deepseek") {
    return value;
  }
  throw new Error("Unsupported provider. Use openai or deepseek.");
}

function buildMessages(body) {
  return [
    {
      role: "system",
      content: [
        "你是谨慎的六爻学习参考解读助手。",
        "必须使用用户提供的机器排盘结果分析，不要反问用户补原卦、变卦、世应、六亲等已提供字段。",
        "如果信息不足，可以说明缺少月建或现实背景会影响细断，但仍要基于已有盘面给参考判断。",
        "不要声称确定性，不要恐吓用户，不提供医疗、法律、投资等结论。",
        "回答使用简体中文，控制在 900 字以内。",
      ].join(""),
    },
    {
      role: "user",
      content: buildPrompt(body),
    },
  ];
}

function buildPrompt(body) {
  const chart = body.chart || {};
  const lines = chart.lines || [];
  const movingLines = lines.filter((line) => line.moving);

  return [
    "请解读下面这份六爻机器排盘。注意：这些字段就是本次盘面，不要再要求用户补原卦、变卦、世应、六亲或硬币记录。",
    "",
    "【基础信息】",
    `所问事项：${body.question || chart.question || "未填写"}`,
    `起卦时间：${chart.castTime || "未提供"}`,
    `日辰：${chart.dayGanzhi || "未提供"}`,
    `空亡：${(chart.emptyBranches || []).join("") || "未提供"}`,
    "",
    "【卦象】",
    formatHexagram("本卦", chart.original),
    formatHexagram("变卦", chart.changed),
    `动爻：${movingLines.length ? movingLines.map((line) => `${line.index}爻`).join("、") : "无"}`,
    "",
    "【爻位明细，自上而下】",
    ...lines.slice().reverse().map(formatLine),
    body.chartText ? ["", "【前端生成的可读盘面】", body.chartText].join("\n") : "",
    "",
    "请按以下结构输出：",
    "1. 卦象总观：本卦、变卦、世应与动爻的整体气势。",
    "2. 用神与关键爻：根据所问事项选择可能的用神；如果问题过泛，请说明只能粗看。",
    "3. 生克动变：结合六亲、纳支五行、世应、动爻和空亡。",
    "4. 趋势判断：给出谨慎参考，不作确定断言。",
    "5. 建议：给出可执行建议，并提醒仅供学习参考、相信科学。",
    "",
    "禁止输出“缺少原卦、变卦、世应、六亲排布”等反问，因为上面已经提供。",
  ].join("\n");
}

function formatHexagram(label, hexagram = {}) {
  return `${label}：${hexagram.name || "未知"}（${hexagram.number || "?"}），${hexagram.palace || "?"}宫${hexagram.palaceElement || "?"}，${hexagram.palaceStage || "?"}`;
}

function formatLine(line) {
  const marker = line.marker ? ` ${line.marker}` : "";
  const moving = line.moving ? " 动爻" : "";
  return `${line.index}爻：${line.spirit || ""} ${line.relation || ""} ${line.branch || ""}${line.element || ""} ${line.symbol || ""}${marker}${moving}，变为${line.changedSymbol || ""}`;
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
