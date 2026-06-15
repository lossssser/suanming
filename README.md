# suanming

一个六爻基础排盘工具，包含网页版和 Python 命令行版。

## 网页版

打开 `index.html` 即可本地使用。推送到 GitHub 后，可以用 GitHub Pages 发布。

网页版的“铜钱起卦”会为每一爻模拟三枚铜钱：

- 正面记 3
- 背面记 2
- 三枚相加得到 `6`、`7`、`8`、`9`

因此四种爻的概率为：老阴 `1/8`、少阳 `3/8`、少阴 `3/8`、老阳 `1/8`。

默认公开访问地址通常是：

```text
https://lossssser.github.io/suanming/
```

第一次发布需要到 GitHub 仓库的 `Settings` -> `Pages` 设置：

- Source: `Deploy from a branch`
- Branch: `gh-pages`
- Folder: `/ (root)`

保存后等待 1-3 分钟即可访问。

## Cloudflare Worker（路线 1）

本项目采用：

```text
GitHub Pages -> 静态网页
Cloudflare Worker -> AI/API 后端
```

网页里的“AI断卦”会请求独立 Worker：

```text
https://suanming-api.826552635.workers.dev
```

`worker.js` 是 Cloudflare Worker 代码。先部署它可以验证：

```text
GitHub Pages 网页 -> Cloudflare Worker -> 返回结果
```

后续接入 AI 时，把 API Key 放在 Cloudflare Worker 的 Secret/环境变量里，不要写进 `app.js`。

部署方式：

```powershell
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler deploy
```

如果不想用命令行，也可以在 Cloudflare 控制台新建名为 `suanming-api` 的 Worker，把 `worker.js` 内容粘贴进去并部署。

## 运行

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

这是排盘工具，不包含自动断卦结论。
