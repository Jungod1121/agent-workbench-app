import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project, Prompt } from '@/lib/api/types';
import { STAGES } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { PromptList } from './prompts/PromptList';

interface ProjectDetailDrawerProps {
  project: Project;
  onSave: (p: Project) => void;
  onDelete: (id: string) => void;
  onPromptsChange: (prompts: Prompt[]) => void;
  onClose: () => void;
}

/** 项目详情全屏抽屉：字段编辑 + Prompt 版本管理 */
export function ProjectDetailDrawer({ project: p, onSave, onDelete, onPromptsChange, onClose }: ProjectDetailDrawerProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(p.name);
  const [desc, setDesc] = useState(p.description);
  const [stage, setStage] = useState(p.stage);
  const [tags, setTags] = useState((p.tags || []).join(', '));
  const [paused, setPaused] = useState(!!p.paused);

  useEffect(() => {
    setName(p.name);
    setDesc(p.description);
    setStage(p.stage);
    setTags((p.tags || []).join(', '));
    setPaused(!!p.paused);
  }, [p.id, p.name, p.description, p.stage, p.category, p.icon, p.icon_color, p.tags, p.paused]);

  const save = () => {
    onSave({
      ...p,
      name: name.trim() || p.name,
      description: desc.trim(),
      stage,
      category: p.category,
      icon: p.icon,
      icon_color: p.icon_color,
      tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      paused,
      updatedAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay show" role="dialog" aria-label={t('detail.title')}>
      <div className="drawer">
        <div className="drawer-head" data-tauri-drag-region>
          <div className="drawer-head-inner" data-tauri-drag-region style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button className="btn-back" aria-label="back" onClick={onClose}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h2>{t('detail.title')}</h2>
            </div>
            <button className="drawer-close" aria-label="close" data-tauri-no-drag onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label>{t('detail.name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('detail.desc')}</label>
            <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('detail.stage')}</label>
            <select value={stage} onChange={(e) => setStage(e.target.value as Project['stage'])}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {t('stage.' + s.key)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('detail.tags')}</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: '2px 0 16px' }}>
            <input
              type="checkbox"
              id="d-paused"
              checked={paused}
              onChange={(e) => setPaused(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <label htmlFor="d-paused" style={{ margin: 0, fontSize: 12, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
              {t('detail.paused')}
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" style={{ flex: 1 }} onClick={save}>
              {t('detail.save')}
            </Button>
            <Button
              variant="secondary"
              style={{ color: 'hsl(var(--destructive))' }}
              onClick={() => {
                if (window.confirm(t('detail.confirmDelete'))) onDelete(p.id);
              }}
            >
              {t('detail.del')}
            </Button>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid hsl(var(--border))', margin: '20px 0' }} />
          <PromptList
            project={p}
            onChange={(prompts) => {
              onPromptsChange(prompts);
            }}
          />
        </div>
      </div>
    </div>
  );
}
