# Agent Workbench

> **Manage every AI agent project, stage, and prompt version in one local-first desktop app — synced across your machines through a single Cloudflare Worker.**

Agent Workbench is a personal workspace for people who build with AI agents every day. Track what you're building (`idea → building → testing → live`), keep a versioned history of every prompt, diff and roll back prompt changes, and sync everything across macOS / Windows / Ubuntu — with a sync backend small enough to read in one sitting.

Written by [Jungod](https://github.com/Jungod1121) as dogfood for their own workflow: all 12 projects currently tracked in the app are real, active agent projects.

> **立即给我的话：** 这是一个本人重度使用、三端可跑、带云同步的个人 Agent 项目管理工具 —— 完整技术叙事见下方 Architecture 章节。

---

## Why

Heavy AI-agent users hit a wall the standard todo apps never solve: **a project isn't a task — it's a living prompt system.** You iterate a prompt, watch it drift, roll it back, ship it. That lifecycle needs:

- a **stage pipeline** (`idea → building → testing → live`) instead of `done / not done`
- **versioned prompts** you can diff against and roll back, not one editable blob
- **sync across multiple machines** (desktop + laptop + dev box) that still works offline

Agent Workbench exists to own that lifecycle.

## Features

| Area | What it does |
|---|---|
| **Projects** | CRUD with name / description / stage / category / tags / icon / pause flag; drag-to-sort; search + filter (all / 4 stages / paused); pagination (10/20/50); right-click menu (edit / duplicate / delete) |
| **Stages** | Four-state pipeline `idea → building → testing → live`, each with its own color token, visible as a single glanceable pipeline strip |
| **Prompts** | Version management per project: add versions, **line-level diff** between any two, one-click rollback, mark current |
| **Backups** | Manual snapshots with restore; JSON import / export of the whole library |
| **Sync** | Push/pull to a Cloudflare Worker; offline-first (writes queue locally, syncs on reconnect); conflict resolution dialog with three choices |
| **App** | Tray icon (menu hides to tray on close; macOS Dock `Reopen` handled), deep-link scheme `agentworkbench://`, auto-updater, window state persistence |

## Screenshots

*Screenshots pending — see `assets/screenshots/`.*

## Architecture

The system is intentionally kept to two pieces, decoupled through a single HTTP contract.

```
┌─────────────────────────────┐
│   Desktop App (Tauri 2)     │
│  ┌───────────────────────┐  │         GitHub Actions
│  │ React + Vite frontend │  │  ───►  builds macOS .dmg
│  │ (web-react/)          │  │          Windows .msi
│  └──────────┬────────────┘  │          Ubuntu .deb
│             │ invoke        │
│  ┌──────────▼────────────┐  │
│  │ Rust backend          │  │
│  │ commands → services   │  │
│  │        → database/dao │  │
│  │ SQLite (WAL) +        │  │
│  │ versioned migrations  │  │
│  └──────────┬────────────┘  │
└─────────────┼───────────────┘
              │ GET/PUT /api/state + X-Sync-Token
┌─────────────▼───────────────┐
│  Cloudflare Worker (~50 LOC)│
│  Single KV namespace        │
└─────────────────────────────┘
```

### Backend layering

The Rust side follows a strict three-layer split, so the hard parts (logic, persistence) stay testable and the UI layer stays thin:

- **`commands/`** — thin parameter parsing; each Tauri command is a few lines
- **`services/`** — business logic (project ops, backup orchestration)
- **`database/`** — SQLite via `rusqlite` (WAL mode), plus a **versioned migration framework** (`v1` init → `v2` add category/icon → `v3` add sync-change tracking); schema evolves forward without data loss

### Sync: minimal by design

The Cloudflare backend is a single Worker file ([`cloudflare-worker/src/index.js`](cloudflare-worker/src/index.js)) — roughly 50 lines: `GET /api/state`, `PUT /api/state`, token check via `X-Sync-Token` header, one KV key for the whole dataset. The desktop app polls every 60s + on window focus, and its sync logic is a small explicit state machine (`idle / syncing / ok / offline`) with `dirty` tracking so offline edits queue up and flush on reconnect. If you outgrow it, the HTTP contract is the seam: swap the Worker for a Durable-Objects/WebSocket backend without touching the app.

## Tech Stack

- **Shell**: Tauri 2 (Rust + embedded WebView) — macOS / Windows / Linux from one codebase
- **Frontend**: React + Vite + TypeScript, Apple-design glass/frosted aesthetic, light/dark/system themes
- **i18n**: zh / zh-TW / ja / en
- **Persistence**: SQLite (WAL) with versioned migrations
- **Backend**: Cloudflare Worker + KV
- **Release**: GitHub Actions matrix build → three installers per tag, with auto-updater

## Getting Started / Development

> Full setup guide in [`desktop-app/README.md`](desktop-app/README.md); the `cloudflare-worker/` folder has its own deploy README.

```bash
# 1. Deploy the sync backend (5 min)
cd cloudflare-worker   # follow its README → get Worker URL + your token

# 2. Run the desktop app
cd desktop-app
npm install
npm run dev
```

Load data instantly via the in-app **demo data** entry in Settings (a curated JSON dataset of 12 varied projects) — no backend needed to explore the UI.

## Real-World Usage

The app is dogfooded daily by its author. Current tracked state (2026-08):

```
12 projects tracked, spanning all 4 stages:
  building  indoor-slam-drone · ai_income_lab · digital-craft · agent-workbench-app
  live      记账 · 影像集
  testing   量化 · hold-still · sun-print · val分析
  idea      整理项目
```

## Roadmap / Known Limits

- **Sync is last-writer-wins**, not field-level merge. Fine for single-user use across devices; a true merge would need Durable Objects + WebSockets.
- Sync is **poll-based** (60s + focus), not real-time push.
- Prompt history is per-project and capped by manual versioning — no auto-snapshot on every save (yet).

## License

MIT-style for the code, or private — ask the author.