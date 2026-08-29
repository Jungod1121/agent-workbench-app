import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface DiffRow {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** 逐行 diff（纯函数，从旧版 simpleLineDiff 迁移） */
export function lineDiff(a: string, b: string): DiffRow[] {
  const al = a.split('\n');
  const bl = b.split('\n');
  const max = Math.max(al.length, bl.length);
  const out: DiffRow[] = [];
  for (let i = 0; i < max; i++) {
    const la = al[i] ?? '';
    const lb = bl[i] ?? '';
    if (la === lb) {
      out.push({ type: 'same', text: la });
    } else {
      if (la) out.push({ type: 'del', text: la });
      if (lb) out.push({ type: 'add', text: lb });
    }
  }
  return out;
}

interface PromptDiffBarProps {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}

/** 版本对比：左旧右新，红删绿增 */
export function PromptDiffBar({ oldText, newText, oldLabel, newLabel }: PromptDiffBarProps) {
  const { t } = useTranslation();
  const rows = useMemo(() => lineDiff(oldText, newText), [oldText, newText]);
  return (
    <div className="diff-grid">
      <div className="diff-col">
        <h4>{oldLabel}</h4>
        {rows
          .filter((r) => r.type !== 'add')
          .map((r, i) => (
            <div key={i} className={r.type === 'del' ? 'diff-minus' : 'diff-same'}>
              {r.type === 'del' ? `- ${r.text}` : r.text || ' '}
            </div>
          ))}
      </div>
      <div className="diff-col">
        <h4>{newLabel}</h4>
        {rows
          .filter((r) => r.type !== 'del')
          .map((r, i) => (
            <div key={i} className={r.type === 'add' ? 'diff-plus' : 'diff-same'}>
              {r.type === 'add' ? `+ ${r.text}` : r.text || ' '}
            </div>
          ))}
      </div>
      {rows.every((r) => r.type === 'same') && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          {t('prompt.noDiff')}
        </div>
      )}
    </div>
  );
}
