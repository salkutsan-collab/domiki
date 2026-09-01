import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  FolderOpen,
  Hammer,
  Hand,
  House,
  Layers,
  Maximize2,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  TabletSmartphone,
  Target,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { ArchiveStatus, OpenMark, SavedProject } from './archive';
import {
  MAX_BLOCKS,
  cleanName,
  deleteProject,
  readOpenMark,
  saveProject,
  watchArchive,
  writeOpenMark,
} from './archive';
import ProjectsPanel from './projects-panel';
import { makeThumbnail } from './thumbnail';
import type { Camera, View } from './camera';
import { DEFAULT_CAMERA, clampCamera, turnCamera } from './camera';
import type { Cell, Face } from './hit';
import { pickFace, placementTarget } from './hit';
import { drawScene } from './render';
import { useGestures } from './use-gestures';
import type { Block, Material, World } from './world';
import {
  MATERIALS,
  MAX_HEIGHT,
  blockAt,
  boundsForBlocks,
  defaultBounds,
  grownBounds,
  insideBounds,
  loadWorld,
  makeHouse,
  saveWorld,
  starterWorld,
  topFloor,
} from './world';

const CANVAS: View = { width: 1100, height: 650 };
const HINT_TIME = 3000;

type Mode = 'build' | 'erase' | 'look';

const MODE_HINTS: Record<Mode, string> = {
  build: 'Нажми на полянку - кубик встанет сверху. Нажми на боковую стенку - кубик прилипнет сбоку',
  erase: 'Нажми на кубик, чтобы его убрать',
  look: 'Веди пальцем - полянка крутится. Два пальца - приближение и сдвиг',
};

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faces = useRef<Face[]>([]);
  const [world, setWorld] = useState<World>(starterWorld);
  const [history, setHistory] = useState<World[]>([]);
  const [material, setMaterial] = useState<Material>('wood');
  const [mode, setMode] = useState<Mode>('build');
  const [camera, setCameraState] = useState<Camera>(DEFAULT_CAMERA);
  const [floorLimit, setFloorLimit] = useState<number | null>(null);
  const [xray, setXray] = useState(false);
  const [hovered, setHovered] = useState<Face | null>(null);
  const [hint, setHint] = useState(MODE_HINTS.build);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatus>('connecting');
  const [archiveMessage, setArchiveMessage] = useState('');
  const [openMark, setOpenMark] = useState<OpenMark | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const built = topFloor(world.blocks);
  const floors = floorLimit === null ? MAX_HEIGHT : Math.min(floorLimit, built);
  const sliderValue = floorLimit === null ? built : Math.min(floorLimit, built);

  const setCamera = useCallback((change: (camera: Camera) => Camera) => {
    setCameraState((current) => clampCamera(change(current)));
  }, []);

  const showHint = useCallback((text: string) => setHint(text), []);

  useEffect(() => {
    const stored = loadWorld();
    if (stored) setWorld(stored);
    setOpenMark(readOpenMark());
    setReady(true);
  }, []);

  // К архиву подключаемся не сразу, а когда игра уже нарисована: библиотека базы
  // весит больше самой игры, и ждать ее на старте незачем.
  useEffect(() => {
    let stop = () => {};
    const timer = window.setTimeout(() => {
      stop = watchArchive({
        onProjects: setProjects,
        onStatus: (status, message) => {
          setArchiveStatus(status);
          setArchiveMessage(message ?? '');
        },
      });
    }, 1200);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveWorld(world);
    setSaved(true);
    const timer = window.setTimeout(() => setSaved(false), 900);
    return () => window.clearTimeout(timer);
  }, [world, ready]);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(''), HINT_TIME);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const remember = useCallback((next: World) => {
    setWorld((current) => {
      setHistory((items) => [...items.slice(-24), current]);
      return next;
    });
  }, []);

  const target = useMemo<Cell | null>(() => {
    if (!hovered || mode === 'look') return null;
    if (mode === 'erase') {
      return hovered.kind === 'ground' ? null : { x: hovered.x, z: hovered.z, y: hovered.y };
    }
    const cell = placementTarget(hovered);
    if (cell.y >= MAX_HEIGHT || !insideBounds(world.bounds, cell.x, cell.z)) return null;
    if (blockAt(world.blocks, cell.x, cell.z, cell.y)) return null;
    return cell;
  }, [hovered, mode, world]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    faces.current = drawScene(ctx, CANVAS, {
      blocks: world.blocks,
      bounds: world.bounds,
      camera,
      floors,
      xray,
      ghost: mode === 'build' ? target : null,
      ghostType: material,
      erase: mode === 'erase' ? target : null,
    });
  }, [world, camera, floors, xray, mode, target, material]);

  const locate = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: ((clientX - rect.left) / rect.width) * CANVAS.width,
      y: ((clientY - rect.top) / rect.height) * CANVAS.height,
    };
    return pickFace(faces.current, point);
  }, []);

  const place = useCallback(
    (face: Face) => {
      const cell = placementTarget(face);
      if (cell.y >= MAX_HEIGHT) {
        showHint('Выше уже некуда - тут предел высоты');
        return;
      }
      if (!insideBounds(world.bounds, cell.x, cell.z)) return;
      if (blockAt(world.blocks, cell.x, cell.z, cell.y)) return;
      const block: Block = { x: cell.x, z: cell.z, y: cell.y, type: material };
      remember({
        blocks: [...world.blocks, block],
        bounds: grownBounds(world.bounds, cell.x, cell.z),
      });
      // Кубик выше показанных этажей иначе пропал бы из вида.
      if (floorLimit !== null && cell.y >= floorLimit) setFloorLimit(cell.y + 1);
      navigator.vibrate?.(12);
    },
    [floorLimit, material, remember, showHint, world],
  );

  const erase = useCallback(
    (face: Face) => {
      if (face.kind === 'ground') return;
      remember({
        blocks: world.blocks.filter(
          (block) => !(block.x === face.x && block.z === face.z && block.y === face.y),
        ),
        bounds: world.bounds,
      });
      navigator.vibrate?.(12);
    },
    [remember, world],
  );

  const gestures = useGestures({
    rotateWithOneFinger: mode === 'look',
    onTap: (clientX, clientY) => {
      const face = locate(clientX, clientY);
      if (!face) return;
      if (mode === 'erase') erase(face);
      else place(face);
    },
    onHover: (clientX, clientY) => setHovered(locate(clientX, clientY)),
    onHoverEnd: () => setHovered(null),
    onCamera: setCamera,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      gestures.wheel(event.deltaY);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [gestures]);

  const undo = useCallback(() => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (previous) setWorld(previous);
      return items.slice(0, -1);
    });
  }, []);

  const chooseMode = useCallback(
    (next: Mode) => {
      setMode(next);
      setHovered(null);
      showHint(MODE_HINTS[next]);
    },
    [showHint],
  );

  const chooseMaterial = useCallback(
    (next: Material) => {
      setMaterial(next);
      setMode('build');
      showHint(`Выбран кубик: ${MATERIALS[next].name}`);
    },
    [showHint],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keys = Object.keys(MATERIALS) as Material[];
      const index = Number(event.key) - 1;
      if (index >= 0 && index < keys.length) chooseMaterial(keys[index]);
      if (event.key.toLowerCase() === 'r') setCamera((current) => turnCamera(current, 1));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chooseMaterial, setCamera, undo]);

  const resetWorld = () => {
    if (!window.confirm('Очистить всю полянку и начать заново?')) return;
    remember({ blocks: [], bounds: defaultBounds() });
    setFloorLimit(null);
    setCameraState(DEFAULT_CAMERA);
    rememberOpen(null);
  };

  const buildExample = () => {
    if (world.blocks.length > 3 && !window.confirm('Заменить текущую постройку готовым домиком?')) return;
    const blocks = makeHouse(world.bounds);
    remember({ blocks, bounds: boundsForBlocks(world.bounds, blocks) });
    setFloorLimit(null);
    rememberOpen(null);
    chooseMode('build');
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* Полный экран есть не во всех браузерах Android. */ }
  };

  const changeFloors = (value: number) => {
    setFloorLimit(value >= built ? null : value);
    showHint(value >= built ? 'Видно все этажи' : `Видно этажей: ${value}`);
  };

  const toggleXray = () => {
    setXray((current) => {
      showHint(current ? 'Стены снова обычные' : 'Стены просвечивают - домик видно насквозь');
      return !current;
    });
  };

  const resetView = () => {
    setCameraState(DEFAULT_CAMERA);
    showHint('Вид как в начале');
  };

  const rememberOpen = (mark: OpenMark | null) => {
    setOpenMark(mark);
    writeOpenMark(mark);
  };

  const saveToArchive = async (name: string, mode: 'update' | 'new') => {
    if (!world.blocks.length) {
      setNotice('Полянка пустая - сначала построй домик');
      return;
    }
    if (world.blocks.length > MAX_BLOCKS) {
      setNotice(`Кубиков больше ${MAX_BLOCKS} - такой домик в архив не влезет`);
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const updating = mode === 'update' && openMark ? openMark : null;
      const id = await saveProject({
        id: updating?.id,
        createdAt: updating?.createdAt,
        name,
        world,
        thumb: makeThumbnail(world),
      });
      rememberOpen({ id, name: cleanName(name), createdAt: updating?.createdAt ?? Date.now() });
      setNotice(updating ? 'Домик обновлен в общем архиве' : 'Домик сохранен в общий архив');
    } catch (error) {
      setNotice(`Не удалось сохранить: ${error instanceof Error ? error.message : 'нет связи'}`);
    } finally {
      setBusy(false);
    }
  };

  const openFromArchive = (project: SavedProject) => {
    const ask = `Открыть домик «${project.name}»? Постройка на полянке заменится.`;
    if (world.blocks.length && !window.confirm(ask)) return;
    remember(project.world);
    rememberOpen({ id: project.id, name: project.name, createdAt: project.createdAt });
    setFloorLimit(null);
    setCameraState(DEFAULT_CAMERA);
    setPanelOpen(false);
    chooseMode('build');
    showHint(`Открыт домик: ${project.name}`);
  };

  const removeFromArchive = async (project: SavedProject) => {
    if (!window.confirm(`Убрать домик «${project.name}» из архива? Насовсем.`)) return;
    setBusy(true);
    try {
      await deleteProject(project.id);
      if (openMark?.id === project.id) rememberOpen(null);
      setNotice(`Домик «${project.name}» убран из архива`);
    } catch (error) {
      setNotice(`Не удалось убрать: ${error instanceof Error ? error.message : 'нет связи'}`);
    } finally {
      setBusy(false);
    }
  };

  const boardSize = `${world.bounds.maxX - world.bounds.minX + 1} на ${world.bounds.maxZ - world.bounds.minZ + 1}`;

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-cube" aria-hidden="true">◆</span>
          <div>
            <p className="eyebrow">Твоя строительная полянка</p>
            <h1>Домики</h1>
          </div>
        </div>
        <div className="top-actions">
          <button className="fullscreen-button" onClick={toggleFullscreen}>
            <Maximize2 size={18} /> Во весь экран
          </button>
          <div className={`save-status ${saved ? 'is-saving' : ''}`} aria-live="polite">
            <Save size={17} /> {saved ? 'Сохранено!' : 'Всё сохранится само'}
          </div>
        </div>
      </header>
      <div className="rotate-tip">
        <TabletSmartphone size={20} />
        <span>Поверни планшет боком - так строить удобнее</span>
      </div>
      <section className="workspace" aria-label="Игра Домики">
        <aside className="toolbox">
          <div className="toolbox-title"><Hammer size={20} /><span>Выбери кубик</span></div>
          <div className="materials" role="list" aria-label="Материалы">
            {(Object.entries(MATERIALS) as [Material, (typeof MATERIALS)[Material]][]).map(([key, item], index) => (
              <button
                key={key}
                className={`material ${material === key && mode === 'build' ? 'active' : ''}`}
                onClick={() => chooseMaterial(key)}
                aria-pressed={material === key && mode === 'build'}
                title={`Клавиша ${index + 1}`}
              >
                <span
                  className="material-swatch"
                  style={{ '--swatch': item.color, '--swatch-top': item.top } as React.CSSProperties}
                />
                <span>{item.name}</span>
                <kbd>{index + 1}</kbd>
              </button>
            ))}
          </div>
          <button
            className={`eraser ${mode === 'erase' ? 'active' : ''}`}
            onClick={() => chooseMode('erase')}
            aria-pressed={mode === 'erase'}
          >
            <Trash2 size={20} /> Убрать кубик
          </button>
          <button
            className={`looker ${mode === 'look' ? 'active' : ''}`}
            onClick={() => chooseMode(mode === 'look' ? 'build' : 'look')}
            aria-pressed={mode === 'look'}
          >
            <Hand size={20} /> {mode === 'look' ? 'Смотрю вокруг' : 'Смотреть вокруг'}
          </button>
        </aside>
        <div className="play-area">
          <canvas
            ref={canvasRef}
            width={CANVAS.width}
            height={CANVAS.height}
            aria-label="Полянка для строительства из кубиков"
            {...gestures.handlers}
          />
          {hint ? <div className="hint-bubble"><Sparkles size={16} />{hint}</div> : null}
          <div className="view-controls" aria-label="Поворот полянки">
            <button onClick={() => setCamera((current) => turnCamera(current, -1))} aria-label="Повернуть влево">
              <RotateCcw size={22} />
            </button>
            <span>Повернуть</span>
            <button onClick={() => setCamera((current) => turnCamera(current, 1))} aria-label="Повернуть вправо">
              <RotateCw size={22} />
            </button>
            <button onClick={resetView} aria-label="Вид как в начале" title="Вид как в начале">
              <Target size={22} />
            </button>
          </div>
        </div>
        <aside className="actions">
          <div className="view-panel">
            <label className="view-row" htmlFor="floors">
              <span className="view-label"><Layers size={17} /> Видно этажей</span>
              <strong>{floorLimit === null ? 'все' : sliderValue}</strong>
            </label>
            <input
              id="floors"
              type="range"
              min={1}
              max={built}
              step={1}
              value={sliderValue}
              onChange={(event) => changeFloors(Number(event.target.value))}
              disabled={built < 2}
            />
            <button className={`xray-action ${xray ? 'active' : ''}`} onClick={toggleXray} aria-pressed={xray}>
              <Eye size={18} /> Просветить стены
            </button>
          </div>
          <div className="mission-card">
            <span className="mission-icon"><House size={26} /></span>
            <p className="eyebrow">Идея для старта</p>
            <h2>Построй уютный дом</h2>
            <p>Сделай стены, добавь голубые окошки, а крышу вынеси за стены - нажимай на боковые стенки кубиков.</p>
          </div>
          <button className="primary-action" onClick={buildExample}><House size={19} /> Показать домик</button>
          <button className="secondary-action" onClick={undo} disabled={!history.length}>
            <Undo2 size={19} /> Отменить шаг
          </button>
          <button
            className="archive-action"
            onClick={() => {
              setNotice('');
              setPanelOpen(true);
            }}
          >
            <FolderOpen size={19} /> Мои домики
            {projects.length ? <span className="archive-count">{projects.length}</span> : null}
          </button>
          <button className="quiet-action" onClick={resetWorld}><RotateCcw size={17} /> Новая полянка</button>
          <div className="counter">
            <strong>{world.blocks.length}</strong>
            <span>
              кубиков на полянке<br />полянка {boardSize}
              {openMark ? <><br />домик «{openMark.name}»</> : null}
            </span>
          </div>
        </aside>
      </section>
      {panelOpen ? (
        <ProjectsPanel
          projects={projects}
          status={archiveStatus}
          statusMessage={archiveMessage}
          openId={openMark?.id ?? null}
          suggestedName={openMark?.name ?? ''}
          busy={busy}
          notice={notice}
          onClose={() => setPanelOpen(false)}
          onSave={saveToArchive}
          onOpen={openFromArchive}
          onDelete={removeFromArchive}
        />
      ) : null}
    </main>
  );
}
