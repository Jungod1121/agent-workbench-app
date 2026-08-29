import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/lib/api/types';

export interface FilterChip {
  key: string;
  label: string;
  color?: string;
}

/** 阶段筛选 pills 数据（全部/四阶段/暂停），带彩色圆点 */
export function useStageChips(): FilterChip[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { key: 'all', label: t('stage.all') },
      { key: 'idea', label: t('stage.idea'), color: '#d97706' },
      { key: 'building', label: t('stage.building'), color: '#2563eb' },
      { key: 'testing', label: t('stage.testing'), color: '#7c3aed' },
      { key: 'live', label: t('stage.live'), color: '#059669' },
      { key: 'paused', label: t('stage.paused'), color: '#86868b' },
    ],
    [t],
  );
}

export interface FilterState {
  filterStage: string;
  search: string;
}

/** 过滤 + 搜索（名称/简介/标签/分类/阶段名/Prompt 标题与正文） */
export function useFilteredProjects(projects: Project[] | null, { filterStage, search }: FilterState): Project[] {
  const { t } = useTranslation();
  return useMemo(() => {
    const list = projects ?? [];
    const q = search.trim().toLowerCase();
    return list
      .filter((p) => {
        if (filterStage === 'all') return true;
        if (filterStage === 'paused') return !!p.paused;
        return p.stage === filterStage;
      })
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.tags || []).some((tg) => tg.toLowerCase().includes(q)) ||
          (p.category || '').toLowerCase().includes(q) ||
          t('stage.' + p.stage).toLowerCase().includes(q) ||
          (p.prompts || []).some(
            (pr) => pr.title.toLowerCase().includes(q) || pr.content.toLowerCase().includes(q),
          )
        );
      })
      .sort(
        (a, b) =>
          (a.sort_index || 0) - (b.sort_index || 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [projects, filterStage, search, t]);
}
