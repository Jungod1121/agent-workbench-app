import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Prompt } from '@/lib/api/types';

interface PromptFormProps {
  onSave: (title: string, content: string) => void;
  onCancel: () => void;
}

/** 添加 Prompt 版本表单 */
export function PromptForm({ onSave, onCancel }: PromptFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  return (
    <div className="prompt-card">
      <div className="field">
        <label>{t('prompt.title')}</label>
        <input type="text" value={title} placeholder={t('prompt.titlePh')} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>{t('prompt.content')}</label>
        <textarea rows={5} value={content} placeholder={t('prompt.contentPh')} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="primary"
          style={{ flex: 1 }}
          onClick={() => {
            if (!content.trim()) return;
            onSave(title.trim() || t('prompt.vPrefix') + '?', content);
          }}
        >
          {t('prompt.save')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('prompt.cancel')}
        </Button>
      </div>
    </div>
  );
}

export function newPrompt(title: string, content: string, prev?: Prompt[]): Prompt {
  const maxV = (prev ?? []).reduce((m, p) => Math.max(m, p.version ?? 1), 0);
  return {
    id: `pr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title,
    content,
    version: maxV + 1,
    isCurrent: true,
    createdAt: new Date().toISOString(),
  };
}
