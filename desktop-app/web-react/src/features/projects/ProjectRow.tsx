import { useTranslation } from 'react-i18next';
import type { Project } from '@/lib/api/types';
import { StageGauge } from '@/components/StageGauge';
import { cn } from '@/lib/cn';

interface ProjectRowProps {
  project: Project;
  search: string;
  dragging?: boolean;
  overlay?: boolean;
  style?: React.CSSProperties;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dndHandleProps?: Record<string, unknown>;
  dndRef?: (el: HTMLElement | null) => void;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'hsl(48 96% 53% / 0.3)', padding: '0 2px', borderRadius: 2 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function ProjectRow({
  project: p,
  search,
  dragging,
  overlay,
  style,
  onOpen,
  onContextMenu,
  dndHandleProps,
  dndRef,
}: ProjectRowProps) {
  const { t } = useTranslation();
  const stageKey = p.stage;
  const stBg =
    { idea: 'var(--stage-idea-bg)', building: 'var(--stage-building-bg)', testing: 'var(--stage-testing-bg)', live: 'var(--stage-live-bg)' }[
      stageKey
    ] ?? 'hsl(var(--muted))';
  const stFg =
    { idea: 'var(--stage-idea)', building: 'var(--stage-building)', testing: 'var(--stage-testing)', live: 'var(--stage-live)' }[
      stageKey
    ] ?? 'hsl(var(--muted-foreground))';
  const letter = (p.icon || p.name[0] || 'P').toUpperCase();

  const rel = (() => {
    const diff = Date.now() - new Date(p.updatedAt).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('list.justNow');
    if (min < 60) return t('list.hoursAgo', { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('list.hoursAgo', { n: hr });
    return t('list.daysAgo', { n: Math.floor(hr / 24) });
  })();

  return (
    <div
      ref={dndRef}
      className={cn('list-row', dragging && 'opacity-40 border-dashed border-primary bg-primary/5', overlay && 'shadow-lg z-10')}
      style={style}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onContextMenu={onContextMenu}
      {...dndHandleProps}
    >
      <span
        aria-hidden="true"
        style={{ width: 14, color: 'hsl(var(--muted-foreground))', cursor: 'grab', fontSize: 12, lineHeight: 1, userSelect: 'none' }}
      >
        ⋮⋮
      </span>
      <span
        className="list-icon"
        style={{ background: p.icon_color || stBg, color: p.icon_color ? '#fff' : stFg, borderColor: p.icon_color || stBg }}
      >
        {letter}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="list-name">
          {highlight(p.name, search)}
          {p.category && p.category !== 'general' && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 9999,
                marginLeft: 6,
                background: 'hsl(var(--secondary))',
                color: 'hsl(var(--muted-foreground))',
                border: '1px solid hsl(var(--border))',
                verticalAlign: '1px',
              }}
            >
              {t('category.' + p.category, p.category)}
            </span>
          )}
        </div>
        <div className="list-desc">
          {highlight(p.description || '', search)}
          {(p.tags || []).slice(0, 3).map((tg) => (
            <span
              key={tg}
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: '2px 6px',
                borderRadius: 9999,
                marginLeft: 6,
                background: 'hsl(var(--secondary))',
                color: 'hsl(var(--secondary-foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              {tg}
            </span>
          ))}
        </div>
      </div>
      <StageGauge stage={p.stage} paused={p.paused} />
      <span className={`stage-badge s-${stageKey}`}>
        {t('stage.' + stageKey)}
        {p.paused ? ` · ${t('stage.paused')}` : ''}
      </span>
      <div className="list-meta">
        <span>{t('list.promptsCount', { n: (p.prompts || []).length })}</span>
        <span>{rel}</span>
      </div>
    </div>
  );
}
