import { useEffect, useState } from 'react';
import { Cloud, CloudOff, FolderOpen, Save, Trash2, X } from 'lucide-react';
import type { ArchiveStatus, SavedProject } from './archive';
import { MAX_PROJECTS } from './archive';
import { cubes } from './plural';

const when = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_TEXT: Record<ArchiveStatus, string> = {
  connecting: 'Открываю общий архив...',
  online: 'Общий архив: домики видны на всех устройствах',
  offline: 'Нет связи. Видны домики, сохраненные раньше',
  error: 'Общий архив недоступен',
};

export type ProjectsPanelProps = {
  projects: SavedProject[];
  status: ArchiveStatus;
  statusMessage: string;
  openId: string | null;
  suggestedName: string;
  busy: boolean;
  notice: string;
  onClose: () => void;
  onSave: (name: string, mode: 'update' | 'new') => void;
  onOpen: (project: SavedProject) => void;
  onDelete: (project: SavedProject) => void;
};

export default function ProjectsPanel({
  projects,
  status,
  statusMessage,
  openId,
  suggestedName,
  busy,
  notice,
  onClose,
  onSave,
  onOpen,
  onDelete,
}: ProjectsPanelProps) {
  const [name, setName] = useState(suggestedName);

  useEffect(() => setName(suggestedName), [suggestedName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const full = projects.length >= MAX_PROJECTS && !openId;

  return (
    <div className="archive-veil" role="dialog" aria-modal="true" aria-label="Мои домики">
      <section className="archive">
        <header className="archive-top">
          <div>
            <p className="eyebrow">Архив построек</p>
            <h2>Мои домики</h2>
          </div>
          <button className="archive-close" onClick={onClose} aria-label="Закрыть архив">
            <X size={22} />
          </button>
        </header>

        <p className={`archive-status is-${status}`}>
          {status === 'online' ? <Cloud size={16} /> : <CloudOff size={16} />}
          {STATUS_TEXT[status]}
          {statusMessage ? ` (${statusMessage})` : ''}
        </p>

        <div className="archive-save">
          <label htmlFor="project-name">Как назовем домик?</label>
          <input
            id="project-name"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: замок с башней"
          />
          <div className="archive-save-buttons">
            {openId ? (
              <>
                <button className="primary-action" disabled={busy} onClick={() => onSave(name, 'update')}>
                  <Save size={18} /> Сохранить
                </button>
                <button className="secondary-action" disabled={busy || full} onClick={() => onSave(name, 'new')}>
                  Сохранить как новый
                </button>
              </>
            ) : (
              <button className="primary-action" disabled={busy || full} onClick={() => onSave(name, 'new')}>
                <Save size={18} /> Сохранить этот домик
              </button>
            )}
          </div>
          {full ? <p className="archive-note">В архиве уже {MAX_PROJECTS} домиков. Убери лишние, чтобы добавить новый.</p> : null}
          {notice ? <p className="archive-note">{notice}</p> : null}
        </div>

        <div className="archive-list">
          {projects.length === 0 ? (
            <p className="archive-empty">Пока пусто. Построй домик и нажми «Сохранить этот домик».</p>
          ) : (
            projects.map((project) => (
              <article key={project.id} className={`archive-card ${project.id === openId ? 'is-open' : ''}`}>
                {project.thumb ? (
                  <img src={project.thumb} alt={`Домик «${project.name}»`} width={320} height={200} />
                ) : (
                  <div className="archive-nothumb">без картинки</div>
                )}
                <h3>{project.name}</h3>
                <p className="archive-when">
                  {when.format(new Date(project.updatedAt))} · {cubes(project.world.blocks.length)}
                </p>
                <div className="archive-card-buttons">
                  <button className="primary-action" disabled={busy} onClick={() => onOpen(project)}>
                    <FolderOpen size={17} /> Открыть
                  </button>
                  <button className="quiet-action" disabled={busy} onClick={() => onDelete(project)}>
                    <Trash2 size={15} /> Убрать
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
