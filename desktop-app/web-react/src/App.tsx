import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signalReady, rep, tauriAvailable, openExternal } from '@/lib/tauri';
import { useProjects } from '@/hooks/useProjects';
import { useFilteredProjects, useStageChips } from '@/hooks/useFilteredProjects';
import { usePagination } from '@/hooks/usePagination';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { UsageBar } from '@/components/UsageBar';
import { StagePillNav } from '@/components/StagePillNav';
import { ContextMenu } from '@/components/ContextMenu';
import { Button } from '@/components/ui/button';
import { ProjectList } from '@/features/projects/ProjectList';
import { CreateProjectDialog, uid } from '@/features/projects/CreateProjectDialog';
import { ProjectDetailDrawer } from '@/features/projects/ProjectDetailDrawer';
import type { Project, Prompt } from '@/lib/api/types';
import { STAGES } from '@/lib/api/types';

export default function App() {
  const { t } = useTranslation();
  const { projects, persist } = useProjects();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, langs } = useLanguage();

  const [filterStage, setFilterStage] = useState('all');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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

  const usage = useMemo(() => {
    const list = projects ?? [];
    return {
      total: list.length,
      prompts: list.reduce((s, p) => s + (p.prompts || []).length, 0),
      live: list.filter((p) => p.stage === 'live').length,
    };
  }, [projects]);

  const nextSortIndex = useMemo(() => Math.max(0, ...(projects ?? []).map((p) => p.sort_index || 0)) + 1, [projects]);

  const actions = useMemo(
    () => ({
      create: (p: Project) => {
        const next = [...(projects ?? []), p];
        persist(next);
        setCreateOpen(false);
        showToast(t('create.created'));
      },
      save: (p: Project) => {
        persist((projects ?? []).map((x) => (x.id === p.id ? p : x)));
        showToast(t('detail.saved'));
      },
      delete: (id: string) => {
        persist((projects ?? []).filter((x) => x.id !== id));
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
        persist([...(projects ?? []), copy]);
        showToast(t('create.duplicated'));
      },
      reorder: (ordered: Project[]) => {
        const orderedIds = new Set(ordered.map((p) => p.id));
        const rest = (projects ?? []).filter((p) => !orderedIds.has(p.id));
        const next = [...ordered, ...rest].map((p, i) => ({ ...p, sort_index: i, updatedAt: p.updatedAt }));
        persist(next);
      },
      promptsChange: (id: string, prompts: Prompt[]) => {
        persist((projects ?? []).map((x) => (x.id === id ? { ...x, prompts, updatedAt: new Date().toISOString() } : x)));
      },
    }),
    [projects, persist, showToast, t],
  );

  useGlobalShortcuts({
    onNew: () => setCreateOpen(true),
    onFocusSearch: () => searchRef.current?.focus(),
    onSettings: () => showToast(t('app.settings') + ' (Phase 5)'),
    onEscape: () => {
      setCtx(null);
      setDetailId(null);
      setCreateOpen(false);
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
            <Button variant="primary" data-tauri-no-drag onClick={() => setCreateOpen(true)}>
              {t('app.new')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-tauri-no-drag
              aria-label={t('app.lang')}
              title={t('app.lang')}
              onClick={() => {
                const idx = langs.findIndex((l) => l.code === lang);
                const next = langs[(idx + 1) % langs.length];
                setLang(next.code);
                showToast(next.label);
              }}
            >
              🌐
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-tauri-no-drag
              aria-label={t('app.theme')}
              title={t('app.theme')}
              onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
            >
              {theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '🖥'}
            </Button>
            <Button variant="ghost" size="icon" data-tauri-no-drag aria-label={t('app.settings')} title={t('app.settings')}>
              ⚙
            </Button>
          </div>
        </header>

        {/* 内容区 */}
        <main style={{ padding: '16px 24px 24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          <UsageBar total={usage.total} prompts={usage.prompts} live={usage.live} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px' }}>
            <StagePillNav chips={chips} value={filterStage} onChange={(k) => { setFilterStage(k); setPage(1); }} counts={counts} />
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
              {t('list.count', { shown: filtered.length, total: (projects ?? []).length })}
            </span>
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
