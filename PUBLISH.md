# 发布 / 更新渠道（自己的，不再跟上游）

本仓库是 `dsh-bili-scroll` 的 MIT 衍生分支，**升级只从本仓库拉**，不会覆盖本地改动。

## 1. 推到 GitHub（替换成你的用户名）

```bash
cd "/Users/andersen/DSH Workplace/dsh-bili-whale"

# 1) 先在 GitHub 网页上建一个空仓库：https://github.com/new
#    名字建议：dsh-bili-whale（不要勾 README / .gitignore / license）
# 2) 再推：
git remote add origin https://github.com/Andersen216/dsh-bili-whale.git
git branch -M main
git push -u origin main
```

> 没装 gh 也能用：网页建仓库 + 上面两条命令即可。
> 想用 gh 的话：`brew install gh && gh auth login && gh repo create dsh-bili-whale --public --source=. --push`

## 2. 别人怎么装（GitHub 直装，不需要 npm 发布）

```bash
# 桌面版（Electron）：
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" \
  plugin --profile desktop add github:Andersen216/dsh-bili-whale
```

CLI 版：

```bash
dsh plugin --profile web add github:Andersen216/dsh-bili-whale
```

## 3.（可选）发到 npm，让 `dsh plugin add dsh-bili-whale` 也能装

```bash
npm login                      # 一次性
cd "/Users/andersen/DSH Workplace/dsh-bili-whale"
npm publish --access public
```

发布后安装：

```bash
dsh plugin --profile web add dsh-bili-whale
```

## 4. 以后的更新

- 你自己：改完 `package.json` 的 `version` → `git commit && git push`
- 插件内「一键升级」已经指向 `github:Andersen216/dsh-bili-whale`（见 index.js 的 `lastUpdateSource` 逻辑）
- 本地调试：`dsh plugin --profile desktop add link:/Users/andersen/DSH Workplace/dsh-bili-whale`

## 5. 本地已切好

本机 desktop profile 的 `dsh.profile.bundles` 已换成 `dsh-bili-whale`（旧 `dsh-bili-scroll` 已移除），
数据目录仍是 `~/.dsh/bili-duty`（配置/日记/凭证都保留）。**重启一次 DSH 生效。**
