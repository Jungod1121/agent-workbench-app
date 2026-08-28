#!/bin/bash
# 一键替换图标脚本：把任意 1024x1024 PNG 转成 Tauri 所需全格式
set -e
if [ $# -lt 1 ]; then
  echo "用法: ./replace-icon.sh /path/to/new-icon.png"
  echo "示例: ./replace-icon.sh ~/Downloads/my-icon.png"
  exit 1
fi
INPUT="$1"
if [ ! -f "$INPUT" ]; then
  echo "文件不存在: $INPUT"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICON_DIR="$SCRIPT_DIR/src-tauri/icons"
echo "→ 复制原图到 $ICON_DIR/icon.png"
cp "$INPUT" "$ICON_DIR/icon.png"
echo "→ 生成 PNG 变体 (sips)"
sips -z 32 32 "$ICON_DIR/icon.png" --out "$ICON_DIR/32x32.png" >/dev/null
sips -z 128 128 "$ICON_DIR/icon.png" --out "$ICON_DIR/128x128.png" >/dev/null
sips -z 256 256 "$ICON_DIR/icon.png" --out "$ICON_DIR/128x128@2x.png" >/dev/null
echo "→ 生成 icns (iconutil)"
rm -rf /tmp/iconset.iconset
mkdir -p /tmp/iconset.iconset
sips -z 16 16     "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_16x16.png >/dev/null 2>&1
sips -z 32 32     "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_16x16@2x.png >/dev/null 2>&1
sips -z 32 32     "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_32x32.png >/dev/null 2>&1
sips -z 64 64     "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_32x32@2x.png >/dev/null 2>&1
sips -z 128 128   "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_128x128.png >/dev/null 2>&1
sips -z 256 256   "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_128x128@2x.png >/dev/null 2>&1
sips -z 256 256   "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_256x256.png >/dev/null 2>&1
sips -z 512 512   "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_256x256@2x.png >/dev/null 2>&1
sips -z 512 512   "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_512x512.png >/dev/null 2>&1
sips -z 1024 1024 "$ICON_DIR/icon.png" --out /tmp/iconset.iconset/icon_512x512@2x.png >/dev/null 2>&1
iconutil -c icns /tmp/iconset.iconset -o "$ICON_DIR/icon.icns"
rm -rf /tmp/iconset.iconset
echo "→ 生成 ico (Pillow)"
python3 -c "
from PIL import Image
im = Image.open('$ICON_DIR/icon.png')
im.save('$ICON_DIR/icon.ico', sizes=[(256,256),(128,128),(64,64),(32,32),(16,16)])
print('  ico done')
" 2>&1 | sed 's/^/  /'
echo "✓ 完成:"
ls -lh "$ICON_DIR/"
echo "下一步: git add src-tauri/icons && git commit -m 'chore: update icon' && git push"
