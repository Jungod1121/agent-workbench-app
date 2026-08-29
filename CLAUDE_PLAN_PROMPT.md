# 提示词：Agent Workbench → CC Switch 产品型架构重构计划

你是资深架构师。下面是我两个项目的**完整关键信息**（已内嵌，无需访问任何文件）。请基于这些信息产出**分阶段可执行的重构计划**。

---

## 一、项目 A：Agent Workbench（要被重构的）

**定位**：管理 AI Agent 项目和 Prompt 版本的桌面工具（Tauri 2，macOS/Windows/Linux），本地优先 + Cloudflare 同步。UI 为 Apple 设计语言。

### 前端（当前）
- **单文件** `index.html`（约 1747 行，vanilla JS + 手写 CSS，零构建工具、零依赖），直接由 Tauri `frontendDist: ../web` 内嵌
- 关键 DOM：顶栏**悬浮岛**（sticky top:8px、56h、圆角18、T0 磨砂 `rgba(245,245,247,.8)+saturate(180%) blur(20px)`，深色 `rgba(22,22,23,.8)`）→ 内容区（统计看板 usage-bar T0 磨砂 → toolbar 内**阶段彩色条** stage-pill → 列表）→ 全屏 drawer（设置/详情/新建共用）
- 状态：`state={projects, filterStage, search, loaded, page, pageSize}`；localStorage（settings/theme/language/cache/sync-state）+ Tauri DB 双写
- 核心函数：`render()/renderGrid()/renderStagePill()/rowHtml(p)/openDetail/openCreateModal/renderSettingsDrawer`、`filteredProjects()`、`simpleLineDiff()`（Prompt 版本 diff）、拖拽排序（HTML5 DnD）、右键菜单
- i18n：**手写 I18N 对象**（zh/zh-TW/en/ja 四语言），`t('path')` 函数；**不完整**（分类、新建、详情标题等仍写死中文）
- 主题：light/dark/system 三态，`.dark` 类 + CSS 变量覆写；深色下玻璃拟态（T1 `blur(40px) saturate(180%)` + 白 7% + 受光边）、极光 radial 背景（青#2DD4BF/蓝#4F8DF9/紫#A78BFA）
- 设计令牌：CSS 变量 `--background/--card/--primary/--muted/--border`（HSL）+ 阶段色 `#d97706/#2563eb/#7c3aed/#059669`（构思/开发/测试/上线）+ 唯一蓝 `hsl(210 100% 56%)`
- 交互：无动画库（纯 CSS transition），无快捷键，无 hover 显隐，滚动条自定义

### 后端（当前）
- Rust 4 个文件：`main.rs`（7 行）+ `lib.rs`（插件注册/托盘/深链/单实例/窗口事件/15 个命令）+ `db.rs`（SQLite）+ `proxy.rs`（axum）
- **15 个 Tauri 命令**：`get_projects / save_projects / backup_now / list_backups / restore_backup / delete_backup / set_window_theme / open_external / get_proxy_status / start_proxy / stop_proxy / set_proxy_upstream / export_projects_to_file / import_projects_from_file / report_frontend`（诊断探针）
- 数据：rusqlite bundled + **WAL**，`meta` 表存 `schema_version=2`；备份快照到 `app_config_dir/backups/`（手动触发，无 retain 策略、无恢复 UI）
- 代理：axum 动态端口（优先 19840），仅回显/转发（非协议翻译）
- 同步：Cloudflare Worker `GET/PUT /api/state` + `X-Sync-Token`，KV **整文件**覆盖；冲突时前端弹窗选择（先备份）
- 插件：single-instance / deep-link(`agentworkbench://`) / log / dialog / store / updater / window-state / opener / process / tray-icon
- 托盘：静态菜单（显示主窗口/阶段筛选/退出）；窗口关闭=隐藏到托盘；macOS RunEvent::Reopen 处理 Dock 唤起

### 功能现状
项目 CRUD（名称/简介/阶段/分类/标签/图标/颜色/暂停标记）、搜索、筛选（全部/四阶段/暂停）、分页（10/20/50）、拖拽排序、右键菜单（编辑/复制/删除）、Prompt 版本管理（添加版本、diff 对比、一键回滚）、设置 drawer 6 tab（通用：语言/主题/本机存储/代理开关；同步：Worker 地址/密钥/备份管理/导入导出；代理：启停/上游/测试；图标库；Usage 统计；About）、JSON 导入导出、自动备份间隔（未实现定时任务，仅手动）

### 已知问题（未解决）
- **直接浏览器打开 index.html UI 正常，打包进 app（WKWebView）后部分 UI 排版/显示错乱**（详见第三节）

## 二、项目 B：CC Switch（要模仿的「产品型」架构）

**定位**：AI 编程 CLI 统一管理工具（Tauri 2 + React），v3.20.1。

### 前端
- React 18 + Vite 7 + TypeScript 5 + Tailwind 3 + shadcn/ui（Radix 16 原语 + cva + clsx + tailwind-merge）+ framer-motion 12 + lucide-react + @tanstack/react-query（12 个 query 模块）+ react-i18next（zh/zh-TW/en/ja）+ sonner + react-virtual + recharts + dnd-kit + CodeMirror
- **14 个视图**：`providers | settings | prompts | skills | skillsDiscovery | mcp | agents | universal | sessions | workspace | openclawEnv | openclawTools | openclawAgents | hermesMemory`；`currentView` useState + localStorage 持久化，framer-motion `AnimatePresence mode="wait"` 淡入淡出 0.2s；AppSwitcher 分段控件（ResizeObserver 溢出收纳）
- **IPC 封装**：`src/lib/api/` 27 个模块 3108 行（`invoke<T>` 薄封装 + 类型化事件），`lib/query/` 消费
- 设计：shadcn HSL token（`--background/--foreground/--primary 210 100% 56%/…`）+ Apple 色板混搭（blue-500 #0A84FF、systemGray 系）；`rounded-xl(0.875rem)` 一统；玻璃只用于设置页/弹窗（`.glass` blur10、`.glass-card` blur20 共 36 处）；主题三态 class 方案 + `invoke("set_window_theme")` 同步原生标题栏
- 交互细节：ProviderCard hover 显隐操作区、状态 badge 语义色（sky/emerald/amber/slate 10px）、骨架屏、sonner toast、⌘, 设置 / Esc 返回 / Ctrl+F 命令式搜索、窗口失活心跳淡化、dnd-kit 拖拽（KeyboardSensor + 8px 激活距离 + scale-105 + 乐观更新）

### 后端
- 37 顶层模块，**三层分层**：`commands/`（34 模块 **303 命令**）→ `services/`（40+ 文件）→ `database/`（schema + migration + backup + **dao/ 8 个 DAO**）
- 数据库：rusqlite bundled，无 WAL，`PRAGMA user_version`=18，**SAVEPOINT 包迁移**（v0→v18 逐版），迁移前自动备份，版本过新进入恢复界面，`foreign_keys=ON` + auto_vacuum
- 备份：快照到 `backups/`，默认 24h/保留 10 份，启动时 + 定时任务，WebDAV/S3 双云同步（SQL 导出 + authorizer 防注入）
- 代理：axum Router + 手动 hyper accept loop（15721 端口），协议翻译网关（Claude↔OpenAI↔Gemini 互转、SSE、流式改写），熔断器（Closed/Open/HalfOpen）+ failover 队列 + `provider_health` 落库 + 热切换 emit 事件，Live 接管 CLI 配置文件 + 崩溃恢复表
- 用量：三源归一（代理实时记账 → `proxy_request_logs` + 200ms 防抖 emit；8 app 会话文件扫描 + 字节游标增量；rquickjs 沙箱用户脚本 5s/16MiB）
- 托盘：动态菜单（用量/配额 tier 分组）；深链 `ccswitch://` 承载配置导入业务流
- 配置：settings 存 SQLite `settings` 表（key/value）

### 差异总览（A vs B）
| 维度 | A | B |
|---|---|---|
| 前端 | 单文件 vanilla JS，0 构建 | React+Vite+TS+Tailwind+shadcn，JS 约 1.5–2.5MB |
| 命令 | 15 | 303（34 模块） |
| Rust 分层 | 4 文件扁平 | commands→services→dao 三层 |
| 数据库 | WAL（更现代），schema_version=2 | 无 WAL，user_version=18 + SAVEPOINT 迁移 + 备份兜底 |
| 代理 | 透明转发 | 协议翻译网关 + 熔断 + failover + 实时记账 |
| 同步 | CF Worker 整文件 PUT | WebDAV/S3 SQL 级同步 |
| 视图 | 单页 + drawer | 14 视图 + AnimatePresence |

## 三、必须纳入第一阶段的 Bug（高优先级）

**现象**：直接双击打开 index.html（浏览器）UI 完全正常；打包成 app（tauri build，WKWebView）后，**部分 UI 排版/显示错乱**。历史表现（用户原话）：①启动时卡片右侧阶段条不显示，反复点击分类几次后才出现；②设置界面在浏览器正常、app 内排版/UI 部分乱了。

**已排查证据（不要重复踩坑，直接引用）**：
1. 阶段条问题根因已定位：窗口以 `visible:false` 创建、120ms 后才 show，WKWebView 对**窗口隐藏期** innerHTML 插入的内容不执行 paint，用户交互触发重绘后才显示 → 已通过「窗口 show 后 t+600ms + window focus / visibilitychange 时强制 render()」缓解
2. 探针实测（Rust `report_frontend` 命令 + 前端 `rep()` 打点，写入日志）：DOM 层 `render#1 rows=10 gauges=10 pills=6` 始终正常——**纯 paint 层问题，不是 DOM/数据问题**
3. headless Chrome 1440/900 两种宽度实测无横向溢出，布局本身无错
4. 历史坑：tauri-plugin-log 的 Webview target 抓不到前端 console（探针走自定义命令）；Chrome headless 受系统代理 127.0.0.1:7897 影响需 `--no-proxy-server`；`bundle_dmg.sh` 偶发失败需 `rm -rf target/release/bundle` 重试

**要求**：第一阶段设立「环境差异排查与修复」工作流：系统化对比浏览器 vs WKWebView 渲染差异（候选：`-apple-system` 字体度量差异、滚动条样式、`backdrop-filter` 叠加性能/边界、`background-attachment:fixed`、`hsl(var(--x)/alpha)` 语法、渐变文字 `background-clip:text`、flex `gap`、`100vh` 与滚动容器嵌套、`-webkit-app-region` 影响），给出可验证的修复与回归清单，并说明如何用探针日志验证。若前端迁移到 React，需同时给出新前端在 WKWebView 下的验证方案（如 tauri dev + 发布构建双验证）。

## 四、重构目标（产品型，但保留差异化）

1. **前端工程化**：单文件 → Vite + React + TypeScript + Tailwind + shadcn/ui（或等价），组件化；**类型化 IPC 契约**（命令清单 + TS 类型生成）；**完整 i18n**（全部 UI 文案 4 语言，含分类/新建/详情/右键菜单）；react-query 状态层；framer-motion 视图切换
2. **后端分层**：4 文件 → `commands/ → services/ → database/dao/`，按业务域组织（projects/prompts/proxy/backup/sync/settings/system）
3. **数据库演进**：user_version 式版本化迁移 + SAVEPOINT + 迁移前自动备份 + 过新恢复界面（保留我们的 WAL 优势）；备份加 retain 策略与恢复 UI
4. **同步演进**：有冲突解决/变更追踪的同步（保持 Cloudflare Worker 通道，可参考 CC 的"跳过本地瞬态表"思路）
5. **保留清单（必须不丢）**：阶段彩色条与阶段筛选、Prompt 版本 diff/回滚、Apple 玻璃设计语言（悬浮岛/T1 拟态/T0 磨砂/极光背景/G9 渐变标题/四阶段色）、托盘隐藏 + Dock 唤起、deep-link、JSON 导入导出、探针日志体系
6. **补齐**（按优先级）：⌘, 设置 / Esc 返回快捷键、窗口失活淡化、hover 显隐操作区（可选项）、托盘用量显示（若引入用量统计）

## 五、输出要求

产出**分阶段详细计划**（建议 6-8 阶段，每阶段独立可交付、可验证）。每阶段必须包含：
- **目标**：一句话 + 验收标准（Definition of Done，可测试）
- **文件级改动**：新建/修改/删除哪些文件、代码结构示意（目录树、关键接口签名）
- **依赖顺序**：阶段间依赖、可否并行
- **决策点**：需用户拍板的选择（如：shadcn/ui 还是自研；是否保留 proxy 功能；i18n 用 i18next 还是自写；是否引入用量统计），每项给出推荐 + 理由
- **验证方式**：构建命令（tauri 项目在 `desktop-app/src-tauri` 下跑 `npm run build`）、运行验证步骤、探针日志检查点

额外要求：
- 第一阶段必须是「Bug 修复」且独立可交付；前端迁移与其的并行/先后关系请给出明确判断
- 明确 **CC Switch 不该学的**（候选：双层 dragBar 28+header 64 占 92px；10px 小字 badge 泛滥；6 列 grid tab 挤压文案；设置页全屏 view vs drawer——给出你的判断）
- 每阶段给估算工作量（人日）与回滚方案
- 计划要具体到"下一步能直接照着写代码"，禁止泛泛而谈