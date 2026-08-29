import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/api/types';
import {
  apiGet,
  apiPut,
  loadSyncSettings,
  loadSyncState,
  saveSyncSettings,
  saveSyncState,
  type SyncSettings,
  type SyncState,
} from '@/lib/api/sync';
import { rep } from '@/lib/tauri';

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline';

export interface ConflictInfo {
  remoteCount: number;
  localCount: number;
  remoteAt: string | null;
}

/** Cloudflare 同步状态机：GET/PUT /api/state + X-Sync-Token，冲突弹窗三选 */
export function useSync(projects: Project[] | null, persist: (p: Project[]) => void) {
  const [settings, setSettings] = useState<SyncSettings | null>(loadSyncSettings);
  const [state, setState] = useState<SyncState>(loadSyncState);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const applyState = useCallback((next: SyncState) => {
    setState(next);
    saveSyncState(next);
  }, []);

  /** 本地改动标记（persist 时调用） */
  const markDirty = useCallback(() => {
    applyState({ ...loadSyncState(), dirty: true, lastLocalAt: new Date().toISOString() });
  }, [applyState]);

  const push = useCallback(async (): Promise<boolean> => {
    const s = loadSyncSettings();
    if (!s) {
      setStatus('idle');
      return false;
    }
    const list = projectsRef.current ?? [];
    setStatus('syncing');
    try {
      const res = await apiPut(s.url, s.token, list);
      applyState({ dirty: false, lastSyncedAt: res.updatedAt ?? new Date().toISOString(), lastLocalAt: new Date().toISOString() });
      setStatus('ok');
      return true;
    } catch (e) {
      rep('[probe] sync push fail: ' + String(e));
      setStatus('offline');
      return false;
    }
  }, [applyState]);

  const pull = useCallback(
    async (silent: boolean): Promise<void> => {
      const s = loadSyncSettings();
      if (!s) {
        setStatus('idle');
        return;
      }
      setStatus('syncing');
      try {
        const data = await apiGet(s.url, s.token);
        const remoteAt = data.updatedAt ?? null;
        const st = loadSyncState();
        const isConflict = st.dirty === true && st.lastSyncedAt && remoteAt && remoteAt !== st.lastSyncedAt;
        if (isConflict) {
          setStatus('offline');
          setConflict({ remoteCount: (data.projects || []).length, localCount: (projectsRef.current ?? []).length, remoteAt });
          return;
        }
        persist(data.projects || []);
        applyState({ dirty: false, lastSyncedAt: remoteAt, lastLocalAt: new Date().toISOString() });
        setStatus('ok');
        if (!silent) rep('[probe] sync pulled');
      } catch (e) {
        rep('[probe] sync pull fail: ' + String(e));
        setStatus('offline');
      }
    },
    [applyState, persist],
  );

  const resolveConflict = useCallback(
    async (choice: 'remote' | 'local' | 'cancel') => {
      setConflict(null);
      if (choice === 'cancel') {
        setStatus('offline');
        return;
      }
      const s = loadSyncSettings();
      if (!s) return;
      if (choice === 'remote') {
        try {
          const data = await apiGet(s.url, s.token);
          persist(data.projects || []);
          applyState({ dirty: false, lastSyncedAt: data.updatedAt ?? new Date().toISOString(), lastLocalAt: new Date().toISOString() });
          setStatus('ok');
        } catch {
          setStatus('offline');
        }
      } else {
        await push();
      }
    },
    [applyState, persist, push],
  );

  const save = useCallback(
    (s: SyncSettings | null) => {
      setSettings(s);
      saveSyncSettings(s);
      if (s) {
        setStatus('syncing');
        void pull(true);
      } else {
        setStatus('idle');
      }
    },
    [pull],
  );

  // 60s 轮询 + 窗口聚焦拉取
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (loadSyncSettings() && projectsRef.current) void pull(true);
    }, 60000);
    const onFocus = () => {
      if (loadSyncSettings() && projectsRef.current) void pull(true);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [pull]);

  return { settings, state, status, conflict, markDirty, pull, push, save, resolveConflict };
}