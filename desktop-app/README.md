# Agent Workbench · 桌面客户端（Tauri）

三端（Windows / macOS / Ubuntu）桌面 App，通过 `../cloudflare-worker` 提供的同步服务自动同步数据。

## 本地开发调试

需要先装好：
- [Node.js](https://nodejs.org/)（18+）
- [Rust](https://www.rust-lang.org/tools/install)
- 系统依赖：
  - **Windows**：安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（勾选 C++ 桌面开发）+ [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 一般已自带）
  - **macOS**：安装 Xcode Command Line Tools（`xcode-select --install`）
  - **Ubuntu/Debian**：`sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential`

```bash
cd desktop-app
npm install
npm run dev     # 会打开一个本地窗口，改代码可以热更新
```

首次打开会看到"连接同步服务"引导页，填入 Cloudflare Worker 的地址和密钥即可（先按 `../cloudflare-worker/README.md` 部署好后端）。

## 打包成安装包

### 方式一：在本机打包（只能打出当前系统的包）

```bash
npm run build
```

产物在 `src-tauri/target/release/bundle/` 下：
- macOS → `.dmg` / `.app`
- Windows → `.msi` / `.exe`
- Linux → `.deb` / `.AppImage`

⚠️ Tauri **不支持交叉编译打包**——在 Mac 上只能打出 Mac 的包，Windows 上只能打出 Windows 的包。这也是为什么下面推荐用方式二一次性拿到三端安装包。

### 方式二：用 GitHub Actions 自动打三端包（推荐）

项目里已经写好了 `.github/workflows/build.yml`，会在三种系统的云端 runner 上分别编译，一次性产出 Windows / macOS / Linux 三份安装包。

1. 把整个 `desktop-app/` 推到一个 GitHub 仓库
2. 打一个 tag 并推送，比如：
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. 到仓库的 Actions 页面等三个平台的 job 跑完（几分钟到十几分钟），跑完后会在 Releases 里生成一个 **draft** release，里面就是三端的安装包
4. 检查一下资产没问题，把 release 从 draft 转成正式发布，或者直接下载安装包分发给自己的另外两台设备

## 关于图标

`src-tauri/icons/icon.png` 目前是一个占位图标。建议自己换一张喜欢的方形图（建议 1024×1024 PNG），然后用 Tauri CLI 一键生成全部尺寸和格式（`.ico`、`.icns` 等）：

```bash
npx @tauri-apps/cli icon path/to/your-icon.png
```

会自动把结果写到 `src-tauri/icons/` 下，`tauri.conf.json` 里已经配好了引用路径，不用再改。

## 首次使用前，需要改的两个地方

1. `src-tauri/tauri.conf.json` 里的 `identifier`：`com.yourname.agentworkbench`，换成你自己的（随便定，格式是反过来的域名风格，只要全局唯一即可，不需要真实拥有这个域名）
2. 换上你自己的图标（见上一节）

## 已知限制 / 后续可以升级的方向

- 目前同步策略是"整份数据互相覆盖"，没有做逐字段合并。正常使用（在一台设备改完存好、再去另一台设备改）不会有问题；如果**同时**在两台设备上改动还没来得及同步，后保存的一份会覆盖先保存的一份。个人单用户场景下概率很低，先不做复杂的合并逻辑。
- 同步目前是"打开 App / 窗口重新聚焦 / 每 60 秒"轮询拉取一次，不是真正的实时推送。如果以后想要"一台设备改了，另一台立刻看到"，可以把后端从 KV 换成 Cloudflare Durable Objects + WebSocket，这个可以之后再迭代。
