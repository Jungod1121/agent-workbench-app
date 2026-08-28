# Agent Workbench · 图标生成提示词

## 推荐方案：苹果官方风格 Workbench + AI 星芒

> 直接复制下面**英文提示词**发给 GPT / Midjourney / FLUX，生成 1024×1024 后按 README 替换即可。

### 提示词 A — 主推荐（macOS Sonoma / iOS 18 风格，最贴合产品名）

**英文 (直接粘贴给 GPT):**
```
App icon for "Agent Workbench", Apple macOS Sonoma style, centered on a soft light gray-beige background, squircle shape with continuous corners, subtle inner shadow and soft drop shadow, top lighting. In the center: a minimalist wooden workbench seen from isometric top-down view, with 3 layered project cards floating slightly above it, each card has a subtle grid and a small colorful status dot (amber, blue, green), and a glowing AI sparkle star at the top-right corner of the top card. Clean, minimal, premium, no text, no letters, no wordmark, geometric, vector-like, ultra sharp, 1024x1024, centered composition occupying 65% of canvas, studio lighting, matte material with slight gloss
Negative: text, letters, words, watermark, noisy background, photorealistic wood texture, clutter, dark background
```

**中文解释:**
苹果 macOS 风格的 App 图标，浅灰米色背景，圆角矩形（squircle），顶部打光，轻微内阴影和外阴影。中央是一个极简的等轴测工作台，上面悬浮着三张层叠的项目卡片，每张带网格和彩色状态点（琥珀蓝绿），顶层卡片右上角有一颗发光的 AI 星芒。干净、高级、无文字、占画布65%、磨砂微光泽材质。

---

### 提示词 B — 备选：层叠窗口 + Prompt 符号

```
Minimalist app icon, Apple Human Interface Guidelines style, light paper texture background #EEF0EA, squircle app icon shape, soft gradient, centered. A stack of 3 rounded windows/cards in perspective, the top card shows a monospace text block symbol (three horizontal lines with a cursor), a small purple AI diamond sparkle above. Color palette: slate #24313F, warm amber, soft blue. Ultra clean, no text, no alphabet, flat with subtle depth, premium productivity app icon, 1024x1024, centered
Negative: text, letters, 3D render, wood, clutter, dark mode
```

### 提示词 C — 备选：抽象神经工作台（更 AI 感）

```
App icon, Apple Liquid Glass style (iOS 18), translucent frosted glass squircle on light background, centered abstract icon: a stylized letter "A" formed by connected neural network nodes and lines, sitting on a tiny workbench platform with subtle grid. Colors: deep slate and warm amber accent. Minimalist, geometric, glowing nodes, soft blur, premium, no text, 1024x1024
Negative: text, letters, watermark, realistic, noisy
```

---

## 给 GPT 的附加指令（粘贴在提示词后面）

```
Requirements: 1:1 square, 1024x1024, app icon, no text at all, no letters inside, centered, Apple HIG compliant, export as PNG with transparent or light background, high resolution, sharp edges
```

## 生成后怎么用

1. 让 GPT 生成 1024×1024 PNG，选最简洁的一张下载为 `icon.png`
2. 替换并自动生成全尺寸：
```bash
cd /Users/jungod/Projects/agent-workbench-app/desktop-app
npx @tauri-apps/cli icon /path/to/your-new-icon.png
# 或手动：
cp /path/to/new-icon.png src-tauri/icons/icon.png
# 本项目已配置脚本：
sips -z 32 32 icon.png --out src-tauri/icons/32x32.png
sips -z 128 128 icon.png --out src-tauri/icons/128x128.png
sips -z 256 256 icon.png --out src-tauri/icons/128x128@2x.png
# icns/ico 会用 iconutil + Pillow 自动生成
```
3. 重新提交：
```bash
git add src-tauri/icons/
git commit -m "chore: update app icon"
git push
```

## 苹果图标风格要点（已融入提示词）

- **形状**: 不是正方形，是 squircle 连续圆角，图标占画布 60-70%
- **光照**: 顶部光源，轻微内发光 + 柔和外阴影，有厚度感但不重
- **材质**: 磨砂/微光泽/液态玻璃，避免重纹理木材
- **构图**: 单一居中主体，极简，3个以内元素，无文字
- **配色**: 本项目原色 #24313F (slate) + 琥珀/蓝/紫 点缀，背景 #EEF0EA 纸纹
