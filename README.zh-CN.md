# Agent Workbench

> **一个本地优先的桌面应用，管理你所有的 AI Agent 项目、阶段与 Prompt 版本 —— 通过一个 Cloudflare Worker 在三台设备间自动同步。**

给每天用 AI agent 干活的人准备的个人工作台：项目管理走 `构思 → 开发 → 测试 → 上线` 四阶段流水线，每个 Prompt 有版本历史（可逐行 diff、可一键回滚），数据在 macOS / Windows / Ubuntu 三端同步，同步后端小到一次性能读完。

作者 [Jungod](https://github.com/Jungod1121) 自用项目（dogfooding）：应用里当前追踪的 12 个项目全部是本人真实在做的 agent 工程。

---

## 为什么做这个

重度 AI agent 用户会遇到待办工具永远解决不了的问题：**项目不是任务，而是一套活着的 Prompt 系统。** 你会迭代一个 Prompt、看着它漂移、回滚、上线。这个生命周期需要：

- **阶段流水线**（构思→开发→测试→上线），而不是「完成/未完成」
- **有版本的 Prompt**，能对比能回滚，而不是一个可编辑的 blob
- **多设备同步**（桌面 + 笔记本 + 开发机），断网也能用

Agent Workbench 就是为了拥有这个生命周期。

## 功能

| 模块 | 说明 |
|---|---|
| **项目** | 增删改查（名称/简介/阶段/分类/标签/图标/暂停标记）；拖拽排序；搜索 + 筛选（全部/四阶段/已暂停）；分页（10/20/50）；右键菜单（编辑/复制/删除） |
| **阶段** | 四态流水线 `构思→开发→测试→上线`，每阶段独立色板，一眼可读的流水条 |
| **Prompt** | 每个项目多版本管理：添加版本、**逐行 diff** 任意两版、一键回滚、标记当前版 |
| **备份** | 手动快照 + 恢复；整库 JSON 导入导出 |
| **同步** | 推/拉到 Cloudflare Worker；离线优先（本地排队、重连自动补）；冲突三选弹窗 |
| **应用** | 托盘菜单（关窗隐藏到托盘；macOS Dock 唤起已处理）、深链 `agentworkbench://`、自动更新、窗口状态记忆 |

## 界面截图

*待补 —— 见 `assets/screenshots/`。*

## 架构

两个部分，通过一个极简 HTTP 契约解耦：

```
┌─────────────────────────────┐
│   桌面应用 (Tauri 2)         │
│  ┌───────────────────────┐  │        GitHub Actions
│  │ React + Vite 前端      │  │  ───►  macOS .dmg
│  │ (web-react/)          │  │          Windows .msi
│  └──────────┬────────────┘  │          Ubuntu .deb
│             │ invoke        │
│  ┌──────────▼────────────┐  │
│  │ Rust 后端              │  │
│  │ commands → services   │  │
│  │        → database/dao │  │
│  │ SQLite (WAL) +        │  │
│  │ 版本化迁移框架         │  │
│  └──────────┬────────────┘  │
└─────────────┼───────────────┘
              │ GET/PUT /api/state + X-Sync-Token
┌─────────────▼───────────────┐
│  Cloudflare Worker (~50行)  │
│  单个 KV 命名空间            │
└─────────────────────────────┘
```

### 后端分层

Rust 侧严格三层，逻辑和持久化可测试，UI 层保持单薄：

- **`commands/`** —— 薄的参数解析，每个 Tauri 命令只有几行
- **`services/`** —— 业务逻辑（项目操作、备份编排）
- **`database/`** —— `rusqlite` + SQLite（WAL 模式），带 **版本化迁移框架**（`v1` 初始化 → `v2` 加分类/图标 → `v3` 加同步变更追踪）；schema 向前演进不丢数据

### 同步：极简设计

后端是一个 Worker 文件（[`cloudflare-worker/src/index.js`](cloudflare-worker/src/index.js)，约 50 行）：`GET /api/state`、`PUT /api/state`、`X-Sync-Token` 头校验、整个数据集一个 KV key。桌面端每 60 秒 + 窗口聚焦时拉取，同步逻辑是显式的状态机（`idle / syncing / ok / offline`）+ `dirty` 标记，离线编辑排队、重连自动补。要升级就把 Worker 换成 Durable Objects + WebSocket，应用侧基本不用改——HTTP 契约就是接缝。

## 技术栈

- **外壳**：Tauri 2（Rust + 系统 WebView）——一套代码出 macOS / Windows / Linux
- **前端**：React + Vite + TypeScript，Apple 设计语言玻璃拟态，浅色/深色/跟随系统
- **i18n**：中 / 繁中 / 日 / 英
- **持久化**：SQLite（WAL）+ 版本化迁移
- **后端**：Cloudflare Worker + KV
- **发布**：GitHub Actions 矩阵构建，打 tag 一次出三端安装包 + 自动更新

## 本地开发 / 使用

> 完整说明见 [`desktop-app/README.md`](desktop-app/README.md)；`cloudflare-worker/` 目录自带部署说明。

```bash
# 1. 部署同步后端（约5分钟）
cd cloudflare-worker   # 按 README 操作 → 拿到 Worker 地址 + 你的密钥

# 2. 跑桌面应用
cd desktop-app
npm install
npm run dev
```

想立刻体验界面：Settings 里有 **载入演示数据** 入口（12 个多元化项目的精选 JSON 数据集），不需要后端。

## 真实使用

作者日常 dogfooding。当前追踪状态（2026-08）：

```
12 个项目，覆盖全部 4 个阶段：
  开发中  indoor-slam-drone · ai_income_lab · digital-craft · agent-workbench-app
  已上线  记账 · 影像集
  测试中  量化 · hold-still · sun-print · val分析
  构思中  整理项目
```

## 已知限制 / 路线

- **同步是后写覆盖**，不是逐字段合并。单用户多设备没问题；真要合并得换 Durable Objects + WebSocket。
- 同步是**轮询**（60 秒 + 聚焦），不是实时推送。
- Prompt 历史是手动版本化，还没有每次保存自动快照（计划中）。

## License

MIT 风格代码，或私有 —— 问作者。