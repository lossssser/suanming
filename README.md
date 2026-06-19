# suanming

一个六爻基础排盘工具，包含网页版、Python 命令行版，以及 Cloudflare Worker AI 解读接口。

## 网页版

公开访问地址：

```text
https://lossssser.github.io/suanming/
```

网页版的“铜钱起卦”会为每一爻模拟三枚铜钱：

- 正面记 3
- 背面记 2
- 三枚相加得到 `6`、`7`、`8`、`9`

四种爻的概率为：

- 老阴 `6`：`1/8`
- 少阳 `7`：`3/8`
- 少阴 `8`：`3/8`
- 老阳 `9`：`1/8`

## GitHub Pages

第一次发布需要到 GitHub 仓库的 `Settings` -> `Pages` 设置：

- Source: `Deploy from a branch`
- Branch: `gh-pages`
- Folder: `/ (root)`

保存后等待 1-3 分钟即可访问。

## Cloudflare Worker

本项目采用路线 1：

```text
shxgjqaq.com -> Cloudflare Pages 静态网页
api.shxgjqaq.com -> Cloudflare Worker AI/API 后端
```

网页里的“AI断卦”会请求独立 Worker：

```text
https://api.shxgjqaq.com
```

`worker.js` 是 Cloudflare Worker 代码。它可以按前端选择调用 DeepSeek 或 OpenAI，并返回断卦文字。

在 Cloudflare Worker 的 `Settings` -> `Variables` 中添加：

- Secret: `DEEPSEEK_API_KEY`
- Secret: `OPENAI_API_KEY`
- Variable（可选）: `DEEPSEEK_MODEL`
- Variable（可选）: `OPENAI_MODEL`
- Variable（可选）: `AI_PROVIDER`

默认配置：

```text
AI_PROVIDER = deepseek
DEEPSEEK_MODEL = deepseek-chat
OPENAI_MODEL = gpt-4.1-mini
```

只想用 DeepSeek 时，只配置 `DEEPSEEK_API_KEY` 即可。前端选择 OpenAI 时，Worker 才会要求 `OPENAI_API_KEY`。

公开留言帖子墙需要 Cloudflare D1：

1. Cloudflare 控制台 -> `Storage & databases` -> `D1 SQL Database`
2. 创建数据库，例如 `suanming_posts`
3. 在 Worker `suanming-api` -> `Settings` -> `Bindings` 添加 D1 binding
4. Binding name 必须填：

```text
DB
```

5. Database 选择刚创建的 `suanming_posts`

Worker 会在第一次访问 `/posts` 时自动创建 `posts` 表。也可以手动执行 `schema.sql`。

如果不想用命令行，可以在 Cloudflare 控制台新建名为 `suanming-api` 的 Worker，把 `worker.js` 内容粘贴进去并部署。

命令行部署方式：

```powershell
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler deploy
```

## Python 命令行版

```powershell
python .\liuyao.py "6 7 8 9 7 8" -q "问事业" -t "2026-06-15 19:50"
```

也可以不带参数，按提示交互输入：

```powershell
python .\liuyao.py
```

## 输入规则

从初爻到上爻输入六个数：

- `6`：老阴，动爻
- `7`：少阳，静爻
- `8`：少阴，静爻
- `9`：老阳，动爻

例如：

```text
6 7 8 9 7 8
```

## 当前输出

- 本卦、变卦
- 八宫、五行、世爻、应爻
- 六神
- 六亲
- 纳支与地支五行
- 日辰与空亡
- AI 断卦文字
