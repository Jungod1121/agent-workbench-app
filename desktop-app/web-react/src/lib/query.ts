import { QueryClient } from '@tanstack/react-query';
import type { Project } from './api/types';

export const queryClient = new QueryClient();

const CACHE_KEY = 'workbench-react-cache';

export function projectsFromCache(): Project[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { projects?: Project[] };
    return Array.isArray(parsed.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

export function projectsToCache(projects: Project[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ projects, cachedAt: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}
