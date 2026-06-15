# suanming

一个六爻基础排盘工具，包含网页版和 Python 命令行版。

## 网页版

打开 `index.html` 即可本地使用。推送到 GitHub 后，会通过 GitHub Pages 自动部署。

默认公开访问地址通常是：

```text
https://lossssser.github.io/suanming/
```

如果第一次部署后没有自动可用，请到 GitHub 仓库的 `Settings` -> `Pages`，把构建来源设置为 `GitHub Actions`。

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
