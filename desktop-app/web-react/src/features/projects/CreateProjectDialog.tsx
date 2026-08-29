import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project, Stage } from '@/lib/api/types';
import { STAGES } from '@/lib/api/types';
import { Button } from '@/components/ui/button';

const CATEGORIES = ['general', 'work', 'personal', 'research', 'product', 'finance'] as const;

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
  const [category, setCategory] = useState<string>('general');
  const [icon, setIcon] = useState('');
  const [iconColor, setIconColor] = useState('#0A84FF');
  const [tags, setTags] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setDesc('');
      setStage('idea');
      setCategory('general');
      setIcon('');
      setIconColor('#0A84FF');
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
      category,
      icon: icon.trim() || null,
      icon_color: iconColor || null,
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
        <div className="field-grid-2" style={{ marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('create.stage')}</label>
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {t('stage.' + s.key)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('create.category')}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t('category.' + c)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-grid-2" style={{ marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('create.icon')}</label>
            <input type="text" value={icon} placeholder={t('create.iconPh')} onChange={(e) => setIcon(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('create.iconColor')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="color"
                value={iconColor}
                onChange={(e) => setIconColor(e.target.value)}
                style={{ width: 48, height: 36, padding: 2, flexShrink: 0, border: '1px solid hsl(var(--input))', borderRadius: 8, background: 'hsl(var(--background))' }}
              />
              <input type="text" value={iconColor} onChange={(e) => setIconColor(e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>
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
