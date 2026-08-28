# Agent Workbench

管理 AI Agent 项目和 Prompt 版本的个人工具，三端（Windows / macOS / Ubuntu）桌面 App + Cloudflare 自动同步。

## 目录结构

```
agent-workbench-app/
├── cloudflare-worker/   同步后端：一个 Worker + 一个 KV 命名空间
└── desktop-app/         三端桌面 App（Tauri）
```

## 建议的部署顺序

1. **先部署后端**：进 `cloudflare-worker/`，跟着里面的 README 一步步来，几分钟能搞定，最后会拿到一个 Worker 地址 + 你自己设的密钥。
2. **本地跑通桌面 App**：进 `desktop-app/`，跟着 README 装好依赖、`npm run dev` 跑起来，首次打开填入第 1 步拿到的地址和密钥，确认能正常创建项目、刷新页面/重启数据还在。
3. **推到 GitHub、打 tag**：触发 Actions 自动编译出三端安装包（也是在 `desktop-app/README.md` 里有详细说明）。
4. **在另外两台设备上装好安装包**，同样填入第 1 步的地址和密钥，数据就自动同步过去了。

## 每台设备之后怎么用

正常打开 App 用就行，不需要手动做任何同步操作：
- 打开 App / 切回这个窗口 / 每隔 1 分钟，会自动去后端拉一次最新数据
- 每次新建项目、编辑、加 Prompt，都会自动推送到后端（右上角状态点会显示"同步中 / 已同步 / 离线"）
- 断网时正常使用，数据先存在本地缓存里，联网后会自动补上

## 如果之后想换同步方案

这套架构里，前端（桌面 App）和后端（Worker）是通过一个很简单的 HTTP 接口（`GET/PUT /api/state`）解耦的。以后如果想把后端换掉（比如换成自建服务器、换成别的云厂商），只需要保证新后端实现这两个接口的行为一致，桌面 App 那边基本不用改。
