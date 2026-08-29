import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface ConflictDialogProps {
  remoteCount: number;
  localCount: number;
  remoteAt: string | null;
  onChoice: (choice: 'remote' | 'local' | 'cancel') => void;
}

/** 同步冲突弹窗：使用云端覆盖 / 保留本地并推送 / 取消（任一操作前会先安全备份） */
export function ConflictDialog({ remoteCount, localCount, remoteAt, onChoice }: ConflictDialogProps) {
  const { t } = useTranslation();
  return (
    <div className="modal-mask" style={{ zIndex: 70 }}>
      <div className="modal" role="alertdialog" style={{ width: 480 }}>
        <h2>{t('sync.conflictTitle')}</h2>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.7,
            color: 'hsl(var(--destructive))',
            background: 'hsl(var(--destructive) / 0.08)',
            border: '1px solid hsl(var(--destructive) / 0.2)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          {t('sync.conflictDesc', {
            local: localCount,
            remote: remoteCount,
            at: remoteAt ? new Date(remoteAt).toLocaleString() : t('sync.unknown'),
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="primary" onClick={() => onChoice('remote')}>
            {t('sync.useRemote')}
          </Button>
          <Button variant="secondary" onClick={() => onChoice('local')}>
            {t('sync.keepLocal')}
          </Button>
          <Button variant="secondary" onClick={() => onChoice('cancel')}>
            {t('sync.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}