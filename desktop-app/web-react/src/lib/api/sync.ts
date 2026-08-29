import type { Project } from './types';

export interface SyncSettings {
  url: string;
  token: string;
}

const SYNC_KEY = 'workbench-sync-react';
const SYNC_STATE_KEY = 'workbench-sync-state-react';

export interface SyncState {
  dirty: boolean;
  lastSyncedAt: string | null;
  lastLocalAt: string | null;
}

export function loadSyncSettings(): SyncSettings | null {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null') as SyncSettings | null;
    return s && s.url && s.token ? s : null;
  } catch {
    return null;
  }
}

export function saveSyncSettings(s: SyncSettings | null): void {
  if (s) localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  else localStorage.removeItem(SYNC_KEY);
}

export function loadSyncState(): SyncState {
  try {
    return (
      (JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null') as SyncState) || {
        dirty: false,
        lastSyncedAt: null,
        lastLocalAt: null,
      }
    );
  } catch {
    return { dirty: false, lastSyncedAt: null, lastLocalAt: null };
  }
}

export function saveSyncState(s: SyncState): void {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(s));
}

export async function apiGet(
  url: string,
  token: string,
): Promise<{ projects: Project[]; updatedAt: string | null }> {
  const r = await fetch(url.replace(/\/+$/, '') + '/api/state', {
    headers: { 'X-Sync-Token': token },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function apiPut(url: string, token: string, projects: Project[]): Promise<{ updatedAt: string | null }> {
  const r = await fetch(url.replace(/\/+$/, '') + '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token },
    body: JSON.stringify({ projects }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}