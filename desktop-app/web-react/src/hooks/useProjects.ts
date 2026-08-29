import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProjects, saveProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/api/types';
import { projectsFromCache, projectsToCache } from '@/lib/query';
import { rep, tauriAvailable } from '@/lib/tauri';

const DEMO: Project[] = [
  {
    id: 'demo1', name: 'Agent Workbench', description: '三端桌面 App · Cloudflare 自动同步', stage: 'idea', paused: false,
    category: 'work', icon: null, icon_color: null, tags: ['Tauri'], sort_index: 0, prompts: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo2', name: 'Summary Agent', description: '会议纪要自动归档', stage: 'building', paused: false,
    category: 'work', icon: null, icon_color: null, tags: [], sort_index: 1, prompts: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo3', name: 'Landing Copilot', description: '落地页文案与转化优化', stage: 'live', paused: false,
    category: 'product', icon: null, icon_color: null, tags: [], sort_index: 2, prompts: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
];

async function loadProjects(): Promise<Project[]> {
  // ?demo 强制演示数据（视觉开发用），不受缓存影响
  if (new URLSearchParams(window.location.search).has('demo')) {
    return DEMO.map((p) => ({ ...p }));
  }
  if (!tauriAvailable()) {
    const cached = projectsFromCache();
    // dev 预览无数据时给 demo 行，便于视觉开发（不写入缓存）
    if (cached.length === 0 && import.meta.env.DEV) return DEMO.map((p) => ({ ...p }));
    return cached;
  }
  try {
    const p = await getProjects();
    projectsToCache(p);
    return p;
  } catch (e) {
    rep('[probe] get_projects fail, use cache: ' + String(e));
    return projectsFromCache();
  }
}

/** 项目数据层：IPC 优先，localStorage 兜底；persist 走乐观更新 */
export function useProjects() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['projects'], queryFn: loadProjects });

  const persist = useCallback(
    (next: Project[]) => {
      qc.setQueryData(['projects'], next);
      projectsToCache(next);
      if (tauriAvailable()) {
        saveProjects(next).catch((e) => rep('[probe] save_projects fail: ' + String(e)));
      }
    },
    [qc],
  );

  return {
    projects: query.data ?? null,
    isLoading: query.isLoading,
    persist,
  };
}
