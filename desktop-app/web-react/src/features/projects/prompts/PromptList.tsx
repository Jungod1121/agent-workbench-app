import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Prompt, Project } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { PromptForm, newPrompt } from './PromptForm';
import { PromptDiffBar } from './PromptDiffBar';

interface PromptListProps {
  project: Project;
  onChange: (prompts: Prompt[]) => void;
}

/** Prompt 版本管理：列表 + 添加 + 对比 + 回滚（回滚 = 以旧版内容生成新版本） */
export function PromptList({ project, onChange }: PromptListProps) {
  const { t } = useTranslation();
  const prompts = project.prompts || [];
  const [adding, setAdding] = useState(false);
  const [diffPair, setDiffPair] = useState<{ old: Prompt; cur: Prompt } | null>(null);

  const addPrompt = (title: string, content: string) => {
    onChange([...prompts, newPrompt(title, content, prompts)]);
    setAdding(false);
  };

  const rollback = (target: Prompt) => {
    if (!window.confirm(t('detail.rollbackConfirm'))) return;
    const v = prompts.reduce((m, p) => Math.max(m, p.version ?? 1), 0);
    onChange([
      ...prompts,
      {
        id: `pr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        title: `${t('detail.rollback')} ${target.title}`,
        content: target.content,
        version: v + 1,
        isCurrent: true,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const current = prompts[prompts.length - 1];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {t('detail.prompts')} · {prompts.length}
        </h3>
        <Button variant="secondary" style={{ minHeight: 32, fontSize: 12, padding: '6px 10px' }} onClick={() => setAdding((v) => !v)}>
          {t('detail.addPrompt')}
        </Button>
      </div>

      {adding && <PromptForm onSave={addPrompt} onCancel={() => setAdding(false)} />}

      {diffPair && current && (
        <PromptDiffBar
          oldText={diffPair.old.content}
          newText={diffPair.cur.content}
          oldLabel={`${t('prompt.vPrefix')}${diffPair.old.version} · ${diffPair.old.title}`}
          newLabel={`${t('prompt.vPrefix')}${diffPair.cur.version} · ${diffPair.cur.title}`}
        />
      )}

      <div>
        {prompts.length === 0 && (
          <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: 0 }}>{t('prompt.noDiff')}</p>
        )}
        {[...prompts].reverse().map((p, ri) => {
          const isCurrent = prompts.indexOf(p) === prompts.length - 1;
          return (
            <div key={p.id} className="prompt-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>
                  {t('prompt.vPrefix')}
                  {p.version} · {p.title}
                </b>
                {isCurrent && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#059669', background: '#d1fae5', padding: '2px 6px', borderRadius: 6 }}>
                    {t('detail.current')}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  {!isCurrent && (
                    <>
                      {current && (
                        <Button
                          variant="ghost"
                          style={{ minHeight: 26, fontSize: 11, padding: '4px 8px' }}
                          onClick={() => setDiffPair({ old: p, cur: current })}
                        >
                          {t('prompt.diff')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        style={{ minHeight: 26, fontSize: 11, padding: '4px 8px' }}
                        onClick={() => rollback(p)}
                      >
                        {t('detail.rollback')}
                      </Button>
                    </>
                  )}
                </span>
              </div>
              <pre>{p.content}</pre>
              {diffPair && diffPair.old.id === p.id && (
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                  {t('prompt.diff')}: {t('prompt.vPrefix')}
                  {p.version} {t('prompt.vs')} {t('prompt.vPrefix')}
                  {diffPair.cur.version}
                </div>
              )}
              {ri === prompts.length - 1 && <span style={{ display: 'none' }}>{t('detail.current')}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
