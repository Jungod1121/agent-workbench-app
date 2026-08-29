import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useLanguage } from '@/hooks/useLanguage';
import type { Theme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import type { SyncSettings } from '@/lib/api/sync';
import type { SyncStatus } from '@/hooks/useSync';
import { openExternal, tauriAvailable } from '@/lib/tauri';

interface BackupRow {
  id: string;
  created_at: string;
  size_bytes: number;
  note: string | null;
}

interface SettingsDrawerProps {
  theme: Theme;
  setTheme: (t: Theme) => void;
  syncSettings: SyncSettings | null;
  syncStatus: SyncStatus;
  onSyncSave: (s: SyncSettings | null) => void;
  onSyncTest: (url: string, token: string) => Promise<boolean>;
  onBackupNow: () => Promise<string | null>;
  onBackupRestore: (id: string) => Promise<boolean>;
  onBackupDelete: (id: string) => Promise<boolean>;
  onExport: () => Promise<void>;
  onImport: () => Promise<void>;
  onLoadDemo: () => Promise<void>;
  onClose: () => void;
}

function loadBackups(): Promise<BackupRow[]> {
  return tauriAvailable()
    ? invoke<BackupRow[]>('list_backups').catch(() => [])
    : Promise.resolve([]);
}

/** 设置抽屉：通用（语言/主题）· 同步（Worker 配置/备份/导入导出）· About */
export function SettingsDrawer(props: SettingsDrawerProps) {
  const { t } = useTranslation();
  const { lang, setLang, langs } = useLanguage();
  const [tab, setTab] = useState('general');
  const [url, setUrl] = useState(props.syncSettings?.url ?? '');
  const [token, setToken] = useState(props.syncSettings?.token ?? '');
  const [err, setErr] = useState('');
  const [backups, setBackups] = useState<BackupRow[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  const refreshBackups = () => {
    void loadBackups().then(setBackups);
  };
  useEffect(refreshBackups, [tab]);

  const save = async () => {
    const u = url.trim();
    const tk = token.trim();
    setErr('');
    if (!u && !tk) {
      props.onSyncSave(null);
      props.onClose();
      return;
    }
    if (!u || !tk) {
      setErr(t('settings.syncHint'));
      return;
    }
    props.onSyncSave({ url: u, token: tk });
  };

  const test = async () => {
    const ok = await props.onSyncTest(url.trim(), token.trim());
    setErr(ok ? t('settings.connOk') : t('settings.connFail', { msg: '' }));
  };

  return (
    <div className="overlay show" role="dialog" aria-label={t('settings.title')}>
      <div className="drawer">
        <div className="drawer-head" data-tauri-drag-region>
          <div className="drawer-head-inner" data-tauri-drag-region>
            <button className="btn-back" aria-label="back" onClick={props.onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h2>{t('settings.title')}</h2>
          </div>
        </div>
        <div className="drawer-body">
          <div
            className="settings-tabs"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 4,
              padding: 4,
              background: 'hsl(var(--muted))',
              borderRadius: 10,
              marginBottom: 20,
            }}
          >
            {[
              { key: 'general', label: t('settings.general') },
              { key: 'sync', label: t('settings.sync') },
              { key: 'about', label: t('settings.about') },
            ].map((tb) => (
              <button
                key={tb.key}
                className="settings-tab"
                style={{
                  minHeight: 34,
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 10px',
                  borderRadius: 7,
                  border: 0,
                  cursor: 'pointer',
                  opacity: tab === tb.key ? 1 : 0.6,
                  background: tab === tb.key ? 'hsl(var(--primary))' : 'transparent',
                  color: tab === tb.key ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  boxShadow: tab === tb.key ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
                }}
                onClick={() => setTab(tb.key)}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="settings-card" style={{ padding: 16, borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>{t('settings.lang')}</p>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px' }}>{t('app.lang')}</p>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {langs.map((l) => (
                    <Button
                      key={l.code}
                      variant={lang === l.code ? 'primary' : 'secondary'}
                      style={{ minWidth: 84, minHeight: 32, fontSize: 12, padding: '6px 10px' }}
                      onClick={() => setLang(l.code)}
                    >
                      {l.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="settings-card" style={{ padding: 16, borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>{t('settings.theme')}</p>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px' }}>{t('app.theme')}</p>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(
                    [
                      { code: 'light' as Theme, label: t('settings.themeLight') },
                      { code: 'dark' as Theme, label: t('settings.themeDark') },
                      { code: 'system' as Theme, label: t('settings.themeSystem') },
                    ]
                  ).map((th) => (
                    <Button
                      key={th.code}
                      variant={props.theme === th.code ? 'primary' : 'secondary'}
                      style={{ minWidth: 96, minHeight: 32, fontSize: 12, padding: '6px 10px' }}
                      onClick={() => props.setTheme(th.code)}
                    >
                      {th.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="settings-card" style={{ padding: 16, borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{t('settings.demoTitle')}</p>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', margin: '4px 0 12px' }}>{t('settings.demoDesc')}</p>
                <Button variant="secondary" style={{ minHeight: 32, fontSize: 12 }} onClick={() => void props.onLoadDemo()}>
                  {t('settings.demoLoad')}
                </Button>
              </div>
            </div>
          )}

          {tab === 'sync' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="settings-card" style={{ padding: 16, borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
                <div className="field">
                  <label>{t('settings.syncUrl')}</label>
                  <input type="text" value={url} placeholder={t('settings.syncUrlPh')} onChange={(e) => setUrl(e.target.value)} />
                </div>
                <div className="field">
                  <label>{t('settings.syncToken')}</label>
                  <input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
                </div>
                <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px' }}>{t('settings.syncHint')}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" style={{ flex: 1 }} onClick={save}>
                    {props.syncSettings ? t('settings.saveSync') : t('settings.enableSync')}
                  </Button>
                  <Button variant="secondary" onClick={test}>
                    {t('settings.testConn')}
                  </Button>
                </div>
                {props.syncSettings && (
                  <Button
                    variant="secondary"
                    style={{ width: '100%', marginTop: 10, color: 'hsl(var(--destructive))' }}
                    onClick={() => {
                      props.onSyncSave(null);
                      props.onClose();
                    }}
                  >
                    {t('settings.disconnect')}
                  </Button>
                )}
                {err && (
                  <p style={{ fontSize: 12, color: err.includes('✓') ? '#059669' : 'hsl(var(--destructive))', margin: '8px 0 0' }}>{err}</p>
                )}
              </div>

              <div className="settings-card" style={{ padding: 16, borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{t('settings.backup')}</p>
                  <Button variant="secondary" style={{ minHeight: 28, fontSize: 11, padding: '4px 8px' }} onClick={async () => {
                    const id = await props.onBackupNow();
                    if (id) refreshBackups();
                  }}>
                    {t('settings.backupNow')}
                  </Button>
                </div>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {backups.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: 0 }}>{t('settings.backupEmpty')}</p>
                  ) : (
                    backups.map((b) => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{b.id}</div>
                          <div style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {new Date(b.created_at).toLocaleString()} · {(b.size_bytes / 1024).toFixed(1)}KB
                          </div>
                        </div>
                        <Button variant="ghost" style={{ minHeight: 26, fontSize: 11, padding: '4px 8px' }} onClick={async () => {
                          const ok = await props.onBackupRestore(b.id);
                          if (ok) refreshBackups();
                        }}>
                          {t('settings.restore')}
                        </Button>
                        <Button variant="ghost" style={{ minHeight: 26, fontSize: 11, padding: '4px 8px', color: 'hsl(var(--destructive))' }} onClick={async () => {
                          await props.onBackupDelete(b.id);
                          refreshBackups();
                        }}>
                          {t('settings.delete')}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Button variant="secondary" style={{ flex: 1, minHeight: 32, fontSize: 12 }} onClick={() => void props.onExport()}>
                    {t('settings.export')}
                  </Button>
                  <Button variant="secondary" style={{ flex: 1, minHeight: 32, fontSize: 12 }} onClick={() => void props.onImport()}>
                    {t('settings.import')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === 'about' && (
            <div className="settings-card" style={{ padding: 16, borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Agent Workbench v2.0.0</p>
              <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: '4px 0 12px' }}>
                管理 AI Agent 设计项目、储存与迭代 Prompt 的工作台。本地优先 + Cloudflare 同步。
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" style={{ minHeight: 32, fontSize: 12 }} onClick={() => void openExternal('https://github.com/Jungod1121/agent-workbench-app').catch(() => {})}>
                  GitHub
                </Button>
                <Button variant="secondary" style={{ minHeight: 32, fontSize: 12 }} onClick={() => void openExternal('https://jungod1121.github.io/agent-workbench-app/').catch(() => {})}>
                  {t('app.title')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}