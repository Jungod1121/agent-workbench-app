import { invoke } from '@tauri-apps/api/core';
import type { Project } from './types';

export const getProjects = () => invoke<Project[]>('get_projects');
export const saveProjects = (projects: Project[]) =>
  invoke<void>('save_projects', { projects });
