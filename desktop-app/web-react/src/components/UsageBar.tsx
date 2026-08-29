import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '@/hooks/useSync';

interface UsageBarProps {
  total: number;
  prompts: number;
  live: number;
  syncStatus?: SyncStatus;
}

/** 统计看板（T0 磨砂）：项目 / Prompts / 已上线 + 同步状态点 */
export function UsageBar({ total, prompts, live, syncStatus = 'idle' }: UsageBarProps) {
  const { t } = useTranslation();
  const dot =
    syncStatus === 'syncing' ? '⟳' : syncStatus === 'offline' ? '○' : '●';
  const dotColor =
    syncStatus === 'ok' ? '#059669' : syncStatus === 'offline' ? '#d97706' : 'hsl(var(--muted-foreground))';
  return (
    <div className="usage-bar">
      <div className="usage-stat"><b>{total}</b><br /><span>{t('usage.projects')}</span></div>
      <div className="usage-stat"><b>{prompts}</b><br /><span>{t('usage.prompts')}</span></div>
      <div className="usage-stat"><b>{live}</b><br /><span>{t('usage.live')}</span></div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 12 }} title={t('settings.sync')}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', color: dotColor, fontSize: 11, display: 'grid', placeItems: 'center' }}>
          {dot}
        </span>
      </div>
    </div>
  );
}