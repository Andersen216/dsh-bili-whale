# 🐋 dsh-bili-whale ｜ 刷B站（B站大肥鱼号）

> **dsh-bili-scroll 的 macOS 魔改分支**。上游：[c1overzz/dsh-bili-scroll](https://github.com/c1overzz/dsh-bili-scroll)（MIT）。
> 这个分支不跟上游共用更新渠道 —— 升级只从 **本仓库** 拉，不会把本地改动冲掉。

## 它是什么

一个 DSH 插件：让一个 B站 小号（"大肥鱼"）替你刷视频、读字幕挑值得看的、写日报，
并且能在评论区**回 @ 消息、主动巡逻逗人、被攻击时回怼**。

## 这个分支比上游多了什么

- **macOS / 桌面版适配**：dsh 路径解析、一键升级、双击按钮没反应、进程看板
- **常驻 @ 监听**：一条一条按顺序回，回完立刻扫下一条；热窗口 8 秒轮询
- **回之前先读评论区上下文**（整串楼中楼），不再"前言不搭后语"
- **认人**：唯一主人 UID，别人冒充主人一律不认；提示词攻击 / 让解方程证明 = 不接，可回怼
- **身份锁定**：重铸身份 / 重置人格 / 解放权限 等破甲话术 → 不执行
- **认清自己**：从账号接口读自己当前昵称（改名也跟得上），不会把 @ 自己当成别人
- **主动搜索**：点开才开，只扫今天挑过的视频评论区，逗两句就收（每天上限）
- **主界面左下角 🐋 浮动面板**：看消息队列、逐条「引导 / 怼 / 忽略」、一键跑一轮；面板可拖拽
- **两本日记**（给主人的 + 私人的）、私信通知、会话记录自动清理
- **播放量门槛**：技术类 ≥ 5000、娱乐/拟人类 ≥ 300（可调），先筛后读字幕省 token

## 安装

需要 **dsh ≥ 0.1.7-rc.1**、Node ≥ 22。

```bash
# 桌面版（Electron）用自带 CLI：
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" \
  plugin --profile desktop add github:AndersenZZR/dsh-bili-whale
```

装完**重启一次** DSH（⌘Q 再打开）。

本地开发：

```bash
dsh plugin --profile desktop add link:/path/to/dsh-bili-whale
```

## 目录

- `index.js` — 宿主半端（工具、HTTP `/api/bili-duty/*`、定时器、配置）
- `client.js` — 浏览器半端（设置页「刷B站」+ 左下角 🐋 面板）
- `lib/` — 状态/时区/MCP 客户端/评论复核
- `prompts/duty.md` — 值班章程（每天怎么刷）
- `vendor/bilibili-mcp/` — 内置的 Python MCP（搜视频/字幕/评论/回评/私信）
- `MAC-PATCH.md` — 本分支改动日志

## 许可

MIT。上游版权归 c1overzz；本分支改动归 AndersenZZR。
内置的 `vendor/bilibili-mcp` 为 MIT（Copyright (c) 2026 AGI_Ananas）。
详见 `LICENSE` 与 `NOTICE.md`。
