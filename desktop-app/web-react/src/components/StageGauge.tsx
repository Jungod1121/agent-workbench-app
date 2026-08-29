import type { Stage } from '@/lib/api/types';
import { STAGES, stageIndex } from '@/lib/api/types';

interface StageGaugeProps {
  stage: Stage;
  paused?: boolean;
  className?: string;
}

/** 四段阶段彩色条（进度语义）：所处阶段之前满色，所处阶段满色+光晕，未到淡显 */
export function StageGauge({ stage, paused = false, className = '' }: StageGaugeProps) {
  const idx = stageIndex(stage);
  return (
    <div className={`gauge ${className}`} aria-hidden="true">
      {STAGES.map((st, i) => {
        const isCurrent = !paused && i === idx;
        const dotLit = !paused && idx >= 0 && i <= idx;
        const lineLit = !paused && idx >= 0 && i < idx;
        return (
          <span key={st.key} style={{ display: 'contents' }}>
            <span
              className={[
                'gauge-dot',
                `s-${st.key}`,
                dotLit ? '' : 'dim',
                isCurrent ? 'current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            {i < STAGES.length - 1 && (
              <span
                className={['gauge-line', `s-${st.key}`, lineLit ? '' : 'dim']
                  .filter(Boolean)
                  .join(' ')}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export function StageBadge({ stage, paused = false }: { stage: Stage; paused?: boolean }) {
  const st = STAGES.find((s) => s.key === stage);
  return (
    <span className={`stage-badge s-${stage}`}>
      {st ? st.key : stage}
      {paused ? ' · paused' : ''}
    </span>
  );
}
