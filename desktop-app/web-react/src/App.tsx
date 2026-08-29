import { useEffect, useState } from 'react';
import { signalReady, rep, tauriAvailable } from '@/lib/tauri';
import { getProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/api/types';
import { StageGauge, StageBadge } from '@/components/StageGauge';

const SAMPLE = [
  { id: '1', name: 'Agent Workbench', desc: '三端桌面 App · Cloudflare 自动同步', stage: 'idea' as const, letter: 'A' },
  { id: '2', name: 'Summary Agent', desc: '会议纪要自动归档', stage: 'building' as const, letter: 'S' },
  { id: '3', name: 'Landing Copilot', desc: '落地页文案与转化优化', stage: 'live' as const, letter: 'L' },
];

const PILLS = ['全部', '构思中', '开发中', '测试中', '已上线', '已暂停'];

export default function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [filter, setFilter] = useState('全部');

  useEffect(() => {
    rep('[probe] react boot tauri=' + tauriAvailable());
    if (tauriAvailable()) {
      getProjects()
        .then((p) => {
          setProjects(p);
          rep('[probe] react projects=' + p.length);
        })
        .catch((e) => {
          rep('[probe] react get_projects ERROR ' + e);
          setProjects([]);
        });
    } else {
      setProjects([]);
    }
    // 首帧渲染完成后通知 Rust 显示窗口（阶段 1 事件驱动握手）
    signalReady();
  }, []);

  const rows = SAMPLE;

  return (
    <>
      <div className="drag-bar" data-tauri-drag-region />
      <div className="app-shell main-bg">
        {/* 顶部悬浮岛 */}
        <header className="topbar-island" data-tauri-drag-region>
          <span className="brand-title" data-tauri-no-drag>
            Agent Workbench
          </span>
          <span
            style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginLeft: 10, whiteSpace: 'nowrap' }}
          >
            全部 · 23 个项目
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              placeholder="搜索项目…"
              aria-label="搜索"
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
            <button className="btn btn-primary" data-tauri-no-drag>
              新建
            </button>
            <button className="btn btn-ghost" data-tauri-no-drag aria-label="导入" style={{ width: 36, height: 36, padding: 0 }}>
              ↓
            </button>
            <button className="btn btn-ghost" data-tauri-no-drag aria-label="设置" style={{ width: 36, height: 36, padding: 0 }}>
              ⚙
            </button>
          </div>
        </header>

        {/* 内容区 */}
        <main style={{ padding: '16px 24px 24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {/* 统计看板（T0 磨砂） */}
          <div className="usage-bar">
            <div className="usage-stat"><b>23</b><br /><span>项目</span></div>
            <div className="usage-stat"><b>0</b><br /><span>Prompts</span></div>
            <div className="usage-stat"><b>0</b><br /><span>已上线</span></div>
            <div className="usage-stat"><b>○</b><br /><span>代理</span></div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 12 }}>
              {['#d97706', '#2563eb', '#7c3aed', '#059669'].map((c) => (
                <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
              ))}
              <em style={{ fontStyle: 'normal', fontSize: 10, color: 'hsl(var(--muted-foreground))', marginLeft: 4 }}>v0.2.0-react</em>
            </div>
          </div>

          {/* 阶段筛选（原顶栏阶段条） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px' }}>
            <div className="stage-pill">
              {PILLS.map((p, i) => (
                <button
                  key={p}
                  className={`stage-pill-item${filter === p ? ' active' : ''}`}
                  onClick={() => setFilter(p)}
                >
                  {i > 0 && i < PILLS.length - 1 && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: ['#d97706', '#2563eb', '#7c3aed', '#059669'][i - 1] ?? 'hsl(var(--muted-foreground))',
                        display: 'inline-block',
                      }}
                    />
                  )}
                  {p}
                </button>
              ))}
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>23 / 23</span>
          </div>

          {/* 列表骨架（阶段 3 接 react-query 真数据） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} className="list-row" role="button" tabIndex={0}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {r.letter}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-name">{r.name}</div>
                  <div className="list-desc">{r.desc}</div>
                </div>
                <StageGauge stage={r.stage} />
                <StageBadge stage={r.stage} />
                <div className="list-meta">
                  <span>0 Prompts</span>
                  <span>刚刚</span>
                </div>
              </div>
            ))}
          </div>

          {projects !== null && (
            <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 16, textAlign: 'center' }}>
              {tauriAvailable() ? `DB 已连接 · ${projects.length} 个项目` : '浏览器预览模式（无 Tauri）'}
            </p>
          )}
        </main>
      </div>
    </>
  );
}
