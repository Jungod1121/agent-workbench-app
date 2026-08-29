import { useTranslation } from 'react-i18next';

interface UsageBarProps {
  total: number;
  prompts: number;
  live: number;
}

/** 统计看板（T0 磨砂）+ 阶段调色盘自检点 */
export function UsageBar({ total, prompts, live }: UsageBarProps) {
  const { t } = useTranslation();
  return (
    <div className="usage-bar">
      <div className="usage-stat"><b>{total}</b><br /><span>{t('usage.projects')}</span></div>
      <div className="usage-stat"><b>{prompts}</b><br /><span>{t('usage.prompts')}</span></div>
      <div className="usage-stat"><b>{live}</b><br /><span>{t('usage.live')}</span></div>
      <div className="usage-stat"><b>○</b><br /><span>{t('usage.proxy')}</span></div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 12 }}>
        {['#d97706', '#2563eb', '#7c3aed', '#059669'].map((c) => (
          <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
        ))}
        <em style={{ fontStyle: 'normal', fontSize: 10, color: 'hsl(var(--muted-foreground))', marginLeft: 4 }}>
          v0.2.0-react
        </em>
      </div>
    </div>
  );
}
