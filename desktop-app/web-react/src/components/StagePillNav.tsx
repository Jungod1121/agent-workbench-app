import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

interface StagePillNavProps {
  chips: { key: string; label: string; color?: string }[];
  value: string;
  onChange: (key: string) => void;
  counts?: Record<string, number>;
}

const MIN_ITEM = 88;

/** 阶段筛选分段条（CC AppSwitcher 思路）：宽度不足时溢出收纳进 ⋯ 弹出层 */
export function StagePillNav({ chips, value, onChange, counts }: StagePillNavProps) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(chips.length);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const compute = () => {
      const available = wrap.parentElement?.clientWidth ?? wrap.clientWidth;
      const itemW = MIN_ITEM;
      const gap = 4;
      const pad = 8;
      const widthAll = pad + chips.length * itemW + (chips.length - 1) * gap;
      let next = chips.length;
      if (widthAll > available) {
        const fit = Math.floor((available - pad - 34) / (itemW + gap));
        next = Math.max(1, Math.min(chips.length - 1, fit));
      }
      setVisibleCount((prev) => (prev === next ? prev : next));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (wrap.parentElement) ro.observe(wrap.parentElement);
    return () => ro.disconnect();
  }, [chips.length]);

  const visible = chips.slice(0, visibleCount);
  const overflow = chips.slice(visibleCount);
  const activeInOverflow = overflow.some((c) => c.key === value);

  const renderPill = (c: { key: string; label: string; color?: string }) => (
    <button
      key={c.key}
      className={cn(
        'stage-pill-item',
        value === c.key && 'active',
      )}
      onClick={() => onChange(c.key)}
    >
      {c.color && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: c.color,
            display: 'inline-block',
            flexShrink: 0,
            boxShadow: value === c.key ? `0 0 0 2px ${c.color}33` : undefined,
          }}
        />
      )}
      {c.label}
      {counts?.[c.key] !== undefined && (
        <span style={{ opacity: 0.55, fontSize: 11 }}>{counts[c.key]}</span>
      )}
    </button>
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
      <div className="stage-pill">
        {visible.map(renderPill)}
        {overflow.length > 0 && (
          <button
            className="stage-pill-item"
            aria-label={t('stage.all')}
            onClick={(e) => {
              e.stopPropagation();
              const pop = (e.currentTarget.nextSibling as HTMLElement) ?? null;
              pop?.classList.toggle('hidden');
            }}
          >
            ⋯{activeInOverflow ? ' •' : ''}
          </button>
        )}
      </div>
      {overflow.length > 0 && (
        <div
          className="hidden"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: 180,
            padding: 6,
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {overflow.map(renderPill)}
        </div>
      )}
    </div>
  );
}
