# WKWebView / Tauri 踩坑实录（必读）

> 本文档记录 Agent Workbench 开发中真实发生、耗时数轮才定位的问题。改 UI 前先读一遍。

## 1. CSP nonce 拦截 inline style 属性（2026-08-29，根因级）

**症状**（曾经以为是多个独立 bug）：
- 打包 app 里卡片右侧阶段条灰色/透明/「消失」，浏览器打开同一文件却彩色
- 设置页/详情抽屉在 app 内「排版乱」，浏览器正常
- 点几次才显示颜色（重绘偶发成功造成的错觉）
- JS `el.style.cssText` 设置的样式正常，`innerHTML` 模板里的 `style="..."` 全部失效

**根因**：Tauri 打包时会给 HTML 里的 `<style>` 注入 nonce 并改写 CSP。按 CSP 规范，
**指令中一旦出现 nonce/hash，`'unsafe-inline'` 即被忽略**。于是：
- `<style>` 块：有 nonce → 类样式正常
- `style=""` 属性：回退到被 nonce 污染的 style-src → **被 WKWebView 全部拦截**
- JS CSSOM（`el.style.background=...`）：不受 CSP 限制 → 正常
- 浏览器直接打开：没有 CSP → 一切正常

**诊断手法**（可复用）：
1. `report_frontend` Tauri 命令 + 前端 `rep()` 探针，把 DOM 矩形/`getComputedStyle` 写入日志
   （tauri-plugin-log 的 Webview target 抓不到前端 console，探针必须走自定义命令）
2. `getComputedStyle(dot).backgroundColor === 'rgba(0, 0, 0, 0)'` ⇒ inline 样式根本没进 DOM 生效，
   是 CSP 而非「绘制问题」
3. 截图对比：JS cssText 的元素有色、innerHTML 模板的元素无色 → 锁定 style 属性被拦

**修复**：`tauri.conf.json` 的 CSP 显式追加 **`style-src-attr 'unsafe-inline';`**
（该指令专管 style 属性，不受 style-src 中 nonce 影响）。commit `1ba6078`。

**推论**：以后凡是「浏览器正常、app 内样式失效」，第一反应查 CSP style-src-attr，
而不是反复调渲染时序。

## 2. 窗口隐藏期 rAF 不跑 + innerHTML 不 paint

- 窗口 `visible:false` 创建、稍后 show：隐藏期间 **WKWebView 不执行 requestAnimationFrame**，
  插入的 innerHTML 首帧可能不进帧缓冲
- 已改为**事件驱动握手**：前端首帧渲染后直接 `invoke('frontend_ready')`（Rust show+focus，
  不能等 rAF），show 成功后（rAF 恢复）再双重 rAF 强制重绘一帧；Rust 侧保留 4s 兜底 show
- 诊断探针：`render#n rows/gauges/pills` 写日志，DOM 正确 + 视觉错误 ⇒ paint 层问题

## 3. 其他坑速查

| 坑 | 处理 |
|---|---|
| `bundle_dmg.sh` 偶发 `Not enough arguments` | `rm -rf target/release/bundle` 重跑 |
| Chrome headless 走系统代理（127.0.0.1:7897 挂了就连不上 localhost） | 加 `--no-proxy-server`，或直接用探针日志 |
| tauri-plugin-log Webview target 抓不到前端 console | 用 `report_frontend` 自定义命令打点 |
| 双显示器下 cliclick/截图坐标系混乱 | 以 `system_profiler SPDisplaysDataType` 分辨率换算，或干脆让人操作+读探针 |
| macOS 点 X 隐藏到托盘后 Dock 打不开 | 处理 `RunEvent::Reopen`（show+focus+unminimize） |
| 关闭窗口=隐藏，进程常驻 | `on_window_event` prevent_close + hide，托盘退出才真退 |
