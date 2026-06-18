# Cloudflare 域名绑定图文说明

目标结构：

```text
用户打开网页
    |
    v
https://shxgjqaq.com
    |
    v
Cloudflare Pages 负责显示网页
    |
    | 点击 AI断卦
    v
https://api.shxgjqaq.com
    |
    v
Cloudflare Worker: suanming-api
    |
    v
DeepSeek / OpenAI
```

现在要把两个域名分开：

```text
shxgjqaq.com       = 网页
api.shxgjqaq.com   = AI 接口
```

## 1. 先理解三个东西

### A. Cloudflare Pages

这是“网页服务器”。

它负责把 GitHub 仓库里的这些文件变成网页：

```text
index.html
styles.css
app.js
```

最终别人应该访问：

```text
https://shxgjqaq.com
```

### B. Cloudflare Worker

这是“后端接口”。

你的 Worker 名字叫：

```text
suanming-api
```

它负责执行：

```text
worker.js
```

最终网页点击“AI断卦”时，请求：

```text
https://api.shxgjqaq.com
```

### C. GitHub

GitHub 只是代码仓库。

最终用户不用看 GitHub 链接。Cloudflare Pages 会从 GitHub 拉代码部署网页。

## 2. 当前应该长什么样

Cloudflare 里最终应该有两个项目：

```text
Workers & Pages
|
|-- Pages 项目：suanming 或类似名字
|      |
|      |-- Custom domain: shxgjqaq.com
|
|-- Worker 项目：suanming-api
       |
       |-- Custom domain: api.shxgjqaq.com
```

## 3. 先改 Worker

路径：

```text
Cloudflare 控制台
-> Workers & Pages
-> suanming-api
-> Domains
```

你现在看到的可能是：

```text
Custom Domain
Production
shxgjqaq.com
```

这是不对的，因为 `shxgjqaq.com` 要留给网页。

你要做：

```text
删除 shxgjqaq.com
添加 api.shxgjqaq.com
```

操作后应该变成：

```text
Worker URL
suanming-api.826552635.workers.dev

Custom Domain
api.shxgjqaq.com
```

如果你没有看到 `api.shxgjqaq.com` 这个选项，不是让你选择已有项，而是要手动输入：

```text
api.shxgjqaq.com
```

常见按钮名字可能是：

```text
Add
Add Custom Domain
Custom Domain
```

## 4. 再改 Pages

路径：

```text
Cloudflare 控制台
-> Workers & Pages
-> 你的 Pages 项目
-> Custom domains
```

注意：这个项目不是 `suanming-api`。

`suanming-api` 是 Worker，不是网页。

Pages 项目一般会显示这些东西：

```text
Production branch
Build command
Deployments
GitHub repository
```

给 Pages 项目添加 Custom Domain：

```text
shxgjqaq.com
```

最终 Pages 项目里应该看到：

```text
Custom domains
shxgjqaq.com
```

## 5. 最终检查

配置完成后，我会帮你测这四项：

```text
1. shxgjqaq.com 能解析
2. shxgjqaq.com 打开后 title 是 六爻排盘
3. api.shxgjqaq.com 能解析
4. api.shxgjqaq.com POST 能返回 AI 内容
```

正确结果应该是：

```text
https://shxgjqaq.com
打开网页

https://api.shxgjqaq.com
不是给人直接看的网页，而是给 app.js 调用的 AI 接口
```

## 6. 如果你只看到 shxgjqaq.com 这个选项

这是正常的。

`shxgjqaq.com` 是你的 zone，也就是主域名。

添加 Worker Custom Domain 时，不是从列表里选 `api.shxgjqaq.com`，而是你手动输入：

```text
api.shxgjqaq.com
```

Cloudflare 会自动在 `shxgjqaq.com` 这个 zone 下面创建这个子域名。

## 7. 一句话版

```text
Worker suanming-api 绑定 api.shxgjqaq.com
Pages 网页项目绑定 shxgjqaq.com
```

