import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project, Stage } from '@/lib/api/types';
import { STAGES } from '@/lib/api/types';
import { Button } from '@/components/ui/button';

interface CreateProjectDialogProps {
  open: boolean;
  nextSortIndex: number;
  onCreate: (p: Project) => void;
  onClose: () => void;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 新建项目弹窗（全字段 + i18n） */
export function CreateProjectDialog({ open, nextSortIndex, onCreate, onClose }: CreateProjectDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [stage, setStage] = useState<Stage>('idea');
  const [tags, setTags] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setDesc('');
      setStage('idea');
      setTags('');
      setErr('');
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr(t('create.errName'));
      return;
    }
    const now = new Date().toISOString();
    const p: Project = {
      id: uid('p'),
      name: trimmed,
      description: desc.trim(),
      stage,
      paused: false,
      category: 'general',
      icon: null,
      icon_color: null,
      tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      sort_index: nextSortIndex,
      prompts: [],
      createdAt: now,
      updatedAt: now,
    };
    onCreate(p);
  };

  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-label={t('create.title')}>
        <h2>{t('create.title')}</h2>
        <div className="field">
          <label>{t('create.name')}</label>
          <input type="text" value={name} placeholder={t('create.namePh')} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>{t('create.desc')}</label>
          <textarea rows={3} value={desc} placeholder={t('create.descPh')} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('create.stage')}</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {t('stage.' + s.key)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('create.tags')}</label>
          <input type="text" value={tags} placeholder={t('create.tagsPh')} onChange={(e) => setTags(e.target.value)} />
        </div>
        {err && (
          <p style={{ fontSize: 12, color: 'hsl(var(--destructive))', margin: '0 0 8px' }}>{err}</p>
        )}
        <Button variant="primary" style={{ width: '100%', marginTop: 6 }} onClick={submit}>
          {t('create.submit')}
        </Button>
      </div>
    </div>
  );
}

export { uid };
