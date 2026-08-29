import { useTranslation } from 'react-i18next';

interface UsageBarProps {
  total: number;
  prompts: number;
  live: number;
}

/** 统计看板（T0 磨砂）：项目 / Prompts / 已上线 */
export function UsageBar({ total, prompts, live }: UsageBarProps) {
  const { t } = useTranslation();
  return (
    <div className="usage-bar">
      <div className="usage-stat"><b>{total}</b><br /><span>{t('usage.projects')}</span></div>
      <div className="usage-stat"><b>{prompts}</b><br /><span>{t('usage.prompts')}</span></div>
      <div className="usage-stat"><b>{live}</b><br /><span>{t('usage.live')}</span></div>
    </div>
  );
}