import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { signalReady, rep, tauriAvailable, openExternal } from '@/lib/tauri';
import { useProjects, fetchDemoProjects } from '@/hooks/useProjects';
import { useFilteredProjects, useStageChips } from '@/hooks/useFilteredProjects';
import { usePagination } from '@/hooks/usePagination';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useTheme } from '@/hooks/useTheme';
import { useSync } from '@/hooks/useSync';
import { useWindowBlurDim } from '@/hooks/useWindowBlurDim';
import { apiGet } from '@/lib/api/sync';
import { StagePillNav } from '@/components/StagePillNav';
import { ContextMenu } from '@/components/ContextMenu';
import { Button } from '@/components/ui/button';
import { ProjectList } from '@/features/projects/ProjectList';
import { CreateProjectDialog, uid } from '@/features/projects/CreateProjectDialog';
import { ProjectDetailDrawer } from '@/features/projects/ProjectDetailDrawer';
import { SettingsDrawer } from '@/features/settings/SettingsDrawer';
import { ConflictDialog } from '@/features/sync/ConflictDialog';
import type { Project, Prompt } from '@/lib/api/types';
import { STAGES } from '@/lib/api/types';

export default function App() {
  const { t } = useTranslation();
  const { projects, persist } = useProjects();
  const { theme, setTheme } = useTheme();
  const sync = useSync(projects, persist);
  useWindowBlurDim();

  const [filterStage, setFilterStage] = useState('all');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null);
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const chips = useStageChips();
  const filtered = useFilteredProjects(projects, { filterStage, search });
  const { page, totalPages, pageSize, paged, setPage, setPageSize } = usePagination(filtered, 10);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    rep('[probe] react boot tauri=' + tauriAvailable());
    signalReady();
  }, []);

  const detail = useMemo(() => (projects ?? []).find((p) => p.id === detailId) ?? null, [projects, detailId]);

  const counts = useMemo(() => {
    const list = projects ?? [];
    const c: Record<string, number> = { all: list.length, paused: list.filter((p) => p.paused).length };
    for (const s of STAGES) c[s.key] = list.filter((p) => p.stage === s.key).length;
    return c;
  }, [projects]);

  const nextSortIndex = useMemo(() => Math.max(0, ...(projects ?? []).map((p) => p.sort_index || 0)) + 1, [projects]);

  // 本地改动 → 标记同步 dirty
  const persistAndDirty = useCallback(
    (next: Project[]) => {
      persist(next);
      sync.markDirty();
    },
    [persist, sync],
  );

  const actions = useMemo(
    () => ({
      create: (p: Project) => {
        persistAndDirty([...(projects ?? []), p]);
        setCreateOpen(false);
        showToast(t('create.created'));
      },
      save: (p: Project) => {
        persistAndDirty((projects ?? []).map((x) => (x.id === p.id ? p : x)));
        showToast(t('detail.saved'));
      },
      delete: (id: string) => {
        persistAndDirty((projects ?? []).filter((x) => x.id !== id));
        setDetailId((cur) => (cur === id ? null : cur));
        showToast(t('detail.deleted'));
      },
      duplicate: (id: string) => {
        const src = (projects ?? []).find((x) => x.id === id);
        if (!src) return;
        const now = new Date().toISOString();
        const copy: Project = {
          ...JSON.parse(JSON.stringify(src)),
          id: uid('p'),
          name: src.name + ' ←copy',
          createdAt: now,
          updatedAt: now,
          sort_index: (src.sort_index || 0) + 0.5,
          prompts: (src.prompts || []).map((pr) => ({ ...pr, id: uid('pr') })),
        };
        persistAndDirty([...(projects ?? []), copy]);
        showToast(t('create.duplicated'));
      },
      reorder: (ordered: Project[]) => {
        const orderedIds = new Set(ordered.map((p) => p.id));
        const rest = (projects ?? []).filter((p) => !orderedIds.has(p.id));
        const next = [...ordered, ...rest].map((p, i) => ({ ...p, sort_index: i, updatedAt: p.updatedAt }));
        persistAndDirty(next);
      },
      promptsChange: (id: string, prompts: Prompt[]) => {
        persistAndDirty((projects ?? []).map((x) => (x.id === id ? { ...x, prompts, updatedAt: new Date().toISOString() } : x)));
      },
    }),
    [projects, persistAndDirty, showToast, t],
  );

  useGlobalShortcuts({
    onNew: () => setCreateOpen(true),
    onFocusSearch: () => searchRef.current?.focus(),
    onSettings: () => setSettingsOpen(true),
    onEscape: () => {
      setCtx(null);
      setDetailId(null);
      setCreateOpen(false);
      setSettingsOpen(false);
    },
  });

  return (
    <>
      <div className="drag-bar" data-tauri-drag-region />
      <div className="app-shell main-bg">
        {/* 顶部悬浮岛（fixed，不随滚动） */}
        <header className="topbar-island" data-tauri-drag-region>
          <span
            className="brand-title"
            data-tauri-no-drag
            role="link"
            tabIndex={0}
            title={t('app.title')}
            onClick={() => {
              void openExternal('https://jungod1121.github.io/agent-workbench-app/').catch(() => {});
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                void openExternal('https://jungod1121.github.io/agent-workbench-app/').catch(() => {});
              }
            }}
          >
            {t('app.title')}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('app.search')}
              aria-label={t('app.search')}
              data-tauri-no-drag
              style={{
                width: 260,
                maxWidth: '32vw',
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid hsl(var(--input))',
                background: 'hsl(var(--background))',
                fontSize: 13,
                color: 'hsl(var(--foreground))',
                outline: 'none',
              }}
            />
            <Button variant="primary" className="btn-glass-primary" data-tauri-no-drag onClick={() => setCreateOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><path d="M12 5v14M5 12h14" /></svg>
              {t('app.new')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-tauri-no-drag
              aria-label={t('app.update')}
              title={t('app.update')}
              onClick={async () => {
                if (!tauriAvailable()) {
                  showToast(t('app.upToDate'));
                  return;
                }
                try {
                  const res = await invoke<{ available: boolean; version?: string }>('check_for_updates');
                  if (res.available && res.version) {
                    if (window.confirm(t('app.updateAvailable', { version: res.version }))) {
                      showToast(t('app.installing'));
                      await invoke('install_update');
                      showToast(t('app.updateDone'));
                    }
                  } else {
                    showToast(t('app.upToDate'));
                  }
                } catch (e) {
                  showToast(String(e));
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
            </Button>
            <Button variant="ghost" size="icon" data-tauri-no-drag aria-label={t('app.settings')} title={t('app.settings')} onClick={() => setSettingsOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.10a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3" /></svg>
            </Button>
          </div>
        </header>

        {/* 内容区 */}
        <main style={{ padding: '16px 24px 24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px' }}>
            <StagePillNav chips={chips} value={filterStage} onChange={(k) => { setFilterStage(k); setPage(1); }} counts={counts} />
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  color:
                    sync.status === 'ok'
                      ? '#059669'
                      : sync.status === 'offline'
                        ? '#d97706'
                        : sync.status === 'syncing'
                          ? 'hsl(var(--muted-foreground))'
                          : 'hsl(var(--muted-foreground))',
                }}
                title={t('settings.sync')}
              >
                {sync.status === 'syncing' ? '⟳' : sync.status === 'offline' ? '○' : '●'}
              </span>
              {t('list.count', { shown: filtered.length, total: (projects ?? []).length })}
            </div>
          </div>

          {projects !== null && projects.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 20px',
                color: 'hsl(var(--muted-foreground))',
                border: '1px dashed hsl(var(--border))',
                borderRadius: 12,
                background: 'hsl(var(--muted) / 0.3)',
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: 'hsl(var(--foreground))' }}>
                {t('list.noProjects')}
              </h3>
              <p style={{ fontSize: 13, margin: '0 0 16px' }}>{t('list.noProjectsDesc')}</p>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                {t('app.new')}
              </Button>
            </div>
          ) : filtered.length === 0 && projects !== null && projects.length > 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 20px',
                color: 'hsl(var(--muted-foreground))',
                border: '1px dashed hsl(var(--border))',
                borderRadius: 12,
                background: 'hsl(var(--muted) / 0.3)',
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: 'hsl(var(--foreground))' }}>
                {t('list.noMatch')}
              </h3>
              <p style={{ fontSize: 13, margin: 0 }}>{t('list.noMatchDesc')}</p>
            </div>
          ) : (
            <ProjectList
              projects={paged}
              search={search}
              onOpen={(id) => setDetailId(id)}
              onContextMenu={(e, id) => {
                e.preventDefault();
                setCtx({ x: e.clientX, y: e.clientY, id });
              }}
              onReorder={actions.reorder}
            />
          )}

          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 12,
                padding: '10px 12px',
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <div>
                {page} / {totalPages}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Button variant="secondary" style={{ minHeight: 32, padding: '6px 12px' }} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  ‹
                </Button>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                  style={{ minHeight: 32, borderRadius: 8, border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" style={{ minHeight: 32, padding: '6px 12px' }} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  ›
                </Button>
              </div>
            </div>
          )}

          {projects !== null && (
            <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 16, textAlign: 'center' }}>
              {tauriAvailable() ? t('app.dbConnected', { n: projects.length }) : t('app.previewMode')}
            </p>
          )}
        </main>
      </div>

      {/* 新建弹窗 */}
      <CreateProjectDialog
        open={createOpen}
        nextSortIndex={nextSortIndex}
        onCreate={actions.create}
        onClose={() => setCreateOpen(false)}
      />

      {/* 详情抽屉 */}
      {detail && (
        <ProjectDetailDrawer
          project={detail}
          onSave={(p) => {
            actions.save(p);
            showToast(t('detail.saved'));
          }}
          onDelete={(id) => actions.delete(id)}
          onPromptsChange={(prompts) => actions.promptsChange(detail.id, prompts)}
          onClose={() => setDetailId(null)}
        />
      )}

      {/* 右键菜单 */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { key: 'edit', label: t('ctx.edit'), onSelect: () => setDetailId(ctx.id) },
            { key: 'duplicate', label: t('ctx.duplicate'), onSelect: () => actions.duplicate(ctx.id) },
            {
              key: 'copy',
              label: t('ctx.copyName'),
              onSelect: () => {
                const p = (projects ?? []).find((x) => x.id === ctx.id);
                if (p) {
                  void navigator.clipboard?.writeText(p.name);
                  showToast(t('ctx.copied'));
                }
              },
            },
            {
              key: 'delete',
              label: t('ctx.delete'),
              danger: true,
              onSelect: () => {
                if (window.confirm(t('detail.confirmDelete'))) actions.delete(ctx.id);
              },
            },
          ]}
        />
      )}

      {/* 同步冲突弹窗 */}
      {sync.conflict && (
        <ConflictDialog
          remoteCount={sync.conflict.remoteCount}
          localCount={sync.conflict.localCount}
          remoteAt={sync.conflict.remoteAt}
          onChoice={(c) => {
            void sync.resolveConflict(c);
            if (c === 'remote') showToast(t('sync.useRemote'));
            else if (c === 'local') showToast(t('sync.keepLocal'));
          }}
        />
      )}

      {/* 设置抽屉 */}
      {settingsOpen && (
        <SettingsDrawer
          theme={theme}
          setTheme={setTheme}
          syncSettings={sync.settings}
          syncStatus={sync.status}
          onSyncSave={(s) => {
            sync.save(s);
            showToast(s ? t('sync.statusOk') : t('settings.disconnected'));
          }}
          onSyncTest={async (url, token) => {
            try {
              await apiGet(url, token);
              return true;
            } catch {
              return false;
            }
          }}
          onBackupNow={async () => {
            if (!tauriAvailable()) return null;
            try {
              const id = await invoke<string>('backup_now', { note: 'manual' });
              showToast(t('settings.backupCreated', { id }));
              return id;
            } catch (e) {
              showToast(String(e));
              return null;
            }
          }}
          onBackupRestore={async (id) => {
            if (!window.confirm(t('settings.restoreConfirm', { id }))) return false;
            try {
              await invoke('restore_backup', { id });
              showToast(t('settings.restored', { id }));
              return true;
            } catch (e) {
              showToast(String(e));
              return false;
            }
          }}
          onBackupDelete={async (id) => {
            try {
              await invoke('delete_backup', { id });
              return true;
            } catch (e) {
              showToast(String(e));
              return false;
            }
          }}
          onExport={async () => {
            const list = projects ?? [];
            if (tauriAvailable()) {
              try {
                const picked = await invoke<string | null>('plugin:dialog|save', {
                  options: { title: t('settings.export'), filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: 'workbench-export.json' },
                });
                const path = typeof picked === 'string' ? picked : null;
                if (path) {
                  await invoke('export_projects_to_file', { path, projects: list });
                  showToast(path);
                  return;
                }
              } catch (e) {
                rep('[probe] export dialog fail ' + String(e));
              }
            }
            const blob = new Blob([JSON.stringify({ projects: list }, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'workbench-export-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          onImport={async () => {
            if (tauriAvailable()) {
              try {
                const picked = await invoke<string | string[] | null>('plugin:dialog|open', {
                  options: { title: t('settings.import'), filters: [{ name: 'JSON', extensions: ['json'] }], multiple: false },
                });
                const path = typeof picked === 'string' ? picked : Array.isArray(picked) ? picked[0] : null;
                if (path) {
                  const imported = await invoke<Project[]>('import_projects_from_file', { path });
                  if (Array.isArray(imported) && window.confirm(t('settings.importConfirm', { n: imported.length, cur: (projects ?? []).length }))) {
                    persistAndDirty(imported);
                    showToast(t('settings.imported', { n: imported.length }));
                  }
                  return;
                }
              } catch (e) {
                rep('[probe] import dialog fail ' + String(e));
              }
            }
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const data = JSON.parse(await file.text()) as { projects?: Project[] } | Project[];
                const imported = Array.isArray(data) ? data : data.projects;
                if (!Array.isArray(imported)) throw new Error('bad format');
                if (window.confirm(t('settings.importConfirm', { n: imported.length, cur: (projects ?? []).length }))) {
                  persistAndDirty(imported);
                  showToast(t('settings.imported', { n: imported.length }));
                }
              } catch (e) {
                showToast(String(e));
              }
            };
            input.click();
          }}
          onLoadDemo={async () => {
            if (!window.confirm(t('settings.demoConfirm'))) return;
            try {
              if (tauriAvailable()) await invoke('backup_now', { note: 'pre-demo-load' });
              const demo = await fetchDemoProjects();
              persistAndDirty(demo);
              showToast(t('settings.demoLoaded', { n: demo.length }));
            } catch (e) {
              showToast(String(e));
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Toast */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: toast ? 'translateX(-50%) translateY(-4px)' : 'translateX(-50%)',
          background: 'hsl(var(--foreground))',
          color: 'hsl(var(--background))',
          padding: '10px 16px',
          borderRadius: 9999,
          fontSize: 12,
          fontWeight: 500,
          zIndex: 100,
          opacity: toast ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity .2s, transform .2s',
        }}
      >
        {toast}
      </div>

    </>
  );
}
