export type Stage = 'idea' | 'building' | 'testing' | 'live';

export interface Prompt {
  id: string;
  title: string;
  content: string;
  version: number;
  notes?: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  stage: Stage;
  paused: boolean;
  category: string;
  icon?: string | null;
  icon_color?: string | null;
  tags: string[];
  sort_index: number;
  prompts: Prompt[];
  createdAt: string;
  updatedAt: string;
}

export const STAGES: { key: Stage; color: string; bg: string }[] = [
  { key: 'idea', color: '#d97706', bg: '#fef3c7' },
  { key: 'building', color: '#2563eb', bg: '#dbeafe' },
  { key: 'testing', color: '#7c3aed', bg: '#ede9fe' },
  { key: 'live', color: '#059669', bg: '#d1fae5' },
];

export function stageIndex(key: string): number {
  return STAGES.findIndex((s) => s.key === key);
}
