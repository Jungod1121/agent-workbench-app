import { invoke } from '@tauri-apps/api/core';

/** 诊断探针：写入 Rust 日志（~/Library/.../logs/agent-workbench.log） */
export function rep(msg: string): void {
  try {
    invoke('report_frontend', { msg }).catch(() => {});
  } catch {
    /* 浏览器环境忽略 */
  }
}

/** 前端就绪握手：首帧渲染后调用，Rust 才 show 窗口（WKWebView 隐藏期渲染修复） */
export function signalReady(): void {
  invoke('frontend_ready')
    .then(() => {
      rep('[probe] frontend_ready ok');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 窗口可见后强制重绘一帧（rAF 在隐藏窗口下不跑，此刻必然可见）
        });
      });
    })
    .catch(() => {});
}

/** 兼容探针占位：阶段 3 组件迁移时逐个接入 */
export function tauriAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
