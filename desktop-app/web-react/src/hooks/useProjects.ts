import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProjects, saveProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/api/types';
import { projectsFromCache, projectsToCache } from '@/lib/query';
import { rep, tauriAvailable } from '@/lib/tauri';

// 演示数据兜底（仅当 demo-projects.json 加载失败时使用）
const DEMO_FALLBACK: Project[] = [
  {
    id: 'demo1', name: '会议纪要 Agent', description: '录音转文字后自动生成结构化工单', stage: 'live', paused: false,
    category: 'work', icon: null, icon_color: null, tags: ['办公'], sort_index: 0, prompts: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo2', name: '文献综述 Agent', description: '论文检索聚类与综述大纲生成', stage: 'building', paused: false,
    category: 'research', icon: null, icon_color: null, tags: ['科研'], sort_index: 1, prompts: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo3', name: '打砖块小游戏', description: '纯 HTML/JS 经典打砖块', stage: 'testing', paused: false,
    category: 'personal', icon: null, icon_color: null, tags: ['游戏'], sort_index: 2, prompts: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
];

async function fetchDemoProjects(): Promise<Project[]> {
  try {
    const r = await fetch('demo-projects.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = (await r.json()) as { projects?: Project[] };
    if (Array.isArray(d.projects) && d.projects.length) return d.projects;
  } catch (e) {
    rep('[probe] demo json fetch fail: ' + String(e));
  }
  return DEMO_FALLBACK.map((p) => ({ ...p }));
}

async function loadProjects(): Promise<Project[]> {
  // ?demo 强制演示数据（展示/开发用），不受缓存影响
  if (new URLSearchParams(window.location.search).has('demo')) {
    return fetchDemoProjects();
  }
  if (!tauriAvailable()) {
    const cached = projectsFromCache();
    // dev 预览无数据时给演示数据，便于视觉开发（不写入缓存）
    if (cached.length === 0 && import.meta.env.DEV) return fetchDemoProjects();
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
