import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/lib/api/types';
import { ProjectRow } from './ProjectRow';

interface ProjectListProps {
  projects: Project[];
  search: string;
  onOpen: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onReorder: (ordered: Project[]) => void;
}

function SortableRow({ project, ...rest }: { project: Project } & Omit<ProjectListProps, 'projects' | 'onReorder'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  return (
    <ProjectRow
      project={project}
      search={rest.search}
      dragging={isDragging}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onOpen={() => rest.onOpen(project.id)}
      onContextMenu={(e) => rest.onContextMenu(e, project.id)}
      dndHandleProps={{ ...attributes, ...listeners }}
      dndRef={setNodeRef}
    />
  );
}

/** 项目列表：dnd-kit 拖拽排序（键盘可达 + 8px 激活距离），排序仅在过滤子集内重排 */
export function ProjectList({ projects, onReorder, ...rest }: ProjectListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = projects.findIndex((p) => p.id === active.id);
    const newIdx = projects.findIndex((p) => p.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(projects, oldIdx, newIdx));
  };

  if (projects.length === 0) {
    return (
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
        <p style={{ fontSize: 13, margin: 0 }}>{t('list.noProjectsDesc')}</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.map((p) => (
            <SortableRow key={p.id} project={p} {...rest} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
