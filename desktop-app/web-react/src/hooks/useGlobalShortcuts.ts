import { useEffect } from 'react';

interface Handlers {
  onNew: () => void;
  onFocusSearch: () => void;
  onSettings: () => void;
  onEscape: () => void;
}

/** 全局快捷键：⌘/Ctrl+N 新建 · ⌘/Ctrl+K/F 聚焦搜索 · ⌘/Ctrl+, 设置 · Esc 关闭 */
export function useGlobalShortcuts({ onNew, onFocusSearch, onSettings, onEscape }: Handlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        onEscape();
        return;
      }
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'n') {
        e.preventDefault();
        onNew();
      } else if (k === 'k' || k === 'f') {
        e.preventDefault();
        onFocusSearch();
      } else if (e.key === ',') {
        e.preventDefault();
        onSettings();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onNew, onFocusSearch, onSettings, onEscape]);
}
